import asyncio
import base64
import hashlib
import json
import mimetypes
import os
import secrets
import socket
import sqlite3
import threading
import time
import uuid

# Keep copied desktop modules writing inside the app sandbox on Android.
os.environ.setdefault("APPDATA", os.environ.get("HOME", os.getcwd()))

from aes_gcm_crypto import AESGCMCrypto, SALT_SIZE
from share import (
    build_share_link,
    decrypt_share_payload,
    encrypt_share_payload,
    parse_share_link,
    validate_access_key,
    validate_share_password,
)
from manifest import (
    compute_file_checksum,
    create_manifest,
    get_manifest,
    get_mime_type,
    list_files_from_manifests,
    upload_manifest,
)
from telegram import TeleVaultTelegram
from televault_crypto import get_block_size, secure_random_bytes, split_file
from transfer_progress import TransferProgress
from vault import (
    derive_master_key,
    export_vault_key,
    import_vault_key,
    load_vault_key,
    vault_key_exists,
)

telegram = TeleVaultTelegram()

# ─────────────────────────────────────────────────────────────────────
#  Shared asyncio event loop
#
#  The loop runs forever on a dedicated daemon thread. Every operation
#  (bridge dispatch, stream-server HTTP requests, background polls) is
#  submitted with run_coroutine_threadsafe so work interleaves naturally
#  on one loop — exactly like uvicorn on the desktop.
# ─────────────────────────────────────────────────────────────────────
_loop = asyncio.new_event_loop()
asyncio.set_event_loop(_loop)

_loop_thread = threading.Thread(
    target=_loop.run_forever,
    daemon=True,
    name="televault-loop",
)
_loop_thread.start()

# Local HTTP stream server (lazy-started) — configured right after the
# Telegram client instance exists so it can decrypt blocks for playback.
import stream_server

stream_server.configure(_loop, telegram)

# Transfer cancellation: transfer_id -> cancelled. Checked cooperatively
# between blocks so a large upload/download stops within one block.
_cancelled_transfers: set = set()
_cancel_lock = threading.Lock()


def _is_cancelled(transfer_id: str) -> bool:
    with _cancel_lock:
        return transfer_id in _cancelled_transfers


def _mark_cancelled(transfer_id: str) -> None:
    with _cancel_lock:
        _cancelled_transfers.add(transfer_id)


def _unmark_cancelled(transfer_id: str) -> None:
    """Forget a transfer once its coroutine has finished (prevents unbounded growth)."""
    with _cancel_lock:
        _cancelled_transfers.discard(transfer_id)


def _run(coro):
    """Run a coroutine on the shared event loop from any thread."""
    return asyncio.run_coroutine_threadsafe(coro, _loop).result()


def _folder_id(value):
    if value in (None, "", "null", "None"):
        return None
    try:
        return int(value)
    except (TypeError, ValueError):
        return None


def _json_safe(value):
    return json.loads(json.dumps(value))


def _normalize_folder_id(raw):
    return _folder_id(raw)


# ─────────────────────────────────────────────────────────────────────
#  Encrypted local thumbnail cache
#
#  Thumbnails are decrypted once from Telegram, then stored locally as
#  AES-256-GCM ciphertext keyed by a key derived from the vault key. Nothing
#  on disk is readable without the app holding the vault key.
# ─────────────────────────────────────────────────────────────────────

_THUMB_MAGIC = b"TVTH"  # TeleVault Thumbnail


def _thumb_cache_key() -> bytes:
    """Derive the at-rest encryption key for the local thumbnail cache."""
    return hashlib.sha256(b"TeleVault-Thumbnail-Cache-v1:" + load_vault_key()).digest()


def _thumb_cache_key_for(folder_id, message_id) -> str:
    """Composite cache key — Telegram message IDs are only unique per chat."""
    return f"{folder_id if folder_id is not None else 0}|{message_id}"


def _encrypt_thumbnail(data: bytes) -> bytes:
    """Encrypt plaintext thumbnail bytes for at-rest storage."""
    salt = secure_random_bytes(32)
    crypto = AESGCMCrypto(_thumb_cache_key(), salt)
    try:
        return _THUMB_MAGIC + salt + crypto.encrypt_block(data, 0)
    finally:
        crypto.close()


def _decrypt_thumbnail(blob: bytes):
    """Decrypt a cached thumbnail. Returns None if the key changed or data is bad."""
    if not blob or len(blob) < len(_THUMB_MAGIC) + 32 + 1 + 8 + 12 + 16:
        return None
    if blob[:len(_THUMB_MAGIC)] != _THUMB_MAGIC:
        return None
    salt = blob[len(_THUMB_MAGIC):len(_THUMB_MAGIC) + 32]
    payload = blob[len(_THUMB_MAGIC) + 32:]
    try:
        crypto = AESGCMCrypto(_thumb_cache_key(), salt)
        try:
            return crypto.decrypt_block(payload, 0)
        finally:
            crypto.close()
    except Exception:
        return None


_THUMB_CACHE_LIMIT = 3000

# SQLite is opened per-call from multiple bridge threads (grid thumbnail loads
# run concurrently), so serialize DB access with a lock to avoid busy errors.
# RLock: save_thumbnail() → prune() nests lock acquisitions.
_thumb_db_lock = threading.RLock()
_thumb_table_ready = False


def _db_thumbnail_conn():
    """Open a connection, ensuring the encrypted thumbnail table exists once."""
    global _thumb_table_ready
    from db import get_db_connection

    if not _thumb_table_ready:
        conn = get_db_connection()
        conn.execute(
            "CREATE TABLE IF NOT EXISTS thumbnails ("
            " cache_key TEXT PRIMARY KEY,"
            " data BLOB NOT NULL,"
            " updated_at INTEGER NOT NULL)"
        )
        conn.commit()
        conn.close()
        _thumb_table_ready = True
    return get_db_connection()


