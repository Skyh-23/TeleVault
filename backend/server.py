"""
TeleVault FastAPI Server
=========================
HTTP server at localhost:8765 — the bridge between frontend and backend.

All routes map to frontend invoke() calls:
- Auth:    cmd_auth_request_code, cmd_auth_sign_in, cmd_auth_check_password, cmd_connect, cmd_logout
- Folders: cmd_scan_folders, cmd_create_folder, cmd_delete_folder
- Files:   cmd_get_files, cmd_upload_file, cmd_download_file, cmd_delete_file, cmd_move_files
- Search:  cmd_search_global
- Utils:   cmd_get_bandwidth, cmd_clean_cache
- Events:  /events (SSE for progress)

Author: Liethueis-Foundation © 2026
"""

import os
import sys
import json
import uuid
import secrets
import asyncio
import base64
import hashlib
import logging
import mimetypes
import time
import subprocess
import tempfile
from typing import Optional, Dict, Any, List

from fastapi import FastAPI, Request, HTTPException
from fastapi.middleware.cors import CORSMiddleware
from fastapi.staticfiles import StaticFiles
from fastapi.responses import JSONResponse, StreamingResponse, PlainTextResponse, Response
import uvicorn

from config import (
    SERVER_HOST, SERVER_PORT, FRONTEND_DIST_DIR,
    CACHE_DIR, DATA_DIR, BLOCK_SIZE_STREAM, BLOCK_SIZE_STORAGE,
)
from vault import load_vault_key, derive_master_key, export_vault_key, import_vault_key
from telegram import TeleVaultTelegram
from manifest import (
    create_manifest,
    upload_manifest,
    get_manifest,
    list_files_from_manifests,
    compute_file_checksum, get_mime_type,
)
from transfer_progress import TransferProgress
from televault_crypto import (
    get_block_size, split_file,
    BLOCK_SIZE_STREAM as CRYPTO_BLOCK_STREAM,
    BLOCK_SIZE_STORAGE as CRYPTO_BLOCK_STORAGE,
    secure_random_bytes, SALT_SIZE,
)
from aes_gcm_crypto import (
    AESGCMCrypto, ALGO_ID as AES_GCM_ALGO_ID,
)

logger = logging.getLogger("televault.server")

# ─────────────────────────────────────────────
#  App Setup
# ─────────────────────────────────────────────

app = FastAPI(title="TeleVault", version="1.0.0")

# CORS — allow all origins (pure JSON API, no cookies/credentials used)
app.add_middleware(
    CORSMiddleware,
    allow_origins=["*"],
    allow_credentials=False,
    allow_methods=["*"],
    allow_headers=["*"],
)

# Global state
telegram = TeleVaultTelegram()

# SSE event queues — keyed by client_id (each connection has its own queue)
_progress_queues: Dict[str, asyncio.Queue] = {}

# Active transfer tracking — maps transfer_id to client_id
_transfer_clients: Dict[str, str] = {}

# Streaming concurrency limit — max 3 concurrent streams
_stream_semaphore = asyncio.Semaphore(3)

# Thumbnail generation concurrency limit — max 5 concurrent ffmpeg processes
_thumb_semaphore = asyncio.Semaphore(5)  # Increased for better performance

# Manifest memory cache — avoid re-downloading manifests
_manifest_cache: Dict[int, tuple[List[dict], float]] = {}  # folder_id -> (files, timestamp)
MANIFEST_CACHE_TTL = 30  # seconds

# In-flight manifest download deduplication
_manifest_download_tasks: Dict[int, asyncio.Task] = {}  # folder_id -> active download task

TRANSFER_CLEANUP_HOURS = 24 * 7
STREAM_PREFETCH_BLOCKS = 3
STREAM_CACHE_DIR = os.path.join(CACHE_DIR, "stream")
STREAM_CACHE_MAX_BYTES_PER_FILE = 100 * 1024 * 1024  # 100 MiB per file cache
THUMBNAIL_CACHE_DIR = os.path.join(CACHE_DIR, "thumbnails")
SHARES_FILE = os.path.join(DATA_DIR, "shares.json")
SHARE_DEFAULT_EXPIRY_SECONDS = 24 * 60 * 60
os.makedirs(STREAM_CACHE_DIR, exist_ok=True)
os.makedirs(THUMBNAIL_CACHE_DIR, exist_ok=True)


# ─────────────────────────────────────────────
#  Thumbnail Generation
# ─────────────────────────────────────────────

def generate_thumbnail_ffmpeg(file_path: str, output_path: str) -> bool:
    """
    Generate thumbnail using ffmpeg.
    Returns True if successful, False otherwise.
    Uses WebP format for better compression and performance.
    """
    try:
        # Check if file is a video
        ext = os.path.splitext(file_path)[1].lower()
        video_extensions = ['.mp4', '.mov', '.avi', '.mkv', '.webm', '.flv', '.wmv', '.m4v']
        image_extensions = ['.jpg', '.jpeg', '.png', '.gif', '.webp', '.bmp', '.tiff']
        
        if ext in image_extensions:
            # For images, resize with ffmpeg to WebP
            cmd = [
                'ffmpeg', '-i', file_path,
                '-vf', 'scale=320:180:force_original_aspect_ratio=decrease,pad=320:180:(ow-iw)/2:(oh-ih)/2',
                '-q:v', '60',  # WebP quality
                '-f', 'webp',  # WebP format
                '-y', output_path
            ]
        elif ext in video_extensions:
            # For videos, extract frame at 1 second to WebP
            cmd = [
                'ffmpeg', '-i', file_path,
                '-ss', '00:00:01',
                '-vframes', '1',
                '-vf', 'scale=320:180:force_original_aspect_ratio=decrease,pad=320:180:(ow-iw)/2:(oh-ih)/2',
                '-q:v', '60',  # WebP quality
                '-f', 'webp',  # WebP format
                '-y', output_path
            ]
        else:
            return False  # Not a media file
        
        result = subprocess.run(
            cmd,
            stdout=subprocess.PIPE,
            stderr=subprocess.PIPE,
            timeout=10
        )
        
        if result.returncode == 0 and os.path.exists(output_path):
            return True
        else:
            logger.warning(f"ffmpeg failed: {result.stderr.decode()}")
            return False
    except subprocess.TimeoutExpired:
        logger.warning(f"ffmpeg timeout for {file_path}")
        return False
    except Exception as e:
        logger.warning(f"ffmpeg error: {e}")
        return False


async def generate_thumbnail_cached(file_path: str, file_id: str) -> Optional[bytes]:
    """
    Generate thumbnail with caching and concurrency control.
    Returns thumbnail bytes or None if failed.
    """
    # Generate cache key from file path, size, and mtime to avoid collisions
    stat = os.stat(file_path)
    cache_key_raw = f"{file_path}-{stat.st_size}-{stat.st_mtime}"
    cache_key = hashlib.sha256(cache_key_raw.encode()).hexdigest()[:32] + ".webp"  # WebP format
    cache_path = os.path.join(THUMBNAIL_CACHE_DIR, cache_key)
    
    # Check cache first
    if os.path.exists(cache_path):
        try:
            with open(cache_path, 'rb') as f:
                return f.read()
        except Exception:
            pass  # Cache read failed, regenerate
    
    # Generate with semaphore to limit concurrent ffmpeg processes
    async with _thumb_semaphore:
        # Run ffmpeg in thread pool to avoid blocking event loop
        loop = asyncio.get_event_loop()
        success = await loop.run_in_executor(
            None,
            generate_thumbnail_ffmpeg,
            file_path,
            cache_path
        )
        
        if success and os.path.exists(cache_path):
            try:
                with open(cache_path, 'rb') as f:
                    return f.read()
            except Exception:
                pass
        
        return None


def _migrate_old_session() -> None:
    """
    One-time migration: copy session + api_hash from the old location
    (backend/data/) to the new stable location (%APPDATA%/TeleVault/data/).

    This runs at startup so existing users aren't forced to re-authenticate
    after updating to the version that moved DATA_DIR.
    """
    import shutil
    from config import BACKEND_DIR

    old_data = os.path.join(BACKEND_DIR, "data")
    if not os.path.isdir(old_data):
        return  # Nothing to migrate

    files_to_migrate = [
        ("televault.session", "televault.session"),
        ("api_hash.txt",      "api_hash.txt"),
        ("vault.key",         "vault.key"),
    ]

    migrated = []
    for src_name, dst_name in files_to_migrate:
        src = os.path.join(old_data, src_name)
        dst = os.path.join(DATA_DIR, dst_name)
        if os.path.exists(src) and not os.path.exists(dst):
            try:
                shutil.copy2(src, dst)
                migrated.append(src_name)
                logger.info(f"Migrated {src_name} → {dst}")
            except Exception as exc:
                logger.warning(f"Could not migrate {src_name}: {exc}")

    if migrated:
        logger.info(f"Session migration complete: {migrated}")


