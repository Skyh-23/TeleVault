"""
TeleVault Android Stream Server
================================
A tiny local HTTP server (localhost only) that serves decrypted file blocks
with HTTP Range support — the Android equivalent of the desktop `/stream`
endpoint. Media players (VideoView / MediaPlayer / ExoPlayer) connect to
http://127.0.0.1:<port>/stream?path=<messageId>&folderId=<id> and can seek
because Range requests are honoured.

The Telethon client lives on the shared asyncio loop from android_commands,
so every network operation is scheduled through run_coroutine_threadsafe.

Author: Liethueis-Foundation © 2026
"""

import asyncio
import base64
import concurrent.futures
import hashlib
import json
import os
import shutil
import threading
import time
from http.server import BaseHTTPRequestHandler, ThreadingHTTPServer
from urllib.parse import urlparse, parse_qs

from aes_gcm_crypto import AESGCMCrypto
from config import DATA_DIR
from televault_crypto import secure_random_bytes
from vault import derive_master_key, load_vault_key

_loop = None
_telegram = None
_server = None
_server_thread = None
_server_port = None

# ── Stream-priority coordination ─────────────────────────────────────
# The background folder sync and the stream server share ONE asyncio loop.
# A long sync (scanning every folder + downloading every manifest) can starve
# the stream requests, so the sync checks this flag and stops as soon as a
# stream request arrives — video playback always wins.
_stream_active_since = None
_stream_active_lock = threading.Lock()


def _mark_stream_active():
    global _stream_active_since
    with _stream_active_lock:
        _stream_active_since = time.time()


def is_stream_active(timeout: float = 15.0) -> bool:
    """True when a stream request arrived recently (thread-safe)."""
    with _stream_active_lock:
        return _stream_active_since is not None and (time.time() - _stream_active_since) < timeout

# In-memory decrypted block cache (small, FIFO). Speeds up seek-back playback
# without hammering Telegram. Each media block is 5 MiB, so cap is modest.
_MAX_CACHE_BLOCKS = 12
_block_cache = {}
_block_cache_lock = threading.Lock()

# ── Manifest cache ──────────────────────────────────────────────────
# Android media players issue MANY HTTP requests per video (moov probe,
# data reads, seeks). Each request used to re-download + decrypt the manifest
# from Telegram — a huge start-latency cost. Cache it in memory for the life
# of the stream server (which runs for the whole app session).
_manifest_cache = {}
_MANIFEST_CACHE_MAX = 128

# ── Encrypted on-disk block cache ───────────────────────────────────
# Decrypted blocks are stored at rest as AES-256-GCM ciphertext keyed by a
# key derived from the vault key (same pattern as the thumbnail cache).
# Repeat plays and seek-backs become instant — no Telegram round trips.
_STREAM_CACHE_MAGIC = b"TVST"  # TeleVault STream
_STREAM_CACHE_MAX_FILES = 600
_STREAM_CACHE_MAX_BYTES = 768 * 1024 * 1024
# NOTE: this variable must NOT share its name with the _stream_cache_dir()
# function below — a shadowed name made every stream request fail with
# "expected str, bytes or os.PathLike object, not function".
_stream_cache_dir_path = None
_stream_cache_prune_counter = 0

# Per-block in-flight locks: concurrent range requests can hit the same
# block, and we never want two HTTP threads downloading the same 5 MiB block
# from Telegram twice.
_inflight_locks = {}
_inflight_locks_lock = threading.Lock()

# Bytes per HTTP response write (keeps memory usage flat while streaming).
_CHUNK = 256 * 1024


def configure(loop, telegram):
    """Attach the shared asyncio loop and Telethon client."""
    global _loop, _telegram
    _loop = loop
    _telegram = telegram


def _cached_block(key):
    with _block_cache_lock:
        return _block_cache.get(key)


def _store_block(key, data):
    with _block_cache_lock:
        _block_cache[key] = data
        while len(_block_cache) > _MAX_CACHE_BLOCKS:
            _block_cache.pop(next(iter(_block_cache)), None)


# ── On-disk encrypted block cache ───────────────────────────────────

def _stream_cache_path(file_message_id, folder_id, block_idx):
    d = _stream_cache_dir()
    if not d:
        return None
    key = hashlib.sha256(f"{file_message_id}|{folder_id}|{block_idx}".encode("utf-8")).hexdigest()
    return os.path.join(d, key + ".tvblk")


def _stream_cache_dir():
    global _stream_cache_dir_path
    if _stream_cache_dir_path is None:
        path = os.path.join(DATA_DIR, "stream_cache")
        try:
            os.makedirs(path, exist_ok=True)
        except OSError:
            path = None
        _stream_cache_dir_path = path
    return _stream_cache_dir_path