def _db_save_thumbnail(cache_key: str, encrypted_data: bytes) -> None:
    """Store an encrypted thumbnail blob in the local SQLite database."""
    try:
        with _thumb_db_lock:
            conn = _db_thumbnail_conn()
            cursor = conn.cursor()
            cursor.execute(
                "INSERT OR REPLACE INTO thumbnails (cache_key, data, updated_at) VALUES (?, ?, ?)",
                (cache_key, sqlite3.Binary(encrypted_data), int(time.time())),
            )
            conn.commit()
            conn.close()
            _db_prune_thumbnail_cache()
    except Exception:
        pass


def _db_get_thumbnail(cache_key: str):
    """Read an encrypted thumbnail blob from the local database."""
    try:
        with _thumb_db_lock:
            conn = _db_thumbnail_conn()
            cursor = conn.cursor()
            cursor.execute("SELECT data FROM thumbnails WHERE cache_key = ?", (cache_key,))
            row = cursor.fetchone()
            conn.close()
            return bytes(row["data"]) if row else None
    except Exception:
        return None


def _db_delete_thumbnail(cache_key: str) -> None:
    """Remove a single cached thumbnail."""
    try:
        with _thumb_db_lock:
            conn = _db_thumbnail_conn()
            cursor = conn.cursor()
            cursor.execute("DELETE FROM thumbnails WHERE cache_key = ?", (cache_key,))
            conn.commit()
            conn.close()
    except Exception:
        pass


def _db_clear_thumbnails() -> None:
    """Clear the entire encrypted thumbnail cache."""
    try:
        with _thumb_db_lock:
            conn = _db_thumbnail_conn()
            cursor = conn.cursor()
            cursor.execute("DELETE FROM thumbnails")
            conn.commit()
            conn.close()
            print("✅ Encrypted thumbnail cache cleared")
    except Exception:
        pass


def _db_prune_thumbnail_cache(limit: int = _THUMB_CACHE_LIMIT) -> None:
    """Evict oldest thumbnails once the cache exceeds the limit."""
    try:
        with _thumb_db_lock:
            conn = _db_thumbnail_conn()
            cursor = conn.cursor()
            cursor.execute("SELECT COUNT(*) AS total FROM thumbnails")
            row = cursor.fetchone()
            total = row["total"] if row else 0
            if total > limit:
                remove = total - int(limit * 0.8)
                cursor.execute(
                    "DELETE FROM thumbnails WHERE cache_key IN ("
                    "SELECT cache_key FROM thumbnails ORDER BY updated_at ASC LIMIT ?)",
                    (remove,),
                )
                conn.commit()
            conn.close()
    except Exception:
        pass


def _delete_cached_thumbnail(folder_id, message_id) -> None:
    """Remove a cached thumbnail when its file is deleted."""
    _db_delete_thumbnail(_thumb_cache_key_for(folder_id, message_id))


# ─────────────────────────────────────────────────────────────────────
#  Encrypted local listing cache
#
#  The dashboard used to re-scan Telegram (download + decrypt every manifest)
#  every time it was opened — slow. Now a successful sync snapshots the
#  folders + files into a local SQLite row, encrypted at rest with a key
#  derived from the vault key. The UI renders the cache instantly and then
#  refreshes in the background.
# ─────────────────────────────────────────────────────────────────────

_LISTING_MAGIC = b"TVLC"  # TeleVault Listing Cache
_listing_table_ready = False


def _listing_cache_key() -> bytes:
    """Derive the at-rest encryption key for the local listing cache."""
    return hashlib.sha256(b"TeleVault-Listing-Cache-v1:" + load_vault_key()).digest()


def _db_listing_conn():
    """Open a connection, ensuring the listing cache table exists once."""
    global _listing_table_ready
    from db import get_db_connection

    if not _listing_table_ready:
        conn = get_db_connection()
        conn.execute(
            "CREATE TABLE IF NOT EXISTS listing_cache ("
            " id INTEGER PRIMARY KEY CHECK (id = 1),"
            " blob BLOB NOT NULL,"
            " updated_at INTEGER NOT NULL)"
        )
        conn.commit()
        conn.close()
        _listing_table_ready = True
    return get_db_connection()


def _save_listing_cache(folders, files, vault_mismatch) -> None:
    """Snapshot the last clean sync result into the local listing cache."""
    try:
        payload = json.dumps(
            {"folders": folders, "files": files, "vault_mismatch": vault_mismatch},
            separators=(",", ":"),
        ).encode("utf-8")
        salt = secure_random_bytes(32)
        crypto = AESGCMCrypto(_listing_cache_key(), salt)
        try:
            encrypted = crypto.encrypt_block(payload, 0)
        finally:
            crypto.close()
        blob = _LISTING_MAGIC + salt + encrypted
        with _thumb_db_lock:
            conn = _db_listing_conn()
            conn.execute(
                "INSERT OR REPLACE INTO listing_cache (id, blob, updated_at) VALUES (1, ?, ?)",
                (sqlite3.Binary(blob), int(time.time())),
            )
            conn.commit()
            conn.close()
    except Exception as exc:
        print(f"[android_commands] Listing cache save failed: {exc}")


def _load_listing_cache():
    """Read the cached listing. Returns None when absent or undecryptable
    (e.g. vault key changed → old snapshot simply doesn't apply)."""
    try:
        with _thumb_db_lock:
            conn = _db_listing_conn()
            row = conn.execute("SELECT blob, updated_at FROM listing_cache WHERE id = 1").fetchone()
            conn.close()
        if not row:
            return None
        blob = bytes(row["blob"])
        if len(blob) < len(_LISTING_MAGIC) + 32 + 12 + 16:
            return None
        if blob[:len(_LISTING_MAGIC)] != _LISTING_MAGIC:
            return None
        salt = blob[len(_LISTING_MAGIC):len(_LISTING_MAGIC) + 32]
        payload = blob[len(_LISTING_MAGIC) + 32:]
        crypto = AESGCMCrypto(_listing_cache_key(), salt)
        try:
            decrypted = crypto.decrypt_block(payload, 0)
        finally:
            crypto.close()
        data = json.loads(decrypted.decode("utf-8"))
        return {
            "folders": data.get("folders", []),
            "files": data.get("files", []),
            "vault_mismatch": bool(data.get("vault_mismatch", False)),
            "updated_at": int(row["updated_at"] or 0),
        }
    except Exception:
        return None


