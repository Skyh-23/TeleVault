"""
TeleVault Local Metadata Database
===================================
SQLite database for instant file listing and metadata browsing.
Telegram is used only for storage, SQLite is the index engine.

Author: Liethueis-Foundation © 2026
"""

import sqlite3
import os
import time
import shutil
from typing import List, Dict, Optional, Any
from datetime import datetime
from config import DATA_DIR

# Database file path
DB_FILE = os.path.join(DATA_DIR, "metadata.db")

# Thumbnail cache directory
THUMBNAIL_CACHE_DIR = os.path.join(DATA_DIR, "thumbnails")
os.makedirs(THUMBNAIL_CACHE_DIR, exist_ok=True)

# Thumbnail cache size limit (2GB)
MAX_THUMBNAIL_CACHE_SIZE = 2 * 1024 * 1024 * 1024  # 2GB

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

# Initialize database
def init_db():
    """Initialize the metadata database."""
    os.makedirs(DATA_DIR, exist_ok=True)
    
    conn = sqlite3.connect(DB_FILE)
    cursor = conn.cursor()
    
    # Execute schema
    cursor.executescript(FILES_TABLE_SCHEMA)
    
    conn.commit()
    conn.close()
    
    print(f"✅ Metadata database initialized at {DB_FILE}")


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
    Called after successful upload.
    """
    conn = get_db_connection()
    cursor = conn.cursor()
    
    now = int(time.time())
    
    cursor.execute("""
        INSERT OR REPLACE INTO files 
        (id, folder_id, name, size, mime, thumbnail_path, manifest_message_id, thumbnail_message_id, created_at, updated_at)
        VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
    """, (
        file_id,
        str(folder_id) if folder_id else None,
        name,
        size,
        mime,
        thumbnail_path,
        manifest_message_id,
        thumbnail_message_id,
        now,
        now
    ))
    
    conn.commit()
    conn.close()


def get_files_by_folder(
    folder_id: Optional[int],
    limit: int = 1000,
    offset: int = 0
) -> List[Dict[str, Any]]:
    """
    Get files from a folder using SQLite (instant).
    Returns list of file metadata dictionaries.
    """
    conn = get_db_connection()
    cursor = conn.cursor()
    
    folder_id_str = str(folder_id) if folder_id else None
    
    if folder_id_str:
        cursor.execute("""
            SELECT * FROM files 
            WHERE folder_id = ?
            ORDER BY created_at DESC
            LIMIT ? OFFSET ?
        """, (folder_id_str, limit, offset))
    else:
        cursor.execute("""
            SELECT * FROM files 
            WHERE folder_id IS NULL
            ORDER BY created_at DESC
            LIMIT ? OFFSET ?
        """, (limit, offset))
    
    rows = cursor.fetchall()
    
    files = []
    for row in rows:
        files.append({
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
        })
    
    conn.close()
    return files


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
    
    cursor.execute("""
        SELECT * FROM files 
        WHERE name LIKE ?
        ORDER BY created_at DESC
        LIMIT ?
    """, (f"%{query}%", limit))
    
    rows = cursor.fetchall()
    
    files = []
    for row in rows:
        files.append({
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
        })
    
    conn.close()
    return files


def get_file_metadata(file_id: str) -> Optional[Dict[str, Any]]:
    """Get file metadata by ID."""
    conn = get_db_connection()
    cursor = conn.cursor()
    
    cursor.execute("SELECT * FROM files WHERE id = ?", (file_id,))
    row = cursor.fetchone()
    
    if row:
        file_data = {
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
        conn.close()
        return file_data
    
    conn.close()
    return None


def save_cached_thumbnail(file_id: str, thumbnail_data: bytes) -> str:
    """
    Save thumbnail data to local cache.
    Returns the local file path.
    Implements LRU eviction if cache exceeds size limit.
    """
    import uuid
    thumbnail_filename = f"{file_id}_{uuid.uuid4().hex}.webp"
    thumbnail_path = os.path.join(THUMBNAIL_CACHE_DIR, thumbnail_filename)
    
    with open(thumbnail_path, "wb") as f:
        f.write(thumbnail_data)
    
    # Check cache size and implement LRU eviction
    _cleanup_thumbnail_cache()
    
    # Update database with thumbnail path
    conn = get_db_connection()
    cursor = conn.cursor()
    
    cursor.execute("""
        UPDATE files 
        SET thumbnail_path = ?, updated_at = ?
        WHERE id = ?
    """, (thumbnail_path, int(time.time()), file_id))
    
    conn.commit()
    conn.close()
    
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
        
        # If cache size exceeds limit, delete oldest files
        if total_size > MAX_THUMBNAIL_CACHE_SIZE:
            # Sort by modification time (oldest first)
            files.sort(key=lambda x: x[1])
            
            for filepath, mtime, size in files:
                try:
                    os.remove(filepath)
                    total_size -= size
                    
                    # Update database to remove thumbnail path
                    filename = os.path.basename(filepath)
                    # Extract file_id from filename (format: file_id_uuid.webp)
                    file_id = filename.split('_')[0]
                    
                    conn = get_db_connection()
                    cursor = conn.cursor()
                    cursor.execute(
                        "UPDATE files SET thumbnail_path = NULL WHERE id = ?",
                        (file_id,)
                    )
                    conn.commit()
                    conn.close()
                    
                    if total_size <= MAX_THUMBNAIL_CACHE_SIZE * 0.8:  # Stop at 80% of limit
                        break
                except Exception as e:
                    logger = __import__('logging').getLogger('televault.db')
                    logger.warning(f"Failed to delete cached thumbnail: {e}")
    except Exception as e:
        logger = __import__('logging').getLogger('televault.db')
        logger.warning(f"Failed to cleanup thumbnail cache: {e}")


def get_cached_thumbnail(file_id: str) -> Optional[bytes]:
    """
    Get thumbnail data from local cache.
    Returns None if not cached.
    """
    file_data = get_file_metadata(file_id)
    
    if not file_data or not file_data.get("thumbnail_path"):
        return None
    
    thumbnail_path = file_data["thumbnail_path"]
    
    if not os.path.exists(thumbnail_path):
        return None
    
    with open(thumbnail_path, "rb") as f:
        return f.read()


def clear_thumbnail_cache():
    """Clear all cached thumbnails."""
    if os.path.exists(THUMBNAIL_CACHE_DIR):
        shutil.rmtree(THUMBNAIL_CACHE_DIR)
        os.makedirs(THUMBNAIL_CACHE_DIR, exist_ok=True)
        print("✅ Thumbnail cache cleared")


# Initialize database on import
init_db()