# Run migration before anything else touches session files
_migrate_old_session()


# ─────────────────────────────────────────────
#  SSE Progress Events
# ─────────────────────────────────────────────

def emit_progress(transfer_id: str, percent: int) -> None:
    """Push a progress update into the SSE queue for a transfer."""
    payload = {
        "id": transfer_id,
        "percent": min(percent, 100),
    }
    client_id = _transfer_clients.get(transfer_id)
    if client_id and client_id in _progress_queues:
        try:
            _progress_queues[client_id].put_nowait(payload)
        except asyncio.QueueFull:
            pass  # Drop old events if queue is full
        return

    # Fallback: broadcast when transfer is not bound to a specific client.
    for queue in _progress_queues.values():
        try:
            queue.put_nowait(payload)
        except asyncio.QueueFull:
            continue


def _stream_cache_file_path(file_message_id: int, block_index: int) -> str:
    return os.path.join(STREAM_CACHE_DIR, f"{file_message_id}-{block_index}.bin")


def _read_cached_stream_block(file_message_id: int, block_index: int) -> Optional[bytes]:
    cache_path = _stream_cache_file_path(file_message_id, block_index)
    if not os.path.exists(cache_path):
        return None
    try:
        with open(cache_path, "rb") as f:
            return f.read()
    except OSError:
        return None


def _cleanup_stream_cache_for_file(file_message_id: int) -> None:
    prefix = f"{file_message_id}-"
    files = []
    total_size = 0

    for name in os.listdir(STREAM_CACHE_DIR):
        if not name.startswith(prefix):
            continue
        full_path = os.path.join(STREAM_CACHE_DIR, name)
        try:
            stat = os.stat(full_path)
        except OSError:
            continue
        files.append((full_path, stat.st_mtime, stat.st_size))
        total_size += stat.st_size

    if total_size <= STREAM_CACHE_MAX_BYTES_PER_FILE:
        return

    files.sort(key=lambda item: item[1])  # Oldest first
    for full_path, _, size in files:
        try:
            os.remove(full_path)
            total_size -= size
        except OSError:
            continue
        if total_size <= STREAM_CACHE_MAX_BYTES_PER_FILE:
            break


def _write_cached_stream_block(file_message_id: int, block_index: int, data: bytes) -> None:
    cache_path = _stream_cache_file_path(file_message_id, block_index)
    try:
        with open(cache_path, "wb") as f:
            f.write(data)
    except OSError:
        return
    _cleanup_stream_cache_for_file(file_message_id)


def _load_share_records() -> Dict[str, Dict[str, Any]]:
    if not os.path.exists(SHARES_FILE):
        return {}
    try:
        with open(SHARES_FILE, "r", encoding="utf-8") as f:
            data = json.load(f)
        if not isinstance(data, dict):
            return {}
        return {str(k): v for k, v in data.items() if isinstance(v, dict)}
    except Exception:
        logger.warning("Failed to read shares.json; using empty share registry")
        return {}


def _save_share_records(records: Dict[str, Dict[str, Any]]) -> None:
    tmp_path = f"{SHARES_FILE}.tmp"
    with open(tmp_path, "w", encoding="utf-8") as f:
        json.dump(records, f, indent=2)
    os.replace(tmp_path, SHARES_FILE)


def _hash_share_key(share_key: str) -> str:
    return hashlib.sha256(share_key.encode("utf-8")).hexdigest()


def _normalize_folder_id(raw_folder_id: Any) -> Optional[int]:
    if raw_folder_id is None or raw_folder_id == "":
        return None
    try:
        return int(raw_folder_id)
    except (TypeError, ValueError):
        raise HTTPException(400, "folderId must be a number")


def _validate_share_access(
    file_message_id: int,
    requested_folder_id: Optional[int],
    revoke_id: Optional[str],
    exp: Optional[Any],
    share_key: Optional[str],
) -> Optional[int]:
    """
    Validate a share link token and return the effective folder_id.
    If revoke_id is not provided, returns requested_folder_id unchanged.
    """
    if not revoke_id:
        return requested_folder_id

    records = _load_share_records()
    record = records.get(revoke_id)
    if not record:
        raise HTTPException(403, "Invalid share link")

    if not bool(record.get("active", False)):
        raise HTTPException(403, "Share link revoked")

    try:
        record_file_id = int(record.get("file_id"))
        record_expiry = int(record.get("expiry"))
    except (TypeError, ValueError):
        raise HTTPException(403, "Invalid share metadata")

    if record_file_id != file_message_id:
        raise HTTPException(403, "Share link does not match this file")

    now = int(time.time())
    if now > record_expiry:
        record["active"] = False
        record["revoked_at"] = now
        _save_share_records(records)
        raise HTTPException(403, "Share link expired")

    if exp is not None:
        try:
            provided_exp = int(exp)
        except (TypeError, ValueError):
            raise HTTPException(403, "Invalid share expiry token")
        if provided_exp != record_expiry:
            raise HTTPException(403, "Share link tampered")

    expected_key_hash = record.get("access_key_hash")
    if expected_key_hash:
        if not share_key:
            raise HTTPException(401, "Share key required")
        if _hash_share_key(share_key) != expected_key_hash:
            raise HTTPException(403, "Invalid share key")

    record_folder_id = record.get("folder_id")
    effective_folder_id = requested_folder_id
    if record_folder_id is not None:
        try:
            record_folder_id = int(record_folder_id)
        except (TypeError, ValueError):
            record_folder_id = None
    if effective_folder_id is None and record_folder_id is not None:
        effective_folder_id = record_folder_id
    elif (
        effective_folder_id is not None
        and record_folder_id is not None
        and effective_folder_id != record_folder_id
    ):
        raise HTTPException(403, "Share folder mismatch")

    return effective_folder_id


def _build_share_link(
    message_id: int,
    revoke_id: str,
    expiry: int,
    folder_id: Optional[int],
    include_key: bool,
    share_key: str,
) -> str:
    params = [
        f"id={message_id}",
        f"rid={revoke_id}",
        f"exp={expiry}",
    ]
    if folder_id is not None:
        params.append(f"folderId={folder_id}")
    if include_key:
        params.append(f"key={share_key}")
    return f"televault://file?{'&'.join(params)}"


@app.get("/events")
async def sse_events(request: Request):
    """
    Server-Sent Events endpoint.
    Frontend connects here to receive real-time progress updates.

    Query params:
    - transfer_id: optional, registers this connection for a specific transfer
    """
    queue = asyncio.Queue(maxsize=100)
    client_id = str(uuid.uuid4())
    _progress_queues[client_id] = queue

    # Register transfer_id mapping if provided
    transfer_id = request.query_params.get("transfer_id")
    if transfer_id:
        _transfer_clients[transfer_id] = client_id

    async def event_generator():
        try:
            while True:
                if await request.is_disconnected():
                    break
                try:
                    event = await asyncio.wait_for(queue.get(), timeout=30.0)
                    yield f"data: {json.dumps(event)}\n\n"
                except asyncio.TimeoutError:
                    # Send keepalive
                    yield f": keepalive\n\n"
        except asyncio.CancelledError:
            pass
        finally:
            # Cleanup
            _progress_queues.pop(client_id, None)
            if transfer_id:
                _transfer_clients.pop(transfer_id, None)

    return StreamingResponse(
        event_generator(),
        media_type="text/event-stream",
        headers={
            "Cache-Control": "no-cache",
            "Connection": "keep-alive",
            "X-Accel-Buffering": "no",
        },
    )


# ─────────────────────────────────────────────
#  Helper: Parse JSON body
# ─────────────────────────────────────────────

async def parse_body(request: Request) -> dict:
    """Parse JSON request body, return empty dict if none."""
    try:
        body = await request.json()
        return body if isinstance(body, dict) else {}
    except Exception:
        return {}


# ─────────────────────────────────────────────
#  Auth Routes
# ─────────────────────────────────────────────