def _invalidate_listing_cache() -> None:
    """Drop the cached snapshot after any mutation (upload/delete/move/rename)."""
    try:
        with _thumb_db_lock:
            conn = _db_listing_conn()
            conn.execute("DELETE FROM listing_cache WHERE id = 1")
            conn.commit()
            conn.close()
    except Exception:
        pass


def _on_vault_key_changed() -> None:
    """Reset local caches that are keyed to the old vault key after a restore.
    Thumbnails/listing/stream blocks become undecryptable anyway, but dropping
    them now keeps the in-memory stream caches from serving stale blocks."""
    stream_server.clear_cache()
    _db_clear_thumbnails()
    _invalidate_listing_cache()


async def _rename_file(args):
    """Rename a file by re-uploading its manifest with the new name.

    A file's name lives only in its manifest message — the encrypted data
    blocks are untouched, so this is cheap and needs no re-upload of data.
    """
    message_id = int(args.get("messageId"))
    folder_id = _folder_id(args.get("folderId"))
    new_name = str(args.get("newName", "")).strip()

    if not new_name:
        raise ValueError("A name is required")
    if len(new_name) > 128:
        raise ValueError("Name is too long (max 128 characters)")
    if "\x00" in new_name or "/" in new_name or "\\" in new_name:
        raise ValueError("Name cannot contain path separators")

    vault_key = load_vault_key()
    manifest = await get_manifest(telegram, message_id, vault_key, folder_id)
    manifest["filename"] = new_name

    # Upload the new manifest first (keeps the file discoverable even if the
    # old-message delete below fails), then remove the old one.
    new_id = await upload_manifest(telegram, manifest, vault_key, folder_id)
    await telegram.delete_file(message_id, folder_id)

    # Re-key the cached thumbnail — the thumbnail block itself is unchanged.
    old_thumb = _db_get_thumbnail(_thumb_cache_key_for(folder_id, message_id))
    if old_thumb:
        _db_save_thumbnail(_thumb_cache_key_for(folder_id, new_id), old_thumb)
    _delete_cached_thumbnail(folder_id, message_id)

    try:
        from db import delete_file_metadata, save_file_metadata

        delete_file_metadata(str(message_id))
        save_file_metadata(
            file_id=str(new_id),
            folder_id=folder_id,
            name=new_name,
            size=int(manifest.get("size", 0) or 0),
            mime=str(manifest.get("mime", "") or ""),
            manifest_message_id=new_id,
            thumbnail_message_id=manifest.get("thumbnail_block_id"),
        )
    except Exception:
        pass

    _invalidate_listing_cache()
    return {"ok": True, "id": new_id}