def _stream_cache_key() -> bytes:
    return hashlib.sha256(b"TeleVault-Stream-Cache-v1:" + load_vault_key()).digest()


def _stream_cache_read(path):
    if not path or not os.path.isfile(path):
        return None
    try:
        with open(path, "rb") as f:
            blob = f.read()
        if len(blob) < len(_STREAM_CACHE_MAGIC) + 32 + 12 + 16:
            return None
        if blob[:len(_STREAM_CACHE_MAGIC)] != _STREAM_CACHE_MAGIC:
            return None
        salt = blob[len(_STREAM_CACHE_MAGIC):len(_STREAM_CACHE_MAGIC) + 32]
        payload = blob[len(_STREAM_CACHE_MAGIC) + 32:]
        crypto = AESGCMCrypto(_stream_cache_key(), salt)
        try:
            return crypto.decrypt_block(payload, 0)
        finally:
            crypto.close()
    except Exception:
        return None


def _stream_cache_write(path, decrypted):
    if not path:
        return
    global _stream_cache_prune_counter
    try:
        salt = secure_random_bytes(32)
        crypto = AESGCMCrypto(_stream_cache_key(), salt)
        try:
            encrypted = crypto.encrypt_block(decrypted, 0)
        finally:
            crypto.close()
        tmp = path + ".tmp"
        with open(tmp, "wb") as f:
            f.write(_STREAM_CACHE_MAGIC + salt + encrypted)
        os.replace(tmp, path)
        _stream_cache_prune_counter += 1
        if _stream_cache_prune_counter % 10 == 0:
            _stream_cache_prune()
    except Exception:
        pass


def _stream_cache_prune():
    """Evict oldest cached blocks when the cache exceeds its limits."""
    try:
        d = _stream_cache_dir()
        if not d:
            return
        entries = []
        total = 0
        for name in os.listdir(d):
            p = os.path.join(d, name)
            try:
                st = os.stat(p)
                entries.append((st.st_mtime, p, st.st_size))
                total += st.st_size
            except OSError:
                pass
        if len(entries) <= _STREAM_CACHE_MAX_FILES and total <= _STREAM_CACHE_MAX_BYTES:
            return
        entries.sort()
        keep = max(1, int(len(entries) * 0.7))
        for _, p, _ in entries[:len(entries) - keep]:
            try:
                os.remove(p)
            except OSError:
                pass
    except Exception:
        pass


def clear_cache():
    """Drop all cached manifests and stream blocks (called from clean-cache)."""
    global _stream_cache_dir_path, _stream_cache_prune_counter
    _block_cache.clear()
    _manifest_cache.clear()
    _stream_cache_prune_counter = 0
    try:
        d = _stream_cache_dir()
        if d and os.path.isdir(d):
            shutil.rmtree(d, ignore_errors=True)
            os.makedirs(d, exist_ok=True)
    except Exception:
        pass


_RUN_CORO_TIMEOUT = 90.0  # throttled mobile links pull blocks at ~0.5 Mbps (2.2 MiB ≈ 33s, 5 MiB ≈ 80s). Too tight a bound killed downloads just before they finished, then restarted them endlessly.


def _log(msg: str) -> None:
    """Visible in logcat as python.stdout — the stream server's only voice."""
    try:
        print(f"[stream] {msg}", flush=True)
    except Exception:
        pass


def _run_coro(coro):
    """Run a coroutine on the shared loop from the HTTP server thread.

    Bounded so a dead/hung Telegram connection returns a clean error to the
    media player instead of blocking the request forever. On timeout the
    orphaned coroutine is CANCELLED so it can't keep eating bandwidth.
    """
    future = asyncio.run_coroutine_threadsafe(coro, _loop)
    try:
        return future.result(timeout=_RUN_CORO_TIMEOUT)
    except concurrent.futures.TimeoutError:
        try:
            future.cancel()
        except Exception:
            pass
        raise RuntimeError("Telegram timed out while preparing the stream")


def _telegram_ready():
    """True when the Telethon client is connected and authorized.

    Checks the REAL socket state (is_connected), not just our own flag — the
    flag goes stale the moment the network drops, and trusting it made the
    stream server hang waiting on a dead connection.
    """
    client = getattr(_telegram, "client", None)
    if not client or not getattr(_telegram, "_connected", False):
        return False
    try:
        return bool(client.is_connected())
    except Exception:
        return False


