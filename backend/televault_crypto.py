"""
TeleVault Crypto Utilities
==========================
Utility functions for file chunking and block size determination.
Encryption is now handled by aes_gcm_crypto.py (AES-256-GCM).

Author: Liethueis-Foundation © 2026
"""

import os

# ─────────────────────────────────────────────
#  Block Sizes
# ─────────────────────────────────────────────

BLOCK_SIZE_STREAM = 5 * 1024 * 1024      # 5 MB for media files
BLOCK_SIZE_STORAGE = 20 * 1024 * 1024    # 20 MB for other files

SALT_SIZE = 32

# ─────────────────────────────────────────────
#  Utility Functions
# ─────────────────────────────────────────────

def secure_random_bytes(size: int) -> bytes:
    """Generate cryptographically secure random bytes."""
    return os.urandom(size)


def get_block_size(filename: str) -> int:
    """
    Determine block size based on file extension.
    Media files use smaller blocks for streaming support.
    """
    ext = os.path.splitext(filename)[1].lower()
    media_extensions = {'.mp4', '.mkv', '.avi', '.mov', '.webm', '.flv',
                      '.mp3', '.wav', '.flac', '.aac', '.ogg', '.m4a',
                      '.jpg', '.jpeg', '.png', '.gif', '.webp', '.bmp'}
    
    if ext in media_extensions:
        return BLOCK_SIZE_STREAM
    return BLOCK_SIZE_STORAGE


def split_file(filepath: str, block_size: int):
    """
    Generator that yields chunks of a file.
    
    Args:
        filepath: Path to the file
        block_size: Size of each chunk in bytes
    
    Yields:
        (block_index, chunk) tuples
    """
    with open(filepath, 'rb') as f:
        block_index = 0
        while True:
            chunk = f.read(block_size)
            if not chunk:
                break
            yield block_index, chunk
            block_index += 1