@app.post("/cmd_auth_request_code")
async def cmd_auth_request_code(request: Request):
    body = await parse_body(request)
    phone = body.get("phone", "")
    api_id = body.get("apiId")
    api_hash = body.get("apiHash", "")

    if not phone or not api_id or not api_hash:
        raise HTTPException(400, "phone, apiId, and apiHash are required")

    try:
        api_id = int(api_id)
    except (ValueError, TypeError):
        raise HTTPException(400, "apiId must be a number")

    try:
        await telegram.request_code(phone, api_id, api_hash)
        # Save API credentials for reconnection after app restart.
        telegram._save_api_credentials(api_id, api_hash)
        return JSONResponse({"ok": True})
    except Exception as e:
        error_msg = str(e)
        raise HTTPException(400, error_msg)


@app.post("/cmd_auth_sign_in")
async def cmd_auth_sign_in(request: Request):
    body = await parse_body(request)
    code = body.get("code", "")

    if not code:
        raise HTTPException(400, "code is required")

    try:
        result = await telegram.sign_in(code)
        return JSONResponse(result)
    except Exception as e:
        raise HTTPException(400, str(e))


@app.post("/cmd_auth_check_password")
async def cmd_auth_check_password(request: Request):
    body = await parse_body(request)
    password = body.get("password", "")

    if not password:
        raise HTTPException(400, "password is required")

    try:
        result = await telegram.check_password(password)
        return JSONResponse(result)
    except Exception as e:
        raise HTTPException(400, str(e))


@app.post("/cmd_connect")
async def cmd_connect(request: Request):
    body = await parse_body(request)
    api_id = body.get("apiId") or telegram._load_api_id()

    try:
        api_id = int(api_id)
    except (ValueError, TypeError):
        raise HTTPException(401, "SESSION_EXPIRED: No saved API ID. Please log in.")

    try:
        await telegram.connect(api_id)
        telegram._save_api_id(api_id)
        return JSONResponse({"ok": True})
    except RuntimeError as e:
        error_msg = str(e)
        if "SESSION_EXPIRED" in error_msg:
            # Real auth failure — user must log in again with OTP
            raise HTTPException(401, error_msg)
        elif "NETWORK_ERROR" in error_msg:
            # Transient network problem — frontend should retry, not logout
            raise HTTPException(503, error_msg)
        else:
            raise HTTPException(400, error_msg)
    except Exception as e:
        raise HTTPException(400, str(e))


@app.post("/cmd_logout")
async def cmd_logout(request: Request):
    try:
        await telegram.logout()
        return JSONResponse({"ok": True})
    except Exception as e:
        raise HTTPException(400, str(e))


# ─────────────────────────────────────────────
#  Folder Routes
# ─────────────────────────────────────────────

@app.post("/cmd_scan_folders")
async def cmd_scan_folders(request: Request):
    try:
        folders = await telegram.scan_folders()
        return JSONResponse(folders)
    except Exception as e:
        raise HTTPException(400, str(e))


@app.post("/cmd_sync_all_folders")
async def cmd_sync_all_folders(request: Request):
    """
    Sync all folders at once - get files from all folders combined.
    Returns: { folders: [...], files: [...] }
    """
    try:
        folders = await telegram.scan_folders()
        all_files = []
        target_folders = [{"id": None, "name": "Saved Messages"}, *folders]
        
        # Get files from Saved Messages and each TeleVault folder.
        for folder in target_folders:
            folder_id = folder["id"]
            files = await list_files_from_manifests(
                telegram_client=telegram,
                folder_id=folder_id,
                vault_key=load_vault_key(),
                quick_mode=True
            )
            for file in files:
                file["folder_id"] = folder_id
            cache_key = folder_id if folder_id else 0
            _manifest_cache[cache_key] = (files, time.time())
            all_files.extend(files)
        
        return JSONResponse({
            "folders": folders,
            "files": all_files,
            "total_files": len(all_files)
        })
    except Exception as e:
        raise HTTPException(400, str(e))


@app.post("/cmd_create_folder")
async def cmd_create_folder(request: Request):
    body = await parse_body(request)
    name = body.get("name", "")

    if not name:
        raise HTTPException(400, "name is required")

    try:
        folder = await telegram.create_folder(name)
        return JSONResponse(folder)
    except Exception as e:
        raise HTTPException(400, str(e))


@app.post("/cmd_delete_folder")
async def cmd_delete_folder(request: Request):
    body = await parse_body(request)
    folder_id = body.get("folderId")

    if folder_id is None:
        raise HTTPException(400, "folderId is required")

    try:
        await telegram.delete_folder(int(folder_id))
        return JSONResponse({"ok": True})
    except Exception as e:
        raise HTTPException(400, str(e))


# ─────────────────────────────────────────────
#  File Routes
# ─────────────────────────────────────────────

@app.post("/cmd_get_files")
async def cmd_get_files(request: Request):
    body = await parse_body(request)
    folder_id = body.get("folderId")
    normalized_folder_id = _normalize_folder_id(folder_id)
    cache_key = normalized_folder_id if normalized_folder_id else 0
    
    try:
        # Try SQLite first (instant metadata lookup)
        from db import get_files_by_folder
        files = get_files_by_folder(normalized_folder_id, limit=1000)
        
        if files:
            logger.info(f"Retrieved {len(files)} files from SQLite for folder {folder_id}")
            return JSONResponse(files)
        
        # Fallback to Telegram if SQLite is empty (first sync)
        logger.info(f"SQLite empty for folder {folder_id}, falling back to Telegram")
        
        # Check manifest cache first
        current_time = time.time()
        if cache_key in _manifest_cache:
            cached_files, cache_time = _manifest_cache[cache_key]
            if current_time - cache_time < MANIFEST_CACHE_TTL:
                logger.info(f"Using cached manifest for folder {folder_id}")
                return JSONResponse(cached_files)
        
        # Check if there's an in-flight download for this folder
        if cache_key in _manifest_download_tasks:
            logger.info(f"Waiting for in-flight manifest download for folder {folder_id}")
            # Wait for the existing task to complete
            files = await _manifest_download_tasks[cache_key]
            return JSONResponse(files)
        
        # Create a new download task
        async def download_manifests():
            try:
                # Health check: ensure Telegram client is connected
                if telegram and telegram.client and not telegram.client.is_connected():
                    await telegram.client.connect()
                
                vault_key = load_vault_key()
                files = await list_files_from_manifests(
                    telegram, vault_key, folder_id, quick_mode=True
                )
                
                # Update cache
                _manifest_cache[cache_key] = (files, current_time)
                
                return files
            finally:
                # Clean up the task reference
                _manifest_download_tasks.pop(cache_key, None)
        
        # Start the download task
        task = asyncio.create_task(download_manifests())
        _manifest_download_tasks[cache_key] = task
        
        files = await task
        return JSONResponse(files)
        
    except Exception as e:
        logger.error(f"Failed to list files: {e}")
        _manifest_download_tasks.pop(cache_key, None)
        raise HTTPException(400, str(e))

@app.post("/cmd_get_thumbnail")
async def cmd_get_thumbnail(request: Request):
    body = await parse_body(request)

    message_id = body.get("messageId")
    folder_id = body.get("folderId")

    # optional share params
    rid = body.get("rid")
    exp = body.get("exp")
    key = body.get("key")

    if message_id is None:
        raise HTTPException(400, "messageId is required")

    try:
        # 🔥 Direct stream URL (thumbnail ki jagah)
        url = f"/stream?path={message_id}"

        if folder_id:
            url += f"&folderId={folder_id}"

        if rid:
            url += f"&rid={rid}"
        if exp:
            url += f"&exp={exp}"
        if key:
            url += f"&key={key}"

        return JSONResponse({
        "ok": True,
        "url": f"http://localhost:8765{url}"
        })

    except Exception as e:
        raise HTTPException(400, str(e))

