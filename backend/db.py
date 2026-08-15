"""
TeleVault Local Metadata Database
===================================
SQLite database for instant file listing and metadata browsing.
Telegram is used only for storage, SQLite is the index engine.

Author: Liethueis-Foundation (c) 2026
"""

import hashlib
import logging
import os
import shutil
import sqlite3
import time
import uuid
from typing import Any, Dict, List, Optional

from cryptography.hazmat.primitives.ciphers.aead import AESGCM

from config import DATA_DIR

logger = logging.getLogger("televault.db")

# Database file path
DB_FILE = os.path.join(DATA_DIR, "metadata.db")

# Thumbnail cache directory
THUMBNAIL_CACHE_DIR = os.path.join(DATA_DIR, "thumbnails")
os.makedirs(THUMBNAIL_CACHE_DIR, exist_ok=True)

# Thumbnail cache size limit (2GB)
MAX_THUMBNAIL_CACHE_SIZE = 2 * 1024 * 1024 * 1024  # 2GB

THUMBNAIL_MAGIC = b"TVTH1"
THUMBNAIL_NONCE_SIZE = 12
THUMBNAIL_KEY_INFO = b"TeleVault-Thumbnail-Cache-v1"

# Schema
FILES_TABLE_SCHEMA = """
CREATE TABLE IF NOT EXISTS files (
    id TEXT PRIMARY KEY,
    folder_id TEXT,
    name TEXT NOT NULL,
    size INTEGER NOT NULL,
    mime TEXT,
    thumbnail_path TEXT,
    manifest_message_id INTEGER NOT NULL,
    thumbnail_message_id INTEGER,
    created_at INTEGER NOT NULL,
    updated_at INTEGER NOT NULL
);

CREATE INDEX IF NOT EXISTS idx_folder_id ON files(folder_id);
CREATE INDEX IF NOT EXISTS idx_name ON files(name);
"""


def init_db():
    """Initialize the metadata database."""
    os.makedirs(DATA_DIR, exist_ok=True)

    conn = sqlite3.connect(DB_FILE)
    cursor = conn.cursor()
    cursor.executescript(FILES_TABLE_SCHEMA)
    conn.commit()
    conn.close()

    print(f"[OK] Metadata database initialized at {DB_FILE}")


def get_db_connection():
    """Get a database connection."""
    conn = sqlite3.connect(DB_FILE)
    conn.row_factory = sqlite3.Row
    return conn


def save_file_metadata(
    file_id: str,
    folder_id: Optional[int],
    name: str,
    size: int,
    mime: str,
    manifest_message_id: int,
    thumbnail_message_id: Optional[int] = None,
    thumbnail_path: Optional[str] = None,
):
    """
    Save file metadata to database.
    Called after successful upload or manifest sync.
    """
    conn = get_db_connection()
    cursor = conn.cursor()

    now = int(time.time())

    cursor.execute(
        """
        INSERT INTO files
        (id, folder_id, name, size, mime, thumbnail_path, manifest_message_id, thumbnail_message_id, created_at, updated_at)
        VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
        ON CONFLICT(id) DO UPDATE SET
            folder_id = excluded.folder_id,
            name = excluded.name,
            size = excluded.size,
            mime = excluded.mime,
            thumbnail_path = COALESCE(excluded.thumbnail_path, files.thumbnail_path),
            manifest_message_id = excluded.manifest_message_id,
            thumbnail_message_id = COALESCE(excluded.thumbnail_message_id, files.thumbnail_message_id),
            created_at = files.created_at,
            updated_at = excluded.updated_at
        """,
        (
            file_id,
            str(folder_id) if folder_id else None,
            name,
            size,
            mime,
            thumbnail_path,
            manifest_message_id,
            thumbnail_message_id,
            now,
            now,
        ),
    )

    conn.commit()
    conn.close()


def get_files_by_folder(
    folder_id: Optional[int],
    limit: int = 1000,
    offset: int = 0,
) -> List[Dict[str, Any]]:
    """
    Get files from a folder using SQLite (instant).
    Returns list of file metadata dictionaries.
    """
    conn = get_db_connection()
    cursor = conn.cursor()

    folder_id_str = str(folder_id) if folder_id else None

    if folder_id_str:
        cursor.execute(
            """
            SELECT * FROM files
            WHERE folder_id = ?
            ORDER BY created_at DESC
            LIMIT ? OFFSET ?
            """,
            (folder_id_str, limit, offset),
        )
    else:
        cursor.execute(
            """
            SELECT * FROM files
            WHERE folder_id IS NULL
            ORDER BY created_at DESC
            LIMIT ? OFFSET ?
            """,
            (limit, offset),
        )

    rows = cursor.fetchall()
    conn.close()
    return [_row_to_file_dict(row) for row in rows]