async def _upload_file(args):
    path = args.get("path") or ""
    folder_id = _folder_id(args.get("folderId"))
    password = args.get("password")
    transfer_id = args.get("transferId") or str(uuid.uuid4())
    resume = bool(args.get("resume", False))
    thumbnail_b64 = args.get("thumbnail_b64")

    if not path or not os.path.exists(path):
        raise ValueError(f"File not found: {path}")

    if not telegram.client or not telegram.client.is_connected():
        if telegram.client:
            await telegram.client.connect()
        else:
            raise RuntimeError("Not connected to Telegram")

    vault_key = load_vault_key()
    filename = os.path.basename(path)
    file_size = os.path.getsize(path)
    block_size = get_block_size(filename)
    total_blocks = max(1, (file_size + block_size - 1) // block_size)

    # ── Resume support ──────────────────────────────────────────────
    progress = None
    if resume:
        loaded = TransferProgress.load(transfer_id)
        if (
            loaded
            and loaded.transfer_type == "upload"
            and loaded.file_size == file_size
            and loaded.total_blocks == total_blocks
        ):
            progress = loaded

    if not progress:
        progress = TransferProgress(
            transfer_type="upload",
            file_path=path,
            total_blocks=total_blocks,
            folder_id=folder_id,
            file_size=file_size,
            block_size=block_size,
        )
        progress.transfer_id = transfer_id
        progress.save()

    # Reuse per-file salt across retries/resume.
    file_salt = secure_random_bytes(SALT_SIZE)
    salt_b64 = progress.get_metadata("salt_b64")
    salt_loaded = False
    if isinstance(salt_b64, str) and salt_b64:
        try:
            decoded = base64.b64decode(salt_b64)
            if len(decoded) == SALT_SIZE:
                file_salt = decoded
                salt_loaded = True
        except Exception:
            pass
    if not salt_loaded:
        progress.set_metadata("salt_b64", base64.b64encode(file_salt).decode("ascii"))

    master_key = derive_master_key(vault_key, file_salt, password=password)
    crypto = AESGCMCrypto(master_key, file_salt)

    checksum = progress.get_metadata("checksum")
    if not isinstance(checksum, str) or not checksum:
        checksum = compute_file_checksum(path)
        progress.set_metadata("checksum", checksum)

    try:
        # Reuse already-uploaded blocks (validated against Telegram message IDs).
        uploaded = {}
        for idx in progress.get_completed_blocks():
            msg_id = progress.get_block_message_id(idx)
            if msg_id is not None:
                uploaded[idx] = msg_id
        progress.uploaded_blocks = sorted(uploaded.keys())
        progress.save()

        block_message_ids = []
        for block_index, chunk in split_file(path, block_size):
            if _is_cancelled(transfer_id):
                raise RuntimeError("Transfer cancelled")
            if block_index in uploaded:
                block_message_ids.append(uploaded[block_index])
                continue

            encrypted_block = crypto.encrypt_block(chunk, block_index)
            message_id = await telegram.upload_block(
                data=encrypted_block,
                filename=f"{uuid.uuid4().hex}.tvblock",
                folder_id=folder_id,
            )
            progress.set_block_message_id(block_index, message_id)
            progress.add_block(block_index)
            block_message_ids.append(message_id)

        if _is_cancelled(transfer_id):
            raise RuntimeError("Transfer cancelled")

        # ── Thumbnail (generated natively by the Android app) ────────
        thumbnail_block_id = None
        if thumbnail_b64:
            try:
                thumb_data = base64.b64decode(thumbnail_b64)
                encrypted_thumb = crypto.encrypt_block(thumb_data, 999999)
                thumbnail_msg_id = await telegram.upload_block(
                    data=encrypted_thumb,
                    filename=f"tv_{uuid.uuid4().hex}",
                    folder_id=folder_id,
                )
                thumbnail_block_id = thumbnail_msg_id
            except Exception as exc:
                print(f"[android_commands] Thumbnail upload skipped: {exc}")

        manifest = create_manifest(
            filename=filename,
            file_size=file_size,
            mime_type=get_mime_type(filename),
            block_size=block_size,
            total_blocks=total_blocks,
            block_message_ids=block_message_ids,
            salt=file_salt,
            checksum=checksum,
            password_protected=bool(password),
            thumbnail_block_id=thumbnail_block_id,
        )
        manifest_id = await upload_manifest(telegram, manifest, vault_key, folder_id)

        # Local SQLite metadata + encrypted thumbnail cache for instant grid display.
        try:
            from db import save_file_metadata

            save_file_metadata(
                file_id=str(manifest_id),
                folder_id=folder_id,
                name=filename,
                size=file_size,
                mime=get_mime_type(filename),
                manifest_message_id=manifest_id,
                thumbnail_message_id=thumbnail_block_id,
            )
            if thumbnail_b64:
                try:
                    _db_save_thumbnail(
                        _thumb_cache_key_for(folder_id, manifest_id),
                        _encrypt_thumbnail(base64.b64decode(thumbnail_b64)),
                    )
                except Exception:
                    pass
        except Exception as exc:
            print(f"[android_commands] SQLite metadata skipped: {exc}")

        progress.mark_complete()
        progress.delete()
        _invalidate_listing_cache()
        return {"ok": True, "id": manifest_id}
    finally:
        crypto.close()
        _unmark_cancelled(transfer_id)


async def _download_block_resilient(block_message_id, folder_id, progress_callback=None):
    """Download one block; on failure reconnect cleanly once and retry.

    Mirrors the stream server's resilience: a single connection blip must not
    fail the whole file. Runs on the shared asyncio loop, so we await the
    stream server's reconnect coroutine directly.
    """
    try:
        return await telegram.download_block(
            block_message_id, folder_id, progress_callback=progress_callback
        )
    except Exception as first:
        print(f"[dl] block {block_message_id} failed ({first}); reconnecting once")
        try:
            if await stream_server._telegram_reconnect():
                print(f"[dl] block {block_message_id} retry after reconnect")
                return await telegram.download_block(
                    block_message_id, folder_id, progress_callback=progress_callback
                )
        except Exception as second:
            print(f"[dl] block {block_message_id} retry failed ({second})")
        raise ConnectionError("Telegram connection lost")


async def _download_file(args):
    message_id = int(args.get("messageId"))
    save_path = args.get("savePath") or ""
    folder_id = _folder_id(args.get("folderId"))
    password = args.get("password")
    transfer_id = args.get("transferId") or str(uuid.uuid4())
    resume = bool(args.get("resume", False))

    if not save_path:
        raise ValueError("savePath is required")

    if not telegram.client or not telegram.client.is_connected():
        if telegram.client:
            await telegram.client.connect()
        else:
            raise RuntimeError("Not connected to Telegram")

    vault_key = load_vault_key()
    manifest = await get_manifest(telegram, message_id, vault_key, folder_id)
    if manifest.get("password_protected") and not password:
        raise ValueError("This file is password-protected")

    salt = base64.b64decode(manifest["salt"])
    master_key = derive_master_key(vault_key, salt, password=password)
    crypto = AESGCMCrypto(master_key, salt)

    block_ids = manifest["block_message_ids"]
    total_blocks = len(block_ids)
    file_size = int(manifest.get("size", 0) or 0)
    block_size = int(manifest.get("block_size", 5 * 1024 * 1024) or (5 * 1024 * 1024))

    temp_path = save_path + ".part"

    try:
        os.makedirs(os.path.dirname(os.path.abspath(save_path)), exist_ok=True)

        # ── Resume support ──────────────────────────────────────────
        progress = None
        if resume:
            loaded = TransferProgress.load(transfer_id)
            if (
                loaded
                and loaded.transfer_type == "download"
                and loaded.message_id == message_id
                and loaded.total_blocks == total_blocks
            ):
                progress = loaded

        if not progress:
            progress = TransferProgress(
                transfer_type="download",
                file_path=save_path,
                total_blocks=total_blocks,
                message_id=message_id,
                save_path=save_path,
                file_size=file_size,
                block_size=block_size,
            )
            progress.transfer_id = transfer_id
            progress.save()

        # Contiguous block check — resume only from a clean prefix.
        completed = set(progress.get_completed_blocks())
        contiguous = 0
        while contiguous in completed and contiguous < total_blocks:
            contiguous += 1
        if contiguous != len(completed):
            progress.downloaded_blocks = list(range(contiguous))
            progress.save()

        if contiguous == 0 and os.path.exists(temp_path):
            try:
                os.remove(temp_path)
            except OSError:
                pass

        # Bytes already on disk (resume) — used to seed the byte-level progress.
        bytes_done = int(progress.get_metadata("bytes_done", 0) or 0)
        last_saved = {"value": bytes_done}

        def _track_progress(state, sent):
            """Store cumulative bytes done, throttled to ~1 MiB disk writes.

            Parallel segments can complete out of order, so we always keep the
            largest offset reached (monotonic UI progress)."""
            state["max_in_block"] = max(state["max_in_block"], sent)
            total = state["base"] + state["max_in_block"]
            if total - last_saved["value"] >= 1024 * 1024:
                progress.set_metadata("bytes_done", total)
                last_saved["value"] = total

        with open(temp_path, "ab" if contiguous > 0 else "wb") as out:
            for block_index in range(contiguous, total_blocks):
                if _is_cancelled(transfer_id):
                    raise RuntimeError("Transfer cancelled")

                # Reuse the stream cache — blocks that were already played are
                # decrypted on disk; no need to hit Telegram again. Makes
                # re-downloading a watched video instant.
                cached_plain = stream_server._stream_cache_read(
                    stream_server._stream_cache_path(message_id, folder_id, block_index)
                )
                if cached_plain is not None:
                    out.write(cached_plain)
                    bytes_done += len(cached_plain)
                    progress.add_block(block_index)
                    progress.set_metadata("bytes_done", bytes_done)
                    print(f"[dl] block {block_index} from stream cache")
                    continue

                state = {"base": bytes_done, "max_in_block": 0}
                encrypted = await _download_block_resilient(
                    block_ids[block_index],
                    folder_id,
                    progress_callback=lambda sent, _total, s=state: _track_progress(s, sent),
                )
                decrypted = crypto.decrypt_block(encrypted, block_index)
                out.write(decrypted)
                bytes_done += len(decrypted)
                progress.set_metadata("bytes_done", bytes_done)
                progress.add_block(block_index)

        if _is_cancelled(transfer_id):
            raise RuntimeError("Transfer cancelled")

        checksum = compute_file_checksum(temp_path)
        if checksum != manifest.get("checksum"):
            # Corrupt partial — never keep it for resume.
            if os.path.exists(temp_path):
                try:
                    os.remove(temp_path)
                except OSError:
                    pass
            raise ValueError("Checksum mismatch after download")

        os.replace(temp_path, save_path)
        progress.mark_complete()
        progress.delete()
        return {"ok": True, "path": save_path}
    finally:
        crypto.close()
        _unmark_cancelled(transfer_id)
        # NOTE: on failure/cancel the .part file is intentionally KEPT so the
        # transfer can be resumed. Only the success path (os.replace) and the
        # checksum-mismatch path above remove it.


def _sync_preempted() -> bool:
    """True when the user started streaming while this scan was running.

    The sync and the stream server share ONE asyncio loop; a long scan
    (iter_dialogs + downloading every manifest) would starve video requests,
    so the scan checks this between folders and stops early. The dashboard
    simply keeps showing the cached listing and refreshes later.
    """
    return stream_server.is_stream_active()


def _sync_interrupted_result(folders):
    """Short result returned when the scan yields to a video stream."""
    return {
        "folders": folders,
        "files": [],
        "total_files": 0,
        "manifest_docs": 0,
        "vault_mismatch": False,
        "preempted": True,
    }


async def _sync_all_folders():
    folders = await telegram.scan_folders()
    if _sync_preempted():
        return _sync_interrupted_result(folders)

    target_folders = [None] + [folder["id"] for folder in folders]

    # Count .tvmanifest documents (cheap, no downloads) so we can detect when
    # files exist but the current vault key cannot decrypt them.
    manifest_docs = 0
    for folder_id in target_folders:
        if _sync_preempted():
            return _sync_interrupted_result(folders)
        try:
            manifest_docs += await telegram.count_manifests(folder_id)
        except Exception:
            continue

    all_files = []
    list_errors = 0
    for folder_id in target_folders:
        if _sync_preempted():
            return _sync_interrupted_result(folders)
        try:
            folder_files = await list_files_from_manifests(
                telegram,
                load_vault_key(),
                folder_id,
                should_stop=_sync_preempted,
            )
        except Exception:
            list_errors += 1
            continue
        for file_item in folder_files:
            item = dict(file_item)
            item["folder_id"] = folder_id
            all_files.append(item)

    # Manifests exist but none could be decrypted AND every folder listing
    # completed cleanly → this device's vault key differs from the one that
    # uploaded the files (e.g. laptop vs phone). Transient network errors are
    # excluded so we never show a false warning.
    vault_mismatch = manifest_docs > 0 and len(all_files) == 0 and list_errors == 0

    # Persist a clean snapshot so the next dashboard open renders instantly
    # (only overwrite good caches — a partial sync is never snapshotted).
    if list_errors == 0:
        _save_listing_cache(folders, all_files, vault_mismatch)

    return {
        "folders": folders,
        "files": all_files,
        "total_files": len(all_files),
        "manifest_docs": manifest_docs,
        "vault_mismatch": vault_mismatch,
    }


def _transfer_progress(args):
    transfer_id = args.get("transferId") or ""
    if not transfer_id:
        return None
    tp = TransferProgress.load(transfer_id)
    if not tp:
        return None
    percent = round(tp.get_progress_percent(), 1)
    file_size = int(tp.file_size or 0)
    if file_size > 0:
        # Byte-level progress: a video with 5 MiB blocks used to sit at 0%
        # until the first block finished. Use bytes done when it reports
        # higher than the block count does.
        bytes_done = int(tp.get_metadata("bytes_done", 0) or 0)
        byte_pct = round(min(100.0, (bytes_done / file_size) * 100), 1)
        percent = max(percent, byte_pct)
    return {
        "transferId": tp.transfer_id,
        "transferType": tp.transfer_type,
        "totalBlocks": tp.total_blocks,
        "completedBlocks": len(tp.get_completed_blocks()),
        "percent": percent,
        "status": tp.status,
    }


async def _storage_stats(args):
    """Desktop-parity storage analytics for the Android app."""
    folder_id = _normalize_folder_id(args.get("folderId"))
    all_folders = bool(args.get("allFolders", folder_id is None))

    vault_key = load_vault_key()

    target_folders = []
    if not all_folders:
        target_folders = [folder_id]
    else:
        target_folders = [None]
        for folder in await telegram.scan_folders():
            parsed = _normalize_folder_id(folder.get("id"))
            if parsed is not None and parsed not in target_folders:
                target_folders.append(parsed)

    files = []
    seen = set()
    for target_folder_id in target_folders:
        try:
            folder_files = await list_files_from_manifests(
                telegram_client=telegram,
                vault_key=vault_key,
                folder_id=target_folder_id,
                quick_mode=True,
            )
        except Exception:
            continue
        for file_item in folder_files:
            try:
                file_id = int(file_item.get("id"))
            except (TypeError, ValueError):
                continue
            if (target_folder_id, file_id) in seen:
                continue
            seen.add((target_folder_id, file_id))
            item = dict(file_item)
            item.setdefault("_stats_folder_id", target_folder_id)
            files.append(item)

    total_size = 0
    videos = 0
    images = 0
    docs = 0
    category_totals = {
        "videos": {"files": 0, "size": 0},
        "images": {"files": 0, "size": 0},
        "audio": {"files": 0, "size": 0},
        "archives": {"files": 0, "size": 0},
        "documents": {"files": 0, "size": 0},
        "other": {"files": 0, "size": 0},
    }
    folder_usage = {}

    folder_names = {None: "Saved Messages"}
    try:
        for folder in await telegram.scan_folders():
            parsed = _normalize_folder_id(folder.get("id"))
            if parsed is not None:
                folder_names[parsed] = str(folder.get("name") or "Folder")
    except Exception:
        pass

    for file_item in files:
        try:
            file_size = int(file_item.get("size", 0) or 0)
        except (TypeError, ValueError):
            file_size = 0
        file_size = max(file_size, 0)
        total_size += file_size

        mime = str(file_item.get("mime", "") or "").lower()
        if not mime:
            guess, _ = mimetypes.guess_type(str(file_item.get("name", "") or ""))
            mime = (guess or "").lower()

        name = str(file_item.get("name", "") or "")
        extension = os.path.splitext(name)[1].lower()

        if mime.startswith("video/"):
            videos += 1
            category = "videos"
        elif mime.startswith("image/"):
            images += 1
            category = "images"
        elif mime.startswith("audio/"):
            category = "audio"
        elif extension in {".zip", ".rar", ".7z", ".tar", ".gz", ".bz2", ".xz"}:
            category = "archives"
        elif mime.startswith("text/") or mime in {
            "application/pdf",
            "application/msword",
            "application/vnd.openxmlformats-officedocument.wordprocessingml.document",
            "application/vnd.ms-excel",
            "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
            "application/vnd.ms-powerpoint",
            "application/vnd.openxmlformats-officedocument.presentationml.presentation",
        }:
            category = "documents"
        else:
            category = "other"

        if category == "documents":
            docs += 1

        category_totals[category]["files"] += 1
        category_totals[category]["size"] += file_size

        folder_id_value = _normalize_folder_id(
            file_item.get("folder_id", file_item.get("folderId", file_item.get("_stats_folder_id")))
        )
        folder_key = str(folder_id_value) if folder_id_value is not None else "saved-messages"
        if folder_key not in folder_usage:
            folder_usage[folder_key] = {
                "id": folder_id_value,
                "name": folder_names.get(folder_id_value, "Folder"),
                "files": 0,
                "size": 0,
            }
        folder_usage[folder_key]["files"] += 1
        folder_usage[folder_key]["size"] += file_size

    largest_files = sorted(
        [
            {
                "id": file_item.get("id"),
                "name": str(file_item.get("name", "Untitled file") or "Untitled file"),
                "size": int(file_item.get("size", 0) or 0),
                "created_at": file_item.get("created_at", file_item.get("date")),
            }
            for file_item in files
        ],
        key=lambda item: item["size"],
        reverse=True,
    )[:5]

    usage_by_folder = sorted(folder_usage.values(), key=lambda item: item["size"], reverse=True)[:5]

    return {
        "total_files": len(files),
        "total_size": total_size,
        "videos": videos,
        "images": images,
        "docs": docs,
        "bandwidth": telegram.get_bandwidth(),
        "folders_scanned": len(target_folders),
        "categories": category_totals,
        "largest_files": largest_files,
        "folder_usage": usage_by_folder,
    }


async def _get_thumbnail(args):
    message_id = int(args.get("messageId"))
    folder_id = _folder_id(args.get("folderId"))
    cache_key = _thumb_cache_key_for(folder_id, message_id)

    # Local encrypted cache first (instant, offline, already decrypted once).
    cached = _db_get_thumbnail(cache_key)
    if cached:
        decrypted = _decrypt_thumbnail(cached)
        if decrypted is not None:
            return {"data_b64": base64.b64encode(decrypted).decode("ascii")}
        # Undecryptable (vault key changed / stale) — drop it and refetch.
        _db_delete_thumbnail(cache_key)

    # Fallback: download + decrypt thumbnail block from Telegram (once), then
    # store the result encrypted in the local database for all future loads.
    try:
        vault_key = load_vault_key()
        manifest = await get_manifest(telegram, message_id, vault_key, folder_id)
        thumb_id = manifest.get("thumbnail_block_id")
        if not thumb_id:
            return {"data_b64": None}

        encrypted = await telegram.download_block(int(thumb_id), folder_id)
        salt = base64.b64decode(manifest["salt"])
        master_key = derive_master_key(vault_key, salt)
        crypto = AESGCMCrypto(master_key, salt)
        try:
            decrypted = crypto.decrypt_block(encrypted, 999999)
        finally:
            crypto.close()

        _db_save_thumbnail(cache_key, _encrypt_thumbnail(decrypted))

        return {"data_b64": base64.b64encode(decrypted).decode("ascii")}
    except Exception as exc:
        print(f"[android_commands] Thumbnail fetch failed: {exc}")
        return {"data_b64": None}


def _stream_server_start():
    port = stream_server.start()
    return {"port": port, "base_url": f"http://127.0.0.1:{port}"}


def _stream_server_stop():
    stream_server.stop()
    return {"ok": True}


# ─────────────────────────────────────────────────────────────────────
#  Channel-Based E2E Sharing
# ─────────────────────────────────────────────────────────────────────

async def _share_create(args):
    """Create a channel-based E2E share for a file (sharer side)."""
    message_id = args.get("messageId")
    folder_id = _folder_id(args.get("folderId"))
    password = str(args.get("password", "") or "")
    access_key = str(args.get("accessKey", "") or "")
    try:
        expires_in_seconds = int(args.get("expiresInSeconds", 24 * 3600))
    except (TypeError, ValueError):
        raise ValueError("expiresInSeconds must be a number")

    try:
        validate_share_password(password)
    except ValueError as e:
        raise ValueError(str(e))

    if access_key:
        try:
            validate_access_key(access_key)
        except ValueError as e:
            raise ValueError(str(e))

    if message_id is None:
        raise ValueError("messageId is required")
    try:
        normalized_message_id = int(message_id)
    except (TypeError, ValueError):
        raise ValueError("messageId must be a number")

    if expires_in_seconds <= 0 or expires_in_seconds > 30 * 24 * 60 * 60:
        raise ValueError("expiresInSeconds must be between 1 second and 30 days")

    # Resolve the file so the share references existing media.
    try:
        vault_key = load_vault_key()
        manifest = await get_manifest(telegram, normalized_message_id, vault_key, folder_id)
    except Exception as e:
        raise ValueError(f"Unable to create share for this file: {e}")

    if not manifest.get("block_message_ids"):
        raise ValueError("File has no blocks to share")

    # Per-file decryption key — scoped to this file, never the vault key.
    salt = base64.b64decode(manifest["salt"])
    master_key = derive_master_key(vault_key, salt)

    # 1. Create the share channel.
    channel = await telegram.create_share_channel(secrets.token_hex(4))

    try:
        # 2. Forward encrypted blocks into the channel.
        new_block_ids = await telegram.forward_blocks_to_channel(
            source_folder_id=folder_id,
            block_ids=manifest["block_message_ids"],
            channel=channel,
        )
        if not new_block_ids:
            raise RuntimeError("Forwarding produced no blocks")

        # 3. Build + encrypt the envelope with the mandatory password.
        payload = {
            "kind": "file",
            "name": manifest["filename"],
            "size": manifest["size"],
            "mime": manifest.get("mime", ""),
            "salt": manifest["salt"],
            "master_key": master_key.hex(),
            "block_size": manifest["block_size"],
            "blocks": new_block_ids,
            "checksum": manifest.get("checksum", ""),
            "created_at": int(time.time()),
        }
        envelope = encrypt_share_payload(payload, password, access_key=access_key)

        # 4. Post the envelope into the channel.
        metadata_message_id = await telegram.post_share_metadata(channel, envelope)

        # 5. Export an invite link so recipients can join.
        invite_hash = await telegram.export_channel_invite(channel)
    except Exception:
        # Roll back the channel if anything above failed.
        try:
            await telegram.delete_share_channel(channel)
        except Exception:
            pass
        raise

    now = int(time.time())
    expiry = now + expires_in_seconds
    revoke_id = uuid.uuid4().hex

    link = build_share_link(
        rid=revoke_id,
        expiry=expiry,
        invite_hash=invite_hash,
        metadata_message_id=metadata_message_id,
        requires_access_key=bool(access_key),
    )

    return {
        "ok": True,
        "mode": "strong" if access_key else "password",
        "revokeId": revoke_id,
        "expiry": expiry,
        "link": link,
        "channelId": channel.id,
        "accessKey": access_key or None,
        "accessKeyRequired": bool(access_key),
    }


async def _share_join(args):
    """Recipient-side: join a share channel and unlock the envelope."""
    link = str(args.get("link", "")).strip()
    password = str(args.get("password", "") or "")
    access_key = str(args.get("accessKey", "") or "")

    if not link:
        raise ValueError("link is required")
    if not password:
        raise ValueError("Password is required")

    try:
        parsed = parse_share_link(link)
    except ValueError as e:
        raise ValueError(str(e))

    if parsed.get("requires_access_key") and not access_key:
        raise ValueError("This share requires the SKYH256 access key")

    if int(parsed["exp"]) < int(time.time()):
        raise ValueError("Share link expired")

    try:
        channel = await telegram.join_channel_by_invite(parsed["inv"])
    except Exception as e:
        raise ValueError(f"Could not join the shared channel: {e}")

    try:
        envelope = await telegram.download_share_metadata(channel, parsed["mid"])
        payload = decrypt_share_payload(envelope, password, access_key=access_key)
    except ValueError as e:
        raise ValueError(str(e))
    except Exception as e:
        raise ValueError(f"Could not read share metadata: {e}")

    return {
        "ok": True,
        "rid": parsed["rid"],
        "expiresAt": parsed["exp"],
        "channelId": channel.id,
        "file": {
            "kind": payload.get("kind", "file"),
            "name": payload["name"],
            "size": payload["size"],
            "mime": payload.get("mime", ""),
            "blockSize": payload["block_size"],
            "blocks": payload["blocks"],
            "salt": payload["salt"],
            "masterKey": payload["master_key"],
            "checksum": payload.get("checksum", ""),
            "createdAt": payload.get("created_at"),
        },
    }


async def _share_download_block(args):
    """Recipient-side: download + decrypt one block of a shared file."""
    link = str(args.get("link", "")).strip()
    password = str(args.get("password", "") or "")
    access_key = str(args.get("accessKey", "") or "")

    if not link:
        raise ValueError("link is required")
    if not password:
        raise ValueError("Password is required")

    try:
        parsed = parse_share_link(link)
    except ValueError as e:
        raise ValueError(str(e))
    if parsed.get("requires_access_key") and not access_key:
        raise ValueError("This share requires the SKYH256 access key")
    if int(parsed["exp"]) < int(time.time()):
        raise ValueError("Share link expired")

    try:
        block_index = int(args.get("blockIndex"))
    except (TypeError, ValueError):
        raise ValueError("blockIndex must be a number")

    try:
        channel = await telegram.join_channel_by_invite(parsed["inv"])
        envelope = await telegram.download_share_metadata(channel, parsed["mid"])
        payload = decrypt_share_payload(envelope, password, access_key=access_key)
    except ValueError as e:
        raise ValueError(str(e))
    except Exception as e:
        raise ValueError(f"Could not access shared media: {e}")

    blocks = payload.get("blocks") or []
    if block_index < 0 or block_index >= len(blocks):
        raise ValueError("blockIndex out of range")

    encrypted = await telegram.download_block(blocks[block_index], channel.id)

    salt = base64.b64decode(payload["salt"])
    master_key = bytes.fromhex(payload["master_key"])
    crypto = AESGCMCrypto(master_key, salt)
    try:
        plaintext = crypto.decrypt_block(encrypted, block_index)
    finally:
        crypto.close()

    return {"ok": True, "data_b64": base64.b64encode(plaintext).decode("ascii")}


async def _dispatch(cmd, args):
    if cmd == "cmd_auth_request_code":
        await telegram.request_code(args["phone"], int(args["apiId"]), args["apiHash"])
        return {"ok": True}
    if cmd == "cmd_auth_sign_in":
        return await telegram.sign_in(args["code"])
    if cmd == "cmd_auth_check_password":
        return await telegram.check_password(args["password"])
    if cmd == "cmd_connect":
        api_id = args.get("apiId") or telegram._load_api_id()
        if not api_id:
            raise RuntimeError("SESSION_EXPIRED: No saved API ID. Please log in.")
        await telegram.connect(int(api_id))
        telegram._save_api_id(int(api_id))
        # Sweep stale resume state from interrupted sessions.
        TransferProgress.cleanup_old_transfers(max_age_hours=24)
        return {"ok": True}
    if cmd == "cmd_logout":
        await telegram.logout()
        return {"ok": True}
    if cmd == "cmd_scan_folders":
        return await telegram.scan_folders()
    if cmd == "cmd_create_folder":
        return await telegram.create_folder(args["name"])
    if cmd == "cmd_delete_folder":
        await telegram.delete_folder(int(args["folderId"]))
        _invalidate_listing_cache()
        return {"ok": True}
    if cmd == "cmd_get_cached_listing":
        cached = _load_listing_cache()
        if not cached:
            return {"cached": False, "folders": [], "files": []}
        return {
            "cached": True,
            "folders": cached["folders"],
            "files": cached["files"],
            "vault_mismatch": cached["vault_mismatch"],
            "updated_at": cached.get("updated_at", 0),
        }
    if cmd == "cmd_get_files":
        return await list_files_from_manifests(telegram, load_vault_key(), _folder_id(args.get("folderId")))
    if cmd == "cmd_sync_all_folders":
        return await _sync_all_folders()
    if cmd == "cmd_rename_file":
        return await _rename_file(args)
    if cmd == "cmd_upload_file":
        return await _upload_file(args)
    if cmd == "cmd_download_file":
        return await _download_file(args)
    if cmd == "cmd_delete_file":
        message_id = int(args["messageId"])
        folder_id = _folder_id(args.get("folderId"))
        await telegram.delete_file(message_id, folder_id)
        _delete_cached_thumbnail(folder_id, message_id)
        _invalidate_listing_cache()
        return {"ok": True}
    if cmd == "cmd_delete_files":
        folder_id = _folder_id(args.get("folderId"))
        message_ids = [int(v) for v in args.get("messageIds", [])]
        await telegram.delete_messages(message_ids, folder_id)
        for message_id in message_ids:
            _delete_cached_thumbnail(folder_id, message_id)
        _invalidate_listing_cache()
        return {"ok": True}
    if cmd == "cmd_move_files":
        await telegram.move_files(
            [int(v) for v in args.get("messageIds", [])],
            _folder_id(args.get("sourceFolderId")),
            _folder_id(args.get("targetFolderId")),
        )
        _invalidate_listing_cache()
        return {"ok": True}
    if cmd == "cmd_search_global":
        return await telegram.search_global(args.get("query", ""))
    if cmd == "cmd_export_vault":
        return {"backup": base64.b64encode(export_vault_key(args["password"])).decode("ascii")}
    if cmd == "cmd_import_vault":
        import_vault_key(base64.b64decode(args["backup"]), args["password"])
        _on_vault_key_changed()
        return {"ok": True}
    if cmd == "cmd_export_vault_file":
        password = str(args.get("password", ""))
        path = str(args.get("path", "")).strip()
        if len(password) < 12:
            raise ValueError("Use a recovery password with at least 12 characters")
        if not path:
            raise ValueError("A backup destination is required")
        if os.path.exists(path):
            raise ValueError("A file already exists at this location; choose a new filename")
        backup_bytes = export_vault_key(password)
        with open(path, "xb") as backup_file:
            backup_file.write(backup_bytes)
        return {"ok": True, "path": path}
    if cmd == "cmd_import_vault_file":
        password = str(args.get("password", ""))
        path = str(args.get("path", "")).strip()
        if not path or not os.path.isfile(path):
            raise ValueError("Select a valid recovery file")
        if not password:
            raise ValueError("Recovery password is required")
        with open(path, "rb") as backup_file:
            backup_bytes = backup_file.read()
        import_vault_key(backup_bytes, password)
        _on_vault_key_changed()
        return {"ok": True, "message": "Vault restored successfully"}
    if cmd == "cmd_vault_status":
        return {"exists": vault_key_exists(), "path": os.path.join(os.environ["APPDATA"], "TeleVault", "data", "vault.key")}
    if cmd == "cmd_get_bandwidth":
        return {"up_bytes": telegram._bytes_uploaded, "down_bytes": telegram._bytes_downloaded}
    if cmd == "cmd_clean_cache":
        await telegram.clean_cache()
        _db_clear_thumbnails()
        stream_server.clear_cache()
        return {"ok": True}
    if cmd == "cmd_storage_stats":
        return await _storage_stats(args)
    if cmd == "cmd_get_transfer_progress":
        return _transfer_progress(args)
    if cmd == "cmd_cancel_transfer":
        _mark_cancelled(args.get("transferId", ""))
        return {"ok": True}
    if cmd == "cmd_share_create":
        return await _share_create(args)
    if cmd == "cmd_share_join":
        return await _share_join(args)
    if cmd == "cmd_share_download_block":
        return await _share_download_block(args)
    if cmd == "cmd_get_thumbnail":
        return await _get_thumbnail(args)
    if cmd == "cmd_stream_server_start":
        return _stream_server_start()
    if cmd == "cmd_stream_server_stop":
        return _stream_server_stop()
    if cmd == "cmd_is_network_available":
        try:
            with socket.create_connection(("149.154.167.50", 443), timeout=3):
                return True
        except OSError:
            return False
    raise NotImplementedError(cmd)


def dispatch(cmd, args_json="{ }"):
    try:
        args = json.loads(args_json or "{}")
        result = _run(_dispatch(cmd, args))
        return json.dumps(_json_safe(result))
    except Exception as exc:
        return json.dumps({"ok": False, "error": str(exc)})