async def _telegram_reconnect():
    """Best-effort reconnect used right before streaming.

    When the socket is dead we do a CLEAN disconnect+connect instead of
    relying on Telethon's background auto-reconnect, so any stuck in-flight
    requests are dropped immediately rather than queuing behind a broken
    MTProto connection.
    """
    client = getattr(_telegram, "client", None)
    if not client:
        return False
    try:
        if client.is_connected():
            # Socket looks alive — verify the session with a real RPC.
            if await asyncio.wait_for(client.is_user_authorized(), timeout=5):
                _telegram._connected = True
                return True
            return False
        # Socket is dead — tear down cleanly, then rebuild.
        try:
            await asyncio.wait_for(client.disconnect(), timeout=5)
        except Exception:
            pass
        await asyncio.wait_for(client.connect(), timeout=8)
        if await asyncio.wait_for(client.is_user_authorized(), timeout=5):
            _telegram._connected = True
            return True
    except Exception:
        pass
    return False


class _StreamHandler(BaseHTTPRequestHandler):
    protocol_version = "HTTP/1.1"

    def log_message(self, fmt, *args):
        # Keep logs quiet on Android.
        pass

    def _send_headers(self, status, content_type, content_length, extra=None):
        self.send_response(status)
        self.send_header("Content-Type", content_type)
        self.send_header("Content-Length", str(content_length))
        self.send_header("Accept-Ranges", "bytes")
        self.send_header("Cache-Control", "no-store")
        if extra:
            for key, value in extra.items():
                self.send_header(key, value)
        self.end_headers()

    def do_GET(self):
        parsed = urlparse(self.path)
        if parsed.path == "/health":
            body = json.dumps({"ok": True}).encode("utf-8")
            self._send_headers(200, "application/json", len(body))
            self.wfile.write(body)
            return
        if parsed.path != "/stream":
            self._send_headers(404, "text/plain", 9)
            self.wfile.write(b"Not Found")
            return

        query = parse_qs(parsed.query)
        try:
            file_message_id = int((query.get("path") or [""])[0])
        except (TypeError, ValueError):
            self._send_headers(400, "text/plain", 11)
            self.wfile.write(b"Bad Request")
            return

        folder_id_raw = (query.get("folderId") or [""])[0]
        folder_id = None
        if folder_id_raw not in ("", "null", "None"):
            try:
                folder_id = int(folder_id_raw)
            except (TypeError, ValueError):
                folder_id = None

        _mark_stream_active()
        _log(
            f"GET path={file_message_id} folder={folder_id} "
            f"range={self.headers.get('Range') or 'full'}"
        )

        if not _telegram_ready():
            # Try one quick reconnect (bounded) before failing the request —
            # playback can recover on its own when the connection just dropped.
            try:
                reconnected = _run_coro(_telegram_reconnect())
            except Exception:
                reconnected = False
            if not reconnected:
                # Don't let the player hang — fail fast with a clear status so
                # the UI can show a helpful message instead of an endless spinner.
                _log("503 not connected (reconnect failed)")
                self._send_headers(503, "text/plain", 25)
                self.wfile.write(b"Telegram not connected")
                return
            _log("reconnected ok")

        try:
            vault_key = load_vault_key()
            t0 = time.time()
            manifest = _run_coro(_telegram_get_manifest(file_message_id, folder_id))
            _log(
                f"manifest ok: blocks={len(manifest.get('block_message_ids', []))} "
                f"size={manifest.get('size')} in {time.time() - t0:.2f}s"
            )
        except Exception as exc:
            # Fail fast with a retryable 503 — the player re-issues the request
            # shortly after, and _telegram_ready() attempts a fresh reconnect
            # on the next attempt. Never hang the request on a dead link.
            _log(f"manifest failed: {exc}")
            try:
                self._send_headers(503, "text/plain", 27)
                self.wfile.write(b"Stream unavailable, retrying")
            except (BrokenPipeError, ConnectionResetError):
                pass
            return

        if manifest is None:
            try:
                self._send_headers(404, "text/plain", 11)
                self.wfile.write(b"Not Found")
            except (BrokenPipeError, ConnectionResetError):
                pass
            return

        try:
            if manifest.get("password_protected"):
                _log("403 password-protected")
                self._send_headers(403, "text/plain", 16)
                self.wfile.write(b"Password required")
                return

            mime_type = str(manifest.get("mime", "application/octet-stream") or "application/octet-stream")
            file_size = int(manifest.get("size", 0) or 0)
            block_size = int(manifest.get("block_size", 5 * 1024 * 1024) or (5 * 1024 * 1024))
            block_ids = manifest.get("block_message_ids", [])

            if block_size <= 0:
                raise ValueError("Invalid block size")
            if file_size > 0 and not block_ids:
                raise ValueError("Missing block IDs")

            salt = base64.b64decode(manifest["salt"])
            master_key = derive_master_key(vault_key, salt)
            crypto = AESGCMCrypto(master_key, salt)
            _log(f"stream {file_message_id}: {file_size}B {len(block_ids)} blocks mime={mime_type}")
        except Exception as exc:
            _log(f"manifest parse FAIL: {exc}")
            try:
                self._send_headers(500, "text/plain", len(str(exc).encode("utf-8")))
                self.wfile.write(str(exc).encode("utf-8"))
            except (BrokenPipeError, ConnectionResetError):
                pass
            return

        try:
            self._stream_file(
                crypto=crypto,
                file_message_id=file_message_id,
                folder_id=folder_id,
                manifest=manifest,
                mime_type=mime_type,
                file_size=file_size,
                block_size=block_size,
                block_ids=block_ids,
            )
        except (BrokenPipeError, ConnectionResetError):
            pass
        except Exception as exc:
            _log(f"stream error: {exc}")
            try:
                self._send_headers(500, "text/plain", len(str(exc).encode("utf-8")))
                self.wfile.write(str(exc).encode("utf-8"))
            except (BrokenPipeError, ConnectionResetError):
                pass
        finally:
            try:
                crypto.close()
            except Exception:
                pass

    def _stream_file(self, crypto, file_message_id, folder_id, manifest, mime_type,
                     file_size, block_size, block_ids):
        if file_size == 0:
            self._send_headers(200, mime_type, 0)
            return

        # ── Parse Range header ─────────────────────────────────────────
        range_header = self.headers.get("Range")
        start = 0
        end = file_size - 1

        if range_header:
            try:
                range_spec = range_header.replace("bytes=", "", 1).strip()
                start_part, end_part = range_spec.split("-", 1)
                if start_part:
                    start = int(start_part)
                    end = int(end_part) if end_part else file_size - 1
                else:
                    suffix_size = int(end_part)
                    if suffix_size <= 0:
                        raise ValueError("Invalid suffix size")
                    start = max(file_size - suffix_size, 0)
                    end = file_size - 1
            except Exception:
                self.send_error(416, "Invalid Range header")
                return

        if start >= file_size or start < 0 or end < 0:
            self.send_error(416, "Range not satisfiable")
            return
        end = min(end, file_size - 1)
        if end < start:
            self.send_error(416, "Range not satisfiable")
            return

        content_length = end - start + 1
        is_partial = range_header is not None
        extra = None
        if is_partial:
            extra = {"Content-Range": f"bytes {start}-{end}/{file_size}"}

        self._send_headers(206 if is_partial else 200, mime_type, content_length, extra)

        start_block = start // block_size
        end_block = end // block_size

        t0 = time.time()
        bytes_sent = 0
        for block_idx in range(start_block, min(end_block + 1, len(block_ids))):
            decrypted = self._fetch_block(crypto, file_message_id, folder_id, block_ids, block_idx)
            if not decrypted:
                raise ValueError(f"Block {block_idx} unavailable")

            block_start_byte = block_idx * block_size
            slice_start = max(start - block_start_byte, 0)
            slice_end = min(end - block_start_byte + 1, len(decrypted))

            if slice_start >= slice_end:
                continue

            chunk = decrypted[slice_start:slice_end]
            for offset in range(0, len(chunk), _CHUNK):
                self.wfile.write(chunk[offset:offset + _CHUNK])
            bytes_sent += len(chunk)
            if bytes_sent >= content_length:
                break
        _log(f"served bytes {start}-{end} ({content_length}b) in {time.time() - t0:.2f}s")

    def _fetch_block(self, crypto, file_message_id, folder_id, block_ids, block_idx):
        # Message IDs are unique per peer, so folder_id must be part of the
        # key or manifests in different folders could collide.
        cache_key = (file_message_id, folder_id, block_idx)
        cached = _cached_block(cache_key)
        if cached is not None:
            return cached

        with _inflight_locks_lock:
            lock = _inflight_locks.get(cache_key) or threading.Lock()
            _inflight_locks[cache_key] = lock

        with lock:
            try:
                # Another HTTP thread may have fetched it while we waited.
                cached = _cached_block(cache_key)
                if cached is not None:
                    return cached

                disk_path = _stream_cache_path(file_message_id, folder_id, block_idx)
                decrypted = _stream_cache_read(disk_path)
                if decrypted is None:
                    t0 = time.time()
                    encrypted = _download_block_with_reconnect(block_ids, block_idx, folder_id)
                    decrypted = crypto.decrypt_block(encrypted, block_idx)
                    _stream_cache_write(disk_path, decrypted)
                    _log(f"block {block_idx} downloaded+decrypted in {time.time() - t0:.2f}s")
                else:
                    _log(f"block {block_idx} from disk cache")

                _store_block(cache_key, decrypted)
            finally:
                # Always release the in-flight entry, even on failure.
                with _inflight_locks_lock:
                    _inflight_locks.pop(cache_key, None)

        _prefetch_next(crypto, file_message_id, folder_id, block_ids, block_idx)
        return decrypted