@app.post("/cmd_upload_file")
async def cmd_upload_file(request: Request):
    """
    Upload a file to Telegram with resume capability:
    1. Read local file
    2. Split into blocks
    3. Encrypt each block with AES-GCM
    4. Upload blocks to Telegram (skip already uploaded if resuming)
    5. Create + upload manifest
    6. Save progress after each block for resume support

    Password is optional per-file (frontend can send it in the request).
    """
    body = await parse_body(request)
    file_path = body.get("path", "")
    folder_id = body.get("folderId")
    transfer_id = body.get("transferId", str(uuid.uuid4()))
    file_password = body.get("password")  # Optional per-file password
    resume = body.get("resume", False)  # Whether to resume existing transfer
    share_revoke_id = body.get("rid") or body.get("revokeId")
    share_exp = body.get("exp")
    share_key = body.get("key")

    if not file_path or not os.path.exists(file_path):
        raise HTTPException(400, f"File not found: {file_path}")

    progress: Optional[TransferProgress] = None
    crypto: Optional[AESGCMCrypto] = None

    try:
        # Health check: ensure Telegram client is connected
        if telegram and telegram.client and not telegram.client.is_connected():
            await telegram.client.connect()
        
        TransferProgress.cleanup_old_transfers(max_age_hours=TRANSFER_CLEANUP_HOURS)

        vault_key = load_vault_key()
        filename = os.path.basename(file_path)
        file_size = os.path.getsize(file_path)
        block_size = get_block_size(filename)
        mime_type = get_mime_type(filename)
        normalized_folder_id = _normalize_folder_id(folder_id)
        total_blocks = (file_size + block_size - 1) // block_size
        if total_blocks == 0:
            total_blocks = 1

        logger.info(f"Upload: {filename} ({file_size} bytes), block_size={block_size}, total_blocks={total_blocks}")

        # Load existing transfer progress only when it matches this upload.
        if resume:
            loaded = TransferProgress.load(transfer_id)
            if loaded and loaded.transfer_type == "upload":
                # Validate using file_size and total_blocks (file_path not stored for privacy)
                if loaded.file_size == file_size and loaded.total_blocks == total_blocks:
                    progress = loaded
                    logger.info(
                        f"Resuming upload: {len(progress.get_completed_blocks())}/{total_blocks} blocks completed"
                    )
                else:
                    logger.warning(
                        f"Ignoring stale upload state for transfer_id={transfer_id}. "
                        f"Stored size={loaded.file_size}, requested size={file_size}"
                    )

        if not progress:
            progress = TransferProgress(
                transfer_type="upload",
                file_path=file_path,
                total_blocks=total_blocks,
                folder_id=normalized_folder_id,
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

        # Derive master key: vault_key + optional password
        master_key = derive_master_key(vault_key, file_salt, password=file_password)

        # Create AES-GCM crypto instance with derived key
        crypto = AESGCMCrypto(master_key, file_salt)

        checksum = progress.get_metadata("checksum")
        if not isinstance(checksum, str) or not checksum:
            checksum = compute_file_checksum(file_path)
            progress.set_metadata("checksum", checksum)

        uploaded_block_ids: Dict[int, int] = {}
        for block_idx in progress.get_completed_blocks():
            msg_id = progress.get_block_message_id(block_idx)
            if msg_id is not None:
                uploaded_block_ids[block_idx] = msg_id

        # Remove inconsistent completed markers (completed block without Telegram message ID).
        progress.uploaded_blocks = sorted(uploaded_block_ids.keys())
        progress.save()

        if uploaded_block_ids:
            logger.info(f"Loaded {len(uploaded_block_ids)} existing uploaded blocks from transfer state")
            emit_progress(transfer_id, int((len(uploaded_block_ids) / total_blocks) * 95))

        for block_index, chunk in split_file(file_path, block_size):
            if block_index in uploaded_block_ids:
                continue

            encrypted_block = crypto.encrypt_block(chunk, block_index)
            block_filename = f"{uuid.uuid4().hex}.tvblock"
            progress_cb = None

            if total_blocks > 1:
                def _block_progress(sent: int, total: int) -> None:
                    block_progress = (sent / total) if total > 0 else 0
                    current_percent = int(((block_index + block_progress) / total_blocks) * 95)
                    emit_progress(transfer_id, current_percent)

                progress_cb = _block_progress

            msg_id = await telegram.upload_block(
                data=encrypted_block,
                filename=block_filename,
                folder_id=normalized_folder_id,
                progress_callback=progress_cb,
            )
            progress.set_block_message_id(block_index, msg_id)
            progress.add_block(block_index)
            uploaded_block_ids[block_index] = msg_id
            emit_progress(transfer_id, int((len(uploaded_block_ids) / total_blocks) * 95))

        if len(uploaded_block_ids) != total_blocks:
            raise ValueError(
                f"Upload incomplete for transfer {transfer_id}: "
                f"{len(uploaded_block_ids)}/{total_blocks} blocks available"
            )

        block_message_ids = []
        for block_idx in range(total_blocks):
            msg_id = uploaded_block_ids.get(block_idx)
            if msg_id is None:
                raise ValueError(f"Missing block message ID for block {block_idx}")
            block_message_ids.append(msg_id)

        logger.info(f"About to check thumbnail generation: resume={resume}, filename={filename}")
        
        # Upload thumbnail (always generate, regardless of resume)
        thumbnail_block_id = None
        thumbnail_local_path = None
        thumbnail_data_for_cache = None
        try:
            logger.info(f"Attempting thumbnail generation for: {filename}")
            # Generate thumbnail with caching and concurrency control
            thumbnail_data = await generate_thumbnail_cached(file_path, filename)
            
            if thumbnail_data:
                logger.info(f"Thumbnail generated successfully, size: {len(thumbnail_data)} bytes")
                thumbnail_data_for_cache = thumbnail_data
                
                # Encrypt thumbnail with reserved block index 999999
                encrypted_thumbnail = crypto.encrypt_block(thumbnail_data, 999999)
                
                # Upload as standalone block with random name (privacy)
                thumbnail_filename = f"tv_{uuid.uuid4().hex}"
                thumbnail_msg_id = await telegram.upload_block(
                    data=encrypted_thumbnail,
                    filename=thumbnail_filename,
                    folder_id=normalized_folder_id
                )
                thumbnail_block_id = thumbnail_msg_id
                logger.info(f"Thumbnail uploaded: msg_id={thumbnail_block_id}")
            else:
                logger.warning(f"Thumbnail generation returned no data for: {filename}")
        except Exception as e:
            logger.warning(f"Failed to generate/upload thumbnail: {e} (continuing without thumbnail)")

        # Create and upload manifest
        manifest = create_manifest(
            filename=filename,
            file_size=file_size,
            mime_type=mime_type,
            block_size=block_size,
            total_blocks=total_blocks,
            block_message_ids=block_message_ids,
            salt=file_salt,
            checksum=checksum,
            password_protected=bool(file_password),
            thumbnail_block_id=thumbnail_block_id,
        )

        logger.info(f"Uploading manifest for {filename}...")
        manifest_msg_id = await upload_manifest(telegram, manifest, vault_key, normalized_folder_id)
        logger.info(f"Manifest uploaded: msg_id={manifest_msg_id}")

        if thumbnail_data_for_cache:
            try:
                from db import save_cached_thumbnail

                thumbnail_local_path = save_cached_thumbnail(str(manifest_msg_id), thumbnail_data_for_cache)
                logger.info(f"Thumbnail saved locally: {thumbnail_local_path}")
            except Exception as e:
                logger.warning(f"Failed to save thumbnail locally (non-critical): {e}")

        # Save metadata to SQLite for instant folder loading
        try:
            from db import save_file_metadata
            save_file_metadata(
                file_id=str(manifest_msg_id),  # Use manifest message ID as file ID
                folder_id=normalized_folder_id,
                name=filename,
                size=file_size,
                mime=mime_type,
                manifest_message_id=manifest_msg_id,
                thumbnail_message_id=thumbnail_block_id,
                thumbnail_path=thumbnail_local_path  # Use local thumbnail path
            )
            logger.info(f"Metadata saved to SQLite for {filename}")
        except Exception as e:
            logger.warning(f"Failed to save metadata to SQLite (non-critical): {e}")

        # Mark transfer as complete and cleanup
        progress.mark_complete()
        progress.delete()

        emit_progress(transfer_id, 100)
        logger.info(f"Upload complete: {filename} ({total_blocks} blocks)")

        return JSONResponse({"ok": True})

    except Exception as e:
        logger.error(f"Upload failed: {e}")
        if progress:
            progress.mark_failed()
        raise HTTPException(400, str(e))
    finally:
        if crypto:
            crypto.close()
        # Cleanup transfer mapping (queue cleanup handled by SSE disconnect)
        _transfer_clients.pop(transfer_id, None)


@app.post("/cmd_download_file")
async def cmd_download_file(request: Request):
    """
    Download a file from Telegram with resume capability:
    1. Download manifest by message ID
    2. Decrypt manifest to get block IDs
    3. Download + decrypt each block with AES-GCM
    4. Reassemble original file (append mode if resuming)
    5. Verify checksum
    6. Save progress after each block for resume support

    Share link validation is OPTIONAL — only runs if rid is provided.
    """
    body = await parse_body(request)
    message_id      = body.get("messageId")
    save_path       = body.get("savePath", "")
    folder_id       = body.get("folderId")
    transfer_id     = body.get("transferId", str(uuid.uuid4()))
    file_password   = body.get("password")
    resume          = body.get("resume", False)

    # ✅ Share link params — optional
    share_revoke_id = body.get("rid")
    share_exp       = body.get("exp")
    share_key       = body.get("key")

    if message_id is None:
        raise HTTPException(400, "messageId is required")
    if not save_path:
        raise HTTPException(400, "savePath is required")

    progress = None
    crypto = None
    
    try:
        # Health check: ensure Telegram client is connected
        if not telegram.client.is_connected():
            await telegram.client.connect()
        
        vault_key = load_vault_key()
        normalized_message_id = int(message_id)
        normalized_folder_id  = _normalize_folder_id(folder_id)

        # ✅ FIX 1: Share validation ONLY if rid is present
        if share_revoke_id:
            normalized_folder_id = _validate_share_access(
                file_message_id     = normalized_message_id,
                requested_folder_id = normalized_folder_id,
                revoke_id           = share_revoke_id,
                exp                 = share_exp,
                share_key           = share_key,
            )

        # Step 1: Download and decrypt manifest
        manifest = await get_manifest(
            telegram,
            normalized_message_id,
            vault_key,
            normalized_folder_id,
        )

        if manifest.get("password_protected") and not file_password:
            raise HTTPException(400, "This file is password-protected. Please provide a password.")

        # ✅ FIX 2: Use AESGCMCrypto (consistent with upload)
        salt       = base64.b64decode(manifest["salt"])
        master_key = derive_master_key(vault_key, salt, password=file_password)
        crypto     = AESGCMCrypto(master_key, salt)

        # Step 2: Block info
        block_ids    = manifest["block_message_ids"]
        total_blocks = len(block_ids)
        file_size    = int(manifest.get("size", 0) or 0)
        block_size   = int(manifest.get("block_size", BLOCK_SIZE_STREAM) or BLOCK_SIZE_STREAM)

        os.makedirs(os.path.dirname(os.path.abspath(save_path)), exist_ok=True)

        # Step 3: Resume logic
        if resume:
            loaded = TransferProgress.load(transfer_id)
            if loaded and loaded.transfer_type == "download":
                # Validate using message_id and total_blocks (save_path not stored for privacy)
                if (
                    loaded.message_id   == normalized_message_id
                    and loaded.total_blocks == total_blocks
                ):
                    progress = loaded
                    logger.info(
                        f"Resuming download: "
                        f"{len(progress.get_completed_blocks())}/{total_blocks} blocks completed"
                    )
                else:
                    logger.warning(
                        f"Ignoring stale download state for transfer_id={transfer_id}. "
                        f"Stored message_id={loaded.message_id}, "
                        f"requested message_id={normalized_message_id}"
                    )

        if not progress:
            progress = TransferProgress(
                transfer_type = "download",
                file_path     = save_path,
                total_blocks  = total_blocks,
                message_id    = normalized_message_id,
                save_path     = save_path,
                file_size     = file_size,
                block_size    = block_size,
            )
            progress.transfer_id = transfer_id
            progress.save()

        # Handle empty file
        if total_blocks == 0:
            with open(save_path, "wb"):
                pass
            progress.mark_complete()
            progress.delete()
            logger.info(f"Download complete (empty): {manifest['filename']} → {save_path}")
            return JSONResponse({"ok": True})

        # Step 4: Contiguous resume check
        completed_blocks     = set(progress.get_completed_blocks())
        contiguous_completed = 0
        while contiguous_completed in completed_blocks and contiguous_completed < total_blocks:
            contiguous_completed += 1

        if contiguous_completed != len(completed_blocks):
            progress.downloaded_blocks = list(range(contiguous_completed))
            progress.save()

        expected_size = (
            file_size if contiguous_completed >= total_blocks
            else contiguous_completed * block_size
        )

        if contiguous_completed > 0 and os.path.exists(save_path):
            current_size = os.path.getsize(save_path)
            if current_size != expected_size:
                logger.warning(
                    f"Resume size mismatch for {save_path}: "
                    f"expected {expected_size}, got {current_size}. Restarting."
                )
                contiguous_completed       = 0
                progress.downloaded_blocks = []
                progress.save()
                with open(save_path, "wb"):
                    pass
        elif contiguous_completed > 0 and not os.path.exists(save_path):
            logger.warning(f"Resume target missing: {save_path}. Restarting.")
            contiguous_completed       = 0
            progress.downloaded_blocks = []
            progress.save()
            with open(save_path, "wb"):
                pass

        if contiguous_completed == 0 and not os.path.exists(save_path):
            with open(save_path, "wb"):
                pass

        if contiguous_completed > 0:
            emit_progress(transfer_id, int((contiguous_completed / total_blocks) * 100))

        # Step 5: Download + decrypt blocks
        with open(save_path, "ab") as f:
            for block_index in range(contiguous_completed, total_blocks):
                encrypted_data  = await telegram.download_block(
                    block_ids[block_index],
                    normalized_folder_id,
                )
                decrypted_chunk = crypto.decrypt_block(encrypted_data, block_index)
                f.write(decrypted_chunk)
                progress.add_block(block_index)
                percent = int(((block_index + 1) / total_blocks) * 100)
                emit_progress(transfer_id, percent)

        # Step 6: Checksum verify
        actual_checksum   = compute_file_checksum(save_path)
        expected_checksum = manifest.get("checksum", "")

        if expected_checksum and actual_checksum != expected_checksum:
            os.remove(save_path)
            raise ValueError(
                f"Checksum mismatch — file may be corrupted. "
                f"Expected: {expected_checksum[:16]}... "
                f"Got: {actual_checksum[:16]}..."
            )

        progress.mark_complete()
        progress.delete()

        logger.info(f"Download complete: {manifest['filename']} → {save_path}")
        return JSONResponse({"ok": True})

    except HTTPException:
        raise
    except Exception as e:
        logger.error(f"Download failed: {e}")
        if progress:
            progress.mark_failed()
        raise HTTPException(400, str(e))
    finally:
        if crypto:
            crypto.close()
        _transfer_clients.pop(transfer_id, None)

@app.post("/cmd_delete_file")
async def cmd_delete_file(request: Request):
    """
    Delete a file: delete the manifest message AND all block messages.
    Also removes metadata from SQLite database.
    """
    body = await parse_body(request)
    message_id = body.get("messageId")
    folder_id = body.get("folderId")

    if message_id is None:
        raise HTTPException(400, "messageId is required")

    try:
        vault_key = load_vault_key()

        # Try to get manifest to find block IDs
        try:
            manifest = await get_manifest(telegram, int(message_id), vault_key, folder_id)
            block_ids = manifest.get("block_message_ids", [])

            # Delete all block messages
            if block_ids:
                await telegram.delete_messages(block_ids, folder_id)
                logger.info(f"Deleted {len(block_ids)} blocks for file '{manifest.get('filename')}'")
        except Exception as e:
            logger.warning(f"Could not read manifest for deletion: {e}")

        # Delete the manifest message itself
        await telegram.delete_file(int(message_id), folder_id)
        
        # Delete from SQLite database
        try:
            from db import delete_cached_thumbnail, delete_file_metadata

            delete_cached_thumbnail(str(message_id))
            delete_file_metadata(str(message_id))
            logger.info(f"Deleted metadata from SQLite for file {message_id}")
        except Exception as e:
            logger.warning(f"Failed to delete metadata from SQLite (non-critical): {e}")

        return JSONResponse({"ok": True})
    except Exception as e:
        raise HTTPException(400, str(e))


@app.post("/cmd_move_files")
async def cmd_move_files(request: Request):
    body = await parse_body(request)
    message_ids = body.get("messageIds", [])
    source_folder_id = body.get("sourceFolderId")
    target_folder_id = body.get("targetFolderId")

    if not message_ids:
        raise HTTPException(400, "messageIds is required")

    try:
        await telegram.move_files(message_ids, source_folder_id, target_folder_id)
        return JSONResponse({"ok": True})
    except Exception as e:
        raise HTTPException(400, str(e))


@app.post("/cmd_search_global")
async def cmd_search_global(request: Request):
    body = await parse_body(request)
    query = body.get("query", "")

    if not query:
        return JSONResponse([])

    try:
        results = await telegram.search_global(query)
        return JSONResponse(results)
    except Exception as e:
        raise HTTPException(400, str(e))


# ─────────────────────────────────────────────
#  Utility Routes
# ─────────────────────────────────────────────

@app.post("/cmd_get_bandwidth")
async def cmd_get_bandwidth(request: Request):
    return JSONResponse(telegram.get_bandwidth())


@app.post("/cmd_storage_stats")
async def cmd_storage_stats(request: Request):
    """Return storage totals and media category counts."""
    body = await parse_body(request)
    folder_id = _normalize_folder_id(body.get("folderId"))
    all_folders = bool(body.get("allFolders", folder_id is None))

    try:
        vault_key = load_vault_key()

        target_folders: List[Optional[int]] = []
        if not all_folders:
            target_folders = [folder_id]
        else:
            target_folders = [None]
            folders = await telegram.scan_folders()
            for folder in folders:
                raw_id = folder.get("id")
                try:
                    parsed_id = int(raw_id)
                except (TypeError, ValueError):
                    continue
                if parsed_id not in target_folders:
                    target_folders.append(parsed_id)

        files: List[Dict[str, Any]] = []
        seen_keys = set()
        for target_folder_id in target_folders:
            try:
                folder_files = await list_files_from_manifests(
                    telegram_client=telegram,
                    vault_key=vault_key,
                    folder_id=target_folder_id,
                    quick_mode=True,
                )
            except Exception as folder_error:
                logger.warning(f"storage stats: failed folder {target_folder_id}: {folder_error}")
                continue

            for file in folder_files:
                try:
                    file_id = int(file.get("id"))
                except (TypeError, ValueError):
                    continue
                dedupe_key = (target_folder_id, file_id)
                if dedupe_key in seen_keys:
                    continue
                seen_keys.add(dedupe_key)
                file_with_folder = dict(file)
                file_with_folder.setdefault("_stats_folder_id", target_folder_id)
                files.append(file_with_folder)

        total_size = 0
        videos = 0
        images = 0
        docs = 0
        category_totals: Dict[str, Dict[str, int]] = {
            "videos": {"files": 0, "size": 0},
            "images": {"files": 0, "size": 0},
            "audio": {"files": 0, "size": 0},
            "archives": {"files": 0, "size": 0},
            "documents": {"files": 0, "size": 0},
            "other": {"files": 0, "size": 0},
        }
        folder_usage: Dict[str, Dict[str, Any]] = {}

        folder_names: Dict[Optional[int], str] = {None: "Saved Messages"}
        try:
            for folder in await telegram.scan_folders():
                folder_id_value = _normalize_folder_id(folder.get("id"))
                if folder_id_value is not None:
                    folder_names[folder_id_value] = str(folder.get("name") or "Folder")
        except Exception as folder_error:
            logger.warning(f"storage stats: failed to resolve folder names: {folder_error}")

        for file in files:
            try:
                file_size = int(file.get("size", 0) or 0)
            except (TypeError, ValueError):
                file_size = 0
            file["_stats_size"] = max(file_size, 0)
            total_size += max(file_size, 0)

            mime = str(file.get("mime", "") or "").lower()
            if not mime:
                guess, _ = mimetypes.guess_type(str(file.get("name", "") or ""))
                mime = (guess or "").lower()

            name = str(file.get("name", "") or "")
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
            category_totals[category]["size"] += max(file_size, 0)

            folder_id_value = _normalize_folder_id(
                file.get("folder_id", file.get("folderId", file.get("_stats_folder_id")))
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
            folder_usage[folder_key]["size"] += max(file_size, 0)

        largest_files = sorted(
            [
                {
                    "id": file.get("id"),
                    "name": str(file.get("name", "Untitled file") or "Untitled file"),
                    "size": int(file.get("_stats_size", 0)),
                    "created_at": file.get("created_at", file.get("date")),
                }
                for file in files
            ],
            key=lambda item: item["size"],
            reverse=True,
        )[:5]

        usage_by_folder = sorted(folder_usage.values(), key=lambda item: item["size"], reverse=True)[:5]

        return JSONResponse({
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
        })
    except HTTPException:
        raise
    except Exception as e:
        logger.error(f"Storage stats failed: {e}")
        raise HTTPException(400, str(e))


@app.post("/cmd_create_share")
async def cmd_create_share(request: Request):
    """
    Create a share link for a file.
    Modes:
    - easy: includes key in URL
    - secure: returns key separately
    """
    body = await parse_body(request)
    message_id = body.get("messageId")
    folder_id = _normalize_folder_id(body.get("folderId"))
    mode = str(body.get("mode", "easy") or "easy").lower()
    expires_in_seconds = body.get("expiresInSeconds", SHARE_DEFAULT_EXPIRY_SECONDS)
    custom_key = body.get("key")

    if message_id is None:
        raise HTTPException(400, "messageId is required")
    try:
        normalized_message_id = int(message_id)
    except (TypeError, ValueError):
        raise HTTPException(400, "messageId must be a number")

    if mode not in ("easy", "secure"):
        raise HTTPException(400, "mode must be 'easy' or 'secure'")

    try:
        expires_in_seconds = int(expires_in_seconds)
    except (TypeError, ValueError):
        raise HTTPException(400, "expiresInSeconds must be a number")
    if expires_in_seconds <= 0:
        raise HTTPException(400, "expiresInSeconds must be > 0")
    if expires_in_seconds > 30 * 24 * 60 * 60:
        raise HTTPException(400, "expiresInSeconds must be <= 30 days")

    if custom_key is None:
        share_key = secrets.token_urlsafe(24)
    else:
        share_key = str(custom_key).strip()
        if not share_key:
            raise HTTPException(400, "key cannot be empty")

    # Ensure the target file exists and can be resolved.
    try:
        vault_key = load_vault_key()
        await get_manifest(telegram, normalized_message_id, vault_key, folder_id)
    except Exception as e:
        raise HTTPException(400, f"Unable to create share for this file: {e}")

    now = int(time.time())
    expiry = now + expires_in_seconds
    revoke_id = uuid.uuid4().hex

    records = _load_share_records()
    records[revoke_id] = {
        "file_id": normalized_message_id,
        "folder_id": folder_id,
        "revoke_id": revoke_id,
        "active": True,
        "expiry": expiry,
        "created_at": now,
        "mode": mode,
        "access_key_hash": _hash_share_key(share_key),
    }
    _save_share_records(records)

    include_key_in_link = mode == "easy"
    link = _build_share_link(
        message_id=normalized_message_id,
        revoke_id=revoke_id,
        expiry=expiry,
        folder_id=folder_id,
        include_key=include_key_in_link,
        share_key=share_key,
    )

    response: Dict[str, Any] = {
        "ok": True,
        "mode": mode,
        "revokeId": revoke_id,
        "expiry": expiry,
        "link": link,
    }
    if mode == "secure":
        response["key"] = share_key

    return JSONResponse(response)


@app.post("/cmd_revoke_share")
async def cmd_revoke_share(request: Request):
    """Revoke a previously generated share link."""
    body = await parse_body(request)
    revoke_id = body.get("revokeId") or body.get("rid")
    if not revoke_id:
        raise HTTPException(400, "revokeId is required")

    records = _load_share_records()
    record = records.get(str(revoke_id))
    if not record:
        raise HTTPException(404, "Share record not found")

    record["active"] = False
    record["revoked_at"] = int(time.time())
    records[str(revoke_id)] = record
    _save_share_records(records)

    return JSONResponse({
        "ok": True,
        "revokeId": str(revoke_id),
        "active": False,
    })


@app.post("/cmd_list_shares")
async def cmd_list_shares(request: Request):
    """
    List share records.
    Optional body:
    - fileId: filter to one file
    - includeInactive: include revoked/expired links
    """
    body = await parse_body(request)
    file_id_filter = body.get("fileId")
    include_inactive = bool(body.get("includeInactive", False))

    normalized_file_id: Optional[int] = None
    if file_id_filter is not None:
        try:
            normalized_file_id = int(file_id_filter)
        except (TypeError, ValueError):
            raise HTTPException(400, "fileId must be a number")

    now = int(time.time())
    records = _load_share_records()
    changed = False
    result: List[Dict[str, Any]] = []

    for rid, record in records.items():
        try:
            file_id = int(record.get("file_id"))
            expiry = int(record.get("expiry"))
        except (TypeError, ValueError):
            continue

        active = bool(record.get("active", False))
        if active and now > expiry:
            active = False
            record["active"] = False
            record["revoked_at"] = now
            records[rid] = record
            changed = True

        if normalized_file_id is not None and file_id != normalized_file_id:
            continue
        if not include_inactive and not active:
            continue

        folder_id = record.get("folder_id")
        if folder_id is not None:
            try:
                folder_id = int(folder_id)
            except (TypeError, ValueError):
                folder_id = None

        result.append({
            "revokeId": rid,
            "fileId": file_id,
            "folderId": folder_id,
            "mode": str(record.get("mode", "easy")),
            "active": active,
            "expiry": expiry,
            "createdAt": int(record.get("created_at", 0) or 0),
            "revokedAt": int(record.get("revoked_at", 0) or 0) if record.get("revoked_at") is not None else None,
        })

    if changed:
        _save_share_records(records)

    result.sort(key=lambda item: item["createdAt"], reverse=True)
    return JSONResponse(result)


@app.post("/cmd_clean_cache")
async def cmd_clean_cache(request: Request):
    try:
        await telegram.clean_cache()
        return JSONResponse({"ok": True})
    except Exception as e:
        raise HTTPException(400, str(e))


@app.post("/cmd_export_vault")
async def cmd_export_vault(request: Request):
    """
    Export vault.key as encrypted backup.
    Returns: { backup: base64_encoded_backup }
    """
    body = await parse_body(request)
    password = body.get("password", "")

    if not password:
        raise HTTPException(400, "Password is required to encrypt backup")

    try:
        backup_bytes = export_vault_key(password)
        import base64
        backup_b64 = base64.b64encode(backup_bytes).decode('ascii')
        return JSONResponse({"ok": True, "backup": backup_b64})
    except Exception as e:
        logger.error(f"Vault export failed: {e}")
        raise HTTPException(500, f"Export failed: {str(e)}")


@app.post("/cmd_export_vault_file")
async def cmd_export_vault_file(request: Request):
    """Create an encrypted vault recovery file at a user-selected local path."""
    body = await parse_body(request)
    password = str(body.get("password", ""))
    path = str(body.get("path", "")).strip()

    if len(password) < 12:
        raise HTTPException(400, "Use a recovery password with at least 12 characters")
    if not path:
        raise HTTPException(400, "A backup destination is required")
    if os.path.exists(path):
        raise HTTPException(409, "A file already exists at this location; choose a new filename")

    try:
        backup_bytes = export_vault_key(password)
        parent_dir = os.path.dirname(os.path.abspath(path))
        if not os.path.isdir(parent_dir):
            raise HTTPException(400, "The selected backup folder does not exist")
        with open(path, "xb") as backup_file:
            backup_file.write(backup_bytes)
        return JSONResponse({"ok": True, "path": path})
    except HTTPException:
        raise
    except FileExistsError:
        raise HTTPException(409, "A file already exists at this location; choose a new filename")
    except Exception as e:
        logger.error(f"Vault backup file export failed: {e}")
        raise HTTPException(500, "Could not create the recovery file")


@app.post("/cmd_import_vault")
async def cmd_import_vault(request: Request):
    """
    Import vault.key from encrypted backup.
    WARNING: This will OVERWRITE existing vault.key!
    """
    body = await parse_body(request)
    backup_b64 = body.get("backup", "")
    password = body.get("password", "")

    if not backup_b64 or not password:
        raise HTTPException(400, "Backup data and password are required")

    try:
        import base64
        backup_bytes = base64.b64decode(backup_b64)
        import_vault_key(backup_bytes, password)
        return JSONResponse({"ok": True, "message": "Vault restored successfully"})
    except ValueError as e:
        raise HTTPException(400, f"Invalid backup or wrong password: {str(e)}")
    except Exception as e:
        logger.error(f"Vault import failed: {e}")
        raise HTTPException(500, f"Import failed: {str(e)}")


@app.post("/cmd_import_vault_file")
async def cmd_import_vault_file(request: Request):
    """Restore a vault key from a user-selected encrypted recovery file."""
    body = await parse_body(request)
    password = str(body.get("password", ""))
    path = str(body.get("path", "")).strip()

    if not path or not os.path.isfile(path):
        raise HTTPException(400, "Select a valid recovery file")
    if not password:
        raise HTTPException(400, "Recovery password is required")

    try:
        if os.path.getsize(path) > 1024 * 1024:
            raise HTTPException(400, "Recovery file is unexpectedly large")
        with open(path, "rb") as backup_file:
            backup_bytes = backup_file.read()
        import_vault_key(backup_bytes, password)
        return JSONResponse({"ok": True, "message": "Vault restored successfully"})
    except HTTPException:
        raise
    except ValueError as e:
        raise HTTPException(400, f"Invalid backup or wrong password: {str(e)}")
    except Exception as e:
        logger.error(f"Vault recovery file import failed: {e}")
        raise HTTPException(500, "Could not restore the recovery file")


@app.get("/cmd_vault_status")
async def cmd_vault_status():
    """Check vault key status."""
    from vault import vault_key_exists, VAULT_KEY_FILE
    return JSONResponse({
        "exists": vault_key_exists(),
        "path": VAULT_KEY_FILE,
    })


# ─────────────────────────────────────────────
#  Streaming Route (for media preview)
# ─────────────────────────────────────────────

@app.get("/stream")
async def stream_file(
    request: Request,
    path: str = "",
    folderId: Optional[int] = None,
    rid: Optional[str] = None,
    exp: Optional[str] = None,
    key: Optional[str] = None,
):
    """
    Stream a file for in-browser media playback.
    Supports HTTP Range requests for seeking.
    Limited to 3 concurrent streams to prevent API overload.
    """
    if not path:
        raise HTTPException(400, "path parameter is required")

    async with _stream_semaphore:
        try:
            vault_key = load_vault_key()

            # Parse file ID from path
            file_message_id = int(path)
            normalized_folder_id = _normalize_folder_id(folderId)
            normalized_folder_id = _validate_share_access(
                file_message_id=file_message_id,
                requested_folder_id=normalized_folder_id,
                revoke_id=rid,
                exp=exp,
                share_key=key,
            )

            # Get manifest
            manifest = await get_manifest(telegram, file_message_id, vault_key, normalized_folder_id)

            mime_type = manifest.get("mime", "application/octet-stream")
            file_size = int(manifest.get("size", 0) or 0)
            block_size = int(manifest.get("block_size", BLOCK_SIZE_STREAM) or BLOCK_SIZE_STREAM)
            block_ids = manifest.get("block_message_ids", [])

            if block_size <= 0:
                raise HTTPException(400, "Invalid block size in manifest")
            if file_size > 0 and not block_ids:
                raise HTTPException(400, "Missing block IDs in manifest")

            # Derive key for decryption
            salt = base64.b64decode(manifest["salt"])
            master_key = derive_master_key(vault_key, salt)

            # Create AES-GCM crypto instance for streaming
            crypto = AESGCMCrypto(master_key, salt)

            # Parse Range header
            range_header = request.headers.get("range")
            start = 0
            end = file_size - 1 if file_size > 0 else 0

            if file_size == 0:
                crypto.close()
                return StreamingResponse(
                    iter(()),
                    status_code=200,
                    headers={
                        "Content-Type": mime_type,
                        "Content-Length": "0",
                        "Accept-Ranges": "bytes",
                    },
                    media_type=mime_type,
                )

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
                    crypto.close()
                    raise HTTPException(416, "Invalid Range header")

            if start >= file_size:
                crypto.close()
                raise HTTPException(416, "Range start exceeds file size")
            if start < 0 or end < 0:
                crypto.close()
                raise HTTPException(416, "Negative ranges are not supported")
            end = min(end, file_size - 1)
            if end < start:
                crypto.close()
                raise HTTPException(416, "Invalid range bounds")

            async def generate_stream():
                """Stream decrypted blocks with in-memory prefetch + optional cache."""
                start_block = start // block_size
                end_block = end // block_size

                bytes_sent = 0
                content_length = end - start + 1
                prefetch_buffer: Dict[int, bytes] = {}
                prefetch_tasks: Dict[int, asyncio.Task] = {}

                async def fetch_block(idx: int) -> bytes:
                    encrypted = await telegram.download_block(block_ids[idx], normalized_folder_id)
                    decrypted = crypto.decrypt_block(encrypted, idx)
                    _write_cached_stream_block(file_message_id, idx, decrypted)
                    return decrypted

                def schedule_prefetch(idx: int) -> None:
                    if idx > end_block or idx >= len(block_ids):
                        return
                    if idx in prefetch_buffer or idx in prefetch_tasks:
                        return
                    cached = _read_cached_stream_block(file_message_id, idx)
                    if cached is not None:
                        prefetch_buffer[idx] = cached
                        return
                    prefetch_tasks[idx] = asyncio.create_task(fetch_block(idx))

                async def get_block(idx: int) -> bytes:
                    buffered = prefetch_buffer.pop(idx, None)
                    if buffered is not None:
                        return buffered

                    task = prefetch_tasks.pop(idx, None)
                    if task is not None:
                        decrypted = await task
                        return decrypted

                    cached = _read_cached_stream_block(file_message_id, idx)
                    if cached is not None:
                        return cached

                    return await fetch_block(idx)

                try:
                    for block_idx in range(start_block, min(end_block + 1, len(block_ids))):
                        for offset in range(1, STREAM_PREFETCH_BLOCKS + 1):
                            schedule_prefetch(block_idx + offset)

                        decrypted = await get_block(block_idx)

                        block_start_byte = block_idx * block_size
                        slice_start = max(start - block_start_byte, 0)
                        slice_end = min(end - block_start_byte + 1, len(decrypted))

                        if slice_start < slice_end:
                            chunk = decrypted[slice_start:slice_end]
                            yield chunk
                            bytes_sent += len(chunk)
                            if bytes_sent >= content_length:
                                break
                finally:
                    for task in prefetch_tasks.values():
                        if not task.done():
                            task.cancel()
                    if prefetch_tasks:
                        await asyncio.gather(*prefetch_tasks.values(), return_exceptions=True)
                    crypto.close()

            content_length = end - start + 1
            status_code = 206 if range_header else 200
            headers = {
                "Content-Type": mime_type,
                "Content-Length": str(content_length),
                "Accept-Ranges": "bytes",
            }

            if range_header:
                headers["Content-Range"] = f"bytes {start}-{end}/{file_size}"

            return StreamingResponse(
                generate_stream(),
                status_code=status_code,
                headers=headers,
                media_type=mime_type,
            )

        except HTTPException:
            raise
        except Exception as e:
            logger.error(f"Streaming failed: {e}")
            raise HTTPException(400, str(e))


# ─────────────────────────────────────────────
#  File dialog helper (for browser-based frontend)
# ─────────────────────────────────────────────

@app.post("/cmd_pick_file")
async def cmd_pick_file(request: Request):
    """
    Open a native file dialog and return selected file path(s).
    Uses tkinter since we're running as a desktop app.
    """
    body = await parse_body(request)
    multiple = body.get("multiple", False)
    directory = body.get("directory", False)

    try:
        import tkinter as tk
        from tkinter import filedialog
        root = tk.Tk()
        root.withdraw()
        root.attributes('-topmost', True)

        if directory:
            path = filedialog.askdirectory()
            root.destroy()
            return JSONResponse(path if path else None)
        elif multiple:
            paths = filedialog.askopenfilenames()
            root.destroy()
            return JSONResponse(list(paths) if paths else [])
        else:
            path = filedialog.askopenfilename()
            root.destroy()
            return JSONResponse(path if path else None)
    except Exception as e:
        raise HTTPException(400, f"File dialog failed: {e}")


@app.post("/cmd_pick_save_path")
async def cmd_pick_save_path(request: Request):
    """Open a native save dialog and return selected path."""
    body = await parse_body(request)
    default_path = body.get("defaultPath", "")

    try:
        import tkinter as tk
        from tkinter import filedialog
        root = tk.Tk()
        root.withdraw()
        root.attributes('-topmost', True)

        path = filedialog.asksaveasfilename(
            initialfile=os.path.basename(default_path) if default_path else "",
        )
        root.destroy()
        return JSONResponse(path if path else None)
    except Exception as e:
        raise HTTPException(400, f"Save dialog failed: {e}")


# ─────────────────────────────────────────────
#  Health Check
# ─────────────────────────────────────────────

@app.get("/health")
async def health():
    return JSONResponse({"status": "ok", "service": "TeleVault"})


@app.get("/thumbnail")
async def get_thumbnail(request: Request):
    """
    Retrieve thumbnail for a file.
    First checks local cache, then downloads from Telegram as fallback.
    Returns 404 if file has no thumbnail (legacy files).
    """
    try:
        message_id = int(request.query_params.get("message_id") or 0)
        folder_id = request.query_params.get("folder_id")
        
        if not message_id:
            raise HTTPException(status_code=400, detail="message_id is required")
        
        logger.info(f"Thumbnail requested for message_id={message_id}, folder_id={folder_id}")
        
        # Check local thumbnail cache first (instant)
        try:
            from db import get_cached_thumbnail
            cached_thumbnail = get_cached_thumbnail(str(message_id))
            if cached_thumbnail:
                logger.info(f"Thumbnail served from local cache for message_id={message_id}")
                return Response(content=cached_thumbnail, media_type="image/webp")
        except Exception as e:
            logger.warning(f"Failed to check local thumbnail cache: {e}")
        
        # Fallback: download from Telegram
        logger.info(f"Local cache miss, downloading from Telegram for message_id={message_id}")
        vault_key = load_vault_key()
        
        normalized_folder_id = _normalize_folder_id(folder_id)
        
        # Get manifest
        manifest = await get_manifest(telegram, message_id, vault_key, normalized_folder_id)
        
        thumbnail_block_id = manifest.get("thumbnail_block_id")
        
        if not thumbnail_block_id:
            logger.info(f"No thumbnail_block_id in manifest for message_id={message_id}")
            raise HTTPException(status_code=404, detail="No thumbnail available")
        
        logger.info(f"Downloading thumbnail block {thumbnail_block_id}")
        # Download thumbnail block
        encrypted_thumbnail = await telegram.download_block(thumbnail_block_id, normalized_folder_id)
        
        # Derive key for decryption
        salt = base64.b64decode(manifest["salt"])
        master_key = derive_master_key(vault_key, salt)
        crypto = AESGCMCrypto(master_key, salt)
        
        # Decrypt thumbnail (using block index 999999)
        decrypted_thumbnail = crypto.decrypt_block(encrypted_thumbnail, 999999)
        crypto.close()
        
        logger.info(f"Thumbnail decrypted successfully, size: {len(decrypted_thumbnail)} bytes")
        
        # Save to local cache for future requests
        try:
            from db import save_cached_thumbnail
            save_cached_thumbnail(str(message_id), decrypted_thumbnail)
            logger.info(f"Thumbnail cached locally for message_id={message_id}")
        except Exception as e:
            logger.warning(f"Failed to save thumbnail to local cache (non-critical): {e}")
        
        return Response(content=decrypted_thumbnail, media_type="image/webp")
        
    except HTTPException:
        raise
    except Exception as e:
        logger.error(f"Failed to retrieve thumbnail: {e}")
        raise HTTPException(status_code=500, detail=str(e))


@app.post("/cmd_is_network_available")
async def cmd_is_network_available(request: Request):
    """Check if the backend can reach Telegram servers."""
    try:
        # Simple DNS/TCP check without starting full Telethon client
        import socket
        socket.create_connection(("91.108.56.141", 443), timeout=3)
        return JSONResponse(True)
    except Exception:
        return JSONResponse(False)


# ─────────────────────────────────────────────
#  Run Server
# ─────────────────────────────────────────────

if os.path.isdir(FRONTEND_DIST_DIR):
    app.mount("/", StaticFiles(directory=FRONTEND_DIST_DIR, html=True), name="frontend")
else:
    logger.warning(f"Frontend build not found at {FRONTEND_DIST_DIR}")


def start_server():
    """Start the FastAPI server with uvicorn."""
    logging.basicConfig(
        level=logging.INFO,
        format="%(asctime)s [%(name)s] %(levelname)s: %(message)s",
    )
    deleted = TransferProgress.cleanup_old_transfers(max_age_hours=TRANSFER_CLEANUP_HOURS)
    if deleted > 0:
        logger.info(f"Cleaned {deleted} stale transfer state files on startup")
    logger.info(f"Starting TeleVault server on {SERVER_HOST}:{SERVER_PORT}")
    uvicorn.run(app, host=SERVER_HOST, port=SERVER_PORT, log_level="info")


if __name__ == "__main__":
    start_server()