def delete_file_metadata(file_id: str):
    """Delete file metadata from database."""
    conn = get_db_connection()
    cursor = conn.cursor()
    cursor.execute("DELETE FROM files WHERE id = ?", (file_id,))
    conn.commit()
    conn.close()


def delete_folder_metadata(folder_id: Optional[int]):
    """Delete all files in a folder from database."""
    conn = get_db_connection()
    cursor = conn.cursor()

    folder_id_str = str(folder_id) if folder_id else None

    if folder_id_str:
        cursor.execute("DELETE FROM files WHERE folder_id = ?", (folder_id_str,))
    else:
        cursor.execute("DELETE FROM files WHERE folder_id IS NULL")

    conn.commit()
    conn.close()


def search_files(query: str, limit: int = 100) -> List[Dict[str, Any]]:
    """Search files by name using SQLite."""
    conn = get_db_connection()
    cursor = conn.cursor()

    cursor.execute(
        """
        SELECT * FROM files
        WHERE name LIKE ?
        ORDER BY created_at DESC
        LIMIT ?
        """,
        (f"%{query}%", limit),
    )

    rows = cursor.fetchall()
    conn.close()
    return [_row_to_file_dict(row) for row in rows]


def get_file_metadata(file_id: str) -> Optional[Dict[str, Any]]:
    """Get file metadata by ID."""
    conn = get_db_connection()
    cursor = conn.cursor()
    cursor.execute("SELECT * FROM files WHERE id = ?", (file_id,))
    row = cursor.fetchone()
    conn.close()
    return _row_to_file_dict(row) if row else None


def _row_to_file_dict(row: sqlite3.Row) -> Dict[str, Any]:
    return {
        "id": row["id"],
        "folder_id": row["folder_id"],
        "name": row["name"],
        "size": row["size"],
        "mime": row["mime"],
        "thumbnail_path": row["thumbnail_path"],
        "manifest_message_id": row["manifest_message_id"],
        "thumbnail_message_id": row["thumbnail_message_id"],
        "created_at": row["created_at"],
        "updated_at": row["updated_at"],
    }


def _thumbnail_cache_key() -> bytes:
    from vault import load_vault_key

    vault_key = load_vault_key()
    return hashlib.sha256(THUMBNAIL_KEY_INFO + vault_key).digest()


def _thumbnail_aad(file_id: str) -> bytes:
    return f"thumbnail:{file_id}".encode("utf-8")


def _encrypt_thumbnail(file_id: str, thumbnail_data: bytes) -> bytes:
    nonce = os.urandom(THUMBNAIL_NONCE_SIZE)
    ciphertext = AESGCM(_thumbnail_cache_key()).encrypt(nonce, thumbnail_data, _thumbnail_aad(file_id))
    return THUMBNAIL_MAGIC + nonce + ciphertext


def _decrypt_thumbnail(file_id: str, encrypted_data: bytes) -> bytes:
    min_len = len(THUMBNAIL_MAGIC) + THUMBNAIL_NONCE_SIZE + 16
    if len(encrypted_data) < min_len or not encrypted_data.startswith(THUMBNAIL_MAGIC):
        raise ValueError("Invalid thumbnail cache blob")

    nonce_start = len(THUMBNAIL_MAGIC)
    nonce_end = nonce_start + THUMBNAIL_NONCE_SIZE
    nonce = encrypted_data[nonce_start:nonce_end]
    ciphertext = encrypted_data[nonce_end:]
    return AESGCM(_thumbnail_cache_key()).decrypt(nonce, ciphertext, _thumbnail_aad(file_id))


def _clear_thumbnail_path_for_file(file_id: str):
    conn = get_db_connection()
    cursor = conn.cursor()
    cursor.execute(
        "UPDATE files SET thumbnail_path = NULL, updated_at = ? WHERE id = ?",
        (int(time.time()), file_id),
    )
    conn.commit()
    conn.close()


def _clear_thumbnail_path_for_cache_path(thumbnail_path: str):
    conn = get_db_connection()
    cursor = conn.cursor()
    cursor.execute(
        "UPDATE files SET thumbnail_path = NULL, updated_at = ? WHERE thumbnail_path = ?",
        (int(time.time()), thumbnail_path),
    )
    conn.commit()
    conn.close()