def _prefetch_next(crypto, file_message_id, folder_id, block_ids, block_idx):
    """Warm the next block in the background so playback never stalls between
    blocks. Reads from the disk cache when already present."""
    nxt = block_idx + 1
    if nxt >= len(block_ids):
        return

    def worker():
        try:
            key = (file_message_id, folder_id, nxt)
            if _cached_block(key) is not None:
                return
            # Coordinate with a player request for the same block so we never
            # download it from Telegram twice.
            with _inflight_locks_lock:
                lock = _inflight_locks.get(key) or threading.Lock()
                _inflight_locks[key] = lock
            with lock:
                try:
                    if _cached_block(key) is not None:
                        return
                    disk_path = _stream_cache_path(file_message_id, folder_id, nxt)
                    if _stream_cache_read(disk_path) is not None:
                        return
                    encrypted = _download_block_with_reconnect(block_ids, nxt, folder_id)
                    decrypted = crypto.decrypt_block(encrypted, nxt)
                    _stream_cache_write(disk_path, decrypted)
                    _store_block(key, decrypted)
                finally:
                    with _inflight_locks_lock:
                        _inflight_locks.pop(key, None)
        except Exception:
            pass

    threading.Thread(target=worker, daemon=True, name="televault-prefetch").start()


def _download_block_with_reconnect(block_ids, block_idx, folder_id):
    """Download one block from Telegram; on failure, reconnect once and retry.

    A connection that drops mid-download recovers here without waiting for
    the player's next request. Fails fast (bounded) when Telegram is down.
    """
    try:
        return _run_coro(_telegram_download_block(block_ids[block_idx], folder_id))
    except Exception as first:
        _log(f"block {block_idx} failed ({first}); reconnecting once")
        try:
            if _run_coro(_telegram_reconnect()):
                _log(f"block {block_idx} retry after reconnect")
                return _run_coro(_telegram_download_block(block_ids[block_idx], folder_id))
        except Exception as second:
            _log(f"block {block_idx} retry failed ({second})")
        raise ConnectionError("Telegram connection lost")


# ── Async helpers (routed to the shared loop) ────────────────────────────

async def _telegram_get_manifest(message_id, folder_id):
    key = (message_id, folder_id)
    manifest = _manifest_cache.get(key)
    if manifest is not None:
        return manifest

    client = getattr(_telegram, "client", None)
    if not client or not client.is_connected():
        raise ConnectionError("Telegram connection lost")

    from manifest import get_manifest

    vault_key = load_vault_key()
    try:
        manifest = await get_manifest(_telegram, message_id, vault_key, folder_id)
    except (TimeoutError, asyncio.TimeoutError) as exc:
        raise ConnectionError(f"Telegram request timed out: {exc}") from exc
    if len(_manifest_cache) >= _MANIFEST_CACHE_MAX:
        _manifest_cache.pop(next(iter(_manifest_cache)), None)
    _manifest_cache[key] = manifest
    return manifest


async def _telegram_download_block(block_message_id, folder_id):
    client = getattr(_telegram, "client", None)
    if not client or not client.is_connected():
        raise ConnectionError("Telegram connection lost")
    try:
        return await _telegram.download_block(block_message_id, folder_id)
    except (TimeoutError, asyncio.TimeoutError) as exc:
        raise ConnectionError(f"Telegram request timed out: {exc}") from exc


# ── Server lifecycle ─────────────────────────────────────────────────────

def start(port: int = 0) -> int:
    """Start the stream server on a free localhost port. Returns the port."""
    global _server, _server_thread, _server_port
    if _server is not None:
        return _server_port or 0

    server = ThreadingHTTPServer(("127.0.0.1", port), _StreamHandler)
    server.daemon_threads = True
    thread = threading.Thread(target=server.serve_forever, daemon=True, name="televault-stream")
    thread.start()

    _server = server
    _server_thread = thread
    _server_port = server.server_address[1]
    return _server_port


def stop():
    """Shut down the stream server (no-op if not running)."""
    global _server, _server_thread, _server_port
    if _server is not None:
        try:
            _server.shutdown()
        except Exception:
            pass
        _server = None
    _server_thread = None
    _server_port = None