def save_cached_thumbnail(file_id: str, thumbnail_data: bytes) -> str:
    """
    Save thumbnail data to local encrypted cache.
    Returns the local file path.
    Implements LRU eviction if cache exceeds size limit.
    """
    existing = get_file_metadata(file_id)
    existing_path = existing.get("thumbnail_path") if existing else None

    if existing_path and os.path.exists(existing_path):
        try:
            os.remove(existing_path)
        except OSError as exc:
            logger.warning("Failed to replace cached thumbnail for %s: %s", file_id, exc)

    thumbnail_filename = f"thumb_{hashlib.sha256(file_id.encode('utf-8')).hexdigest()[:16]}_{uuid.uuid4().hex}.tvthumb"
    thumbnail_path = os.path.join(THUMBNAIL_CACHE_DIR, thumbnail_filename)
    encrypted_blob = _encrypt_thumbnail(file_id, thumbnail_data)

    with open(thumbnail_path, "wb") as handle:
        handle.write(encrypted_blob)

    conn = get_db_connection()
    cursor = conn.cursor()
    cursor.execute(
        """
        UPDATE files
        SET thumbnail_path = ?, updated_at = ?
        WHERE id = ?
        """,
        (thumbnail_path, int(time.time()), file_id),
    )
    conn.commit()
    conn.close()

    _cleanup_thumbnail_cache()
    return thumbnail_path


def _cleanup_thumbnail_cache():
    """
    Implement LRU eviction for thumbnail cache.
    Deletes oldest thumbnails if cache exceeds MAX_THUMBNAIL_CACHE_SIZE.
    """
    try:
        total_size = 0
        files = []

        for filename in os.listdir(THUMBNAIL_CACHE_DIR):
            filepath = os.path.join(THUMBNAIL_CACHE_DIR, filename)
            if os.path.isfile(filepath):
                stat = os.stat(filepath)
                files.append((filepath, stat.st_mtime, stat.st_size))
                total_size += stat.st_size

        if total_size <= MAX_THUMBNAIL_CACHE_SIZE:
            return

        files.sort(key=lambda item: item[1])
        for filepath, _, size in files:
            try:
                os.remove(filepath)
                total_size -= size
                _clear_thumbnail_path_for_cache_path(filepath)
                if total_size <= MAX_THUMBNAIL_CACHE_SIZE * 0.8:
                    break
            except Exception as exc:
                logger.warning("Failed to delete cached thumbnail %s: %s", filepath, exc)
    except Exception as exc:
        logger.warning("Failed to cleanup thumbnail cache: %s", exc)


def get_cached_thumbnail(file_id: str) -> Optional[bytes]:
    """
    Get thumbnail data from local encrypted cache.
    Returns None if not cached.
    """
    file_data = get_file_metadata(file_id)
    if not file_data or not file_data.get("thumbnail_path"):
        return None

    thumbnail_path = file_data["thumbnail_path"]
    if not os.path.exists(thumbnail_path):
        _clear_thumbnail_path_for_file(file_id)
        return None

    try:
        with open(thumbnail_path, "rb") as handle:
            encrypted_blob = handle.read()
        decrypted = _decrypt_thumbnail(file_id, encrypted_blob)
        now = time.time()
        os.utime(thumbnail_path, (now, now))
        return decrypted
    except Exception as exc:
        logger.warning("Cached thumbnail decrypt failed for %s: %s", file_id, exc)
        try:
            os.remove(thumbnail_path)
        except OSError:
            pass
        _clear_thumbnail_path_for_file(file_id)
        return None


def delete_cached_thumbnail(file_id: str):
    """Delete a cached thumbnail for a file, if it exists."""
    file_data = get_file_metadata(file_id)
    if not file_data:
        return

    thumbnail_path = file_data.get("thumbnail_path")
    if thumbnail_path and os.path.exists(thumbnail_path):
        try:
            os.remove(thumbnail_path)
        except OSError as exc:
            logger.warning("Failed to remove cached thumbnail for %s: %s", file_id, exc)

    _clear_thumbnail_path_for_file(file_id)


def clear_thumbnail_cache():
    """Clear all cached thumbnails."""
    if os.path.exists(THUMBNAIL_CACHE_DIR):
        shutil.rmtree(THUMBNAIL_CACHE_DIR)
        os.makedirs(THUMBNAIL_CACHE_DIR, exist_ok=True)

    conn = get_db_connection()
    cursor = conn.cursor()
    cursor.execute("UPDATE files SET thumbnail_path = NULL, updated_at = ?", (int(time.time()),))
    conn.commit()
    conn.close()
    print("[OK] Thumbnail cache cleared")


# Initialize database on import
init_db()
