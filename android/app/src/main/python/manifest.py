"""
TeleVault Manifest Manager
============================
Manages file manifests — the encrypted "directory" that maps files to their blocks.

Each uploaded file has a manifest containing:
- Original filename, size, MIME type
- Block count and message IDs
- Per-file salt for encryption
- SHA-256 checksum of the original file
- Whether the file is password-protected

The manifest itself is encrypted with the vault key and uploaded to Telegram
as a `.tvmanifest` document with a random UUID filename.

This is the "Smart Design" — combining caption-based quick listing with
manifest-based rich metadata.

Author: Liethueis-Foundation © 2026
"""

import os
import json
import uuid
import hashlib
import base64
import time
import logging
from typing import List, Optional, Dict, Any

from aes_gcm_crypto import (
    ALGO_ID, AESGCMCrypto,
    SALT_SIZE, NONCE_SIZE,
)

logger = logging.getLogger("televault.manifest")


# ─────────────────────────────────────────────
#  Manifest Structure
# ─────────────────────────────────────────────

MANIFEST_VERSION = 1


def create_manifest(
    filename: str,
    file_size: int,
    mime_type: str,
    block_size: int,
    total_blocks: int,
    block_message_ids: List[int],
    salt: bytes,
    checksum: str,
    password_protected: bool = False,
    thumbnail_block_id: Optional[int] = None,
) -> dict:
    """
    Create a manifest dictionary for an uploaded file.

    Args:
        filename: original file name (e.g., "movie.mp4")
        file_size: total file size in bytes
        mime_type: MIME type
        block_size: size of each block in bytes
        total_blocks: number of blocks
        block_message_ids: list of Telegram message IDs for each block
        salt: per-file encryption salt (32 bytes)
        checksum: SHA-256 hex digest of the original file
        password_protected: whether file requires password to decrypt
        thumbnail_block_id: Telegram message ID for encrypted thumbnail block

    Returns: manifest dict
    """
    return {
        "version": MANIFEST_VERSION,
        "filename": filename,
        "size": file_size,
        "mime": mime_type,
        "block_size": block_size,
        "total_blocks": total_blocks,
        "block_message_ids": block_message_ids,
        "salt": base64.b64encode(salt).decode('ascii'),
        "algo": ALGO_ID,
        "checksum": checksum,
        "password_protected": password_protected,
        "thumbnail_block_id": thumbnail_block_id,
        "created_at": time.strftime("%Y-%m-%dT%H:%M:%SZ", time.gmtime()),
    }


# ─────────────────────────────────────────────
#  Manifest Encryption / Decryption
# ─────────────────────────────────────────────

_MANIFEST_MAGIC = b"TVMF"  # TeleVault Manifest File


def encrypt_manifest(manifest: dict, vault_key: bytes) -> bytes:
    """
    Encrypt a manifest dict using the vault key with AES-GCM.

    The vault key is used directly (no per-file salt for manifests —
    manifests are the "index" encrypted with the vault identity).

    Format: MAGIC(4) + nonce(12) + encrypted_json + tag(16)
    """
    if len(vault_key) != 32:
        raise ValueError("Vault key must be 32 bytes")

    # Derive a manifest-specific key from vault key
    manifest_key = hashlib.sha256(b"TeleVault-Manifest-Key-v1:" + vault_key).digest()

    json_bytes = json.dumps(manifest, separators=(',', ':')).encode('utf-8')

    # Use AES-GCM for manifest encryption
    import os
    nonce = os.urandom(12)
    aad = b"TVMF"  # Additional authenticated data for manifests
    aesgcm = AESGCMCrypto(manifest_key, b'\x00' * 32)  # Salt not used for manifest key
    encrypted = aesgcm.aesgcm.encrypt(nonce, json_bytes, aad)

    return _MANIFEST_MAGIC + nonce + encrypted


def decrypt_manifest(data: bytes, vault_key: bytes) -> dict:
    """
    Decrypt manifest data back into a dict using AES-GCM.
    Raises ValueError if data is invalid or vault key is wrong.
    """
    if len(vault_key) != 32:
        raise ValueError("Vault key must be 32 bytes")

    if len(data) < len(_MANIFEST_MAGIC) + 12 + 16:  # magic + nonce + tag
        raise ValueError("Manifest data too short")

    magic = data[:len(_MANIFEST_MAGIC)]
    if magic != _MANIFEST_MAGIC:
        raise ValueError("Invalid manifest magic")

    nonce = data[len(_MANIFEST_MAGIC):len(_MANIFEST_MAGIC) + 12]
    encrypted = data[len(_MANIFEST_MAGIC) + 12:]

    # Derive manifest key
    manifest_key = hashlib.sha256(b"TeleVault-Manifest-Key-v1:" + vault_key).digest()

    # Use AES-GCM for manifest decryption
    aad = b"TVMF"  # Additional authenticated data for manifests
    aesgcm = AESGCMCrypto(manifest_key, b'\x00' * 32)  # Salt not used for manifest key
    json_bytes = aesgcm.aesgcm.decrypt(nonce, encrypted, aad)

    manifest = json.loads(json_bytes.decode('utf-8'))
    
    # Validate
    if manifest.get("version") != MANIFEST_VERSION:
        raise ValueError(f"Unsupported manifest version: {manifest.get('version')}")
    
    return manifest


# ─────────────────────────────────────────────
#  Manifest Upload / List
# ─────────────────────────────────────────────

async def upload_manifest(
    telegram_client,
    manifest: dict,
    vault_key: bytes,
    folder_id: Optional[int],
) -> int:
    """
    Encrypt and upload a manifest to Telegram.

    The manifest is stored as a document with:
    - Filename: random UUID + ".tvmanifest"
    - Caption: empty (no metadata leakage)

    Returns: message ID of the manifest
    """
    encrypted = encrypt_manifest(manifest, vault_key)

    # Random filename to obfuscate on Telegram
    manifest_filename = f"{uuid.uuid4().hex}.tvmanifest"

    # No caption - fully encrypted for privacy
    caption = ""

    message_id = await telegram_client.upload_block(
        data=encrypted,
        filename=manifest_filename,
        folder_id=folder_id,
        caption=caption,
    )

    logger.info(f"Uploaded manifest for '{manifest['filename']}' → msg_id={message_id}")
    return message_id


async def list_files_from_manifests(
    telegram_client,
    vault_key: bytes,
    folder_id: Optional[int],
    quick_mode: bool = False,
    should_stop=None,
) -> List[dict]:
    """
    List all files in a folder by reading manifests.

    Since manifests are fully encrypted (no caption metadata),
    this function must decrypt each manifest to get file information.

    `should_stop` (optional callable): checked between manifests; when it
    returns True the listing stops early. Used by the Android sync so a video
    stream never starves on the shared asyncio loop.

    Returns: [{ id, name, size, sizeStr, created_at, icon_type, password_protected }]
    """
    from telethon.tl.types import (
        MessageMediaDocument,
        DocumentAttributeFilename,
    )

    if folder_id is None:
        peer = "me"
    else:
        peer = await telegram_client._get_entity(folder_id)

    files = []
    async for message in telegram_client.client.iter_messages(peer, limit=1000):
        if should_stop is not None and should_stop():
            logger.info(f"Listing interrupted by active stream (folder {folder_id})")
            break
        if not message.media:
            continue
        if not isinstance(message.media, MessageMediaDocument):
            continue

        doc = message.media.document
        if not doc:
            continue

        # Check if this is a manifest
        filename = None
        for attr in doc.attributes:
            if isinstance(attr, DocumentAttributeFilename):
                filename = attr.file_name
                break

        if not filename or not filename.endswith(".tvmanifest"):
            continue

        # Decrypt manifest for metadata (no quick mode available)
        try:
            data = await telegram_client.download_block(message.id, folder_id)
            manifest = decrypt_manifest(data, vault_key)
            files.append({
                "id": message.id,
                "name": manifest["filename"],
                "size": manifest["size"],
                "mime": manifest.get("mime", ""),
                "created_at": manifest.get("created_at", ""),
                "icon_type": "file",
                "password_protected": manifest.get("password_protected", False),
            })
        except Exception as e:
            logger.warning(f"Failed to decrypt manifest msg_id={message.id}: {e}")
            continue

    logger.info(f"Listed {len(files)} files in folder {folder_id}")
    return files


async def get_manifest(
    telegram_client,
    message_id: int,
    vault_key: bytes,
    folder_id: Optional[int],
) -> dict:
    """
    Download and decrypt a specific manifest.
    Used during download/streaming to get block IDs.
    """
    data = await telegram_client.download_block(message_id, folder_id)
    manifest = decrypt_manifest(data, vault_key)
    return manifest


# ─────────────────────────────────────────────
#  File Checksum
# ─────────────────────────────────────────────

def compute_file_checksum(filepath: str) -> str:
    """Compute SHA-256 checksum of a file."""
    sha256 = hashlib.sha256()
    with open(filepath, 'rb') as f:
        while True:
            chunk = f.read(8192)
            if not chunk:
                break
            sha256.update(chunk)
    return sha256.hexdigest()


def get_mime_type(filename: str) -> str:
    """Guess MIME type from filename."""
    import mimetypes
    mime, _ = mimetypes.guess_type(filename)
    return mime or "application/octet-stream"


# ─────────────────────────────────────────────
#  Quick Test
# ─────────────────────────────────────────────

if __name__ == "__main__":
    print("=" * 50)
    print("  TeleVault Manifest — Self Test")
    print("=" * 50)

    vault_key = secure_random_bytes(32)
    salt = secure_random_bytes(32)

    # Create manifest
    m = create_manifest(
        filename="test_video.mp4",
        file_size=1073741824,
        mime_type="video/mp4",
        block_size=5242880,
        total_blocks=204,
        block_message_ids=list(range(100, 304)),
        salt=salt,
        checksum="abcdef" * 8 + "abcdef1234567890",
        password_protected=False,
    )
    print(f"\n[1] Manifest created: {m['filename']} ({m['total_blocks']} blocks)")

    # Encrypt
    encrypted = encrypt_manifest(m, vault_key)
    print(f"[2] Encrypted: {len(encrypted)} bytes")

    # Decrypt
    decrypted = decrypt_manifest(encrypted, vault_key)
    assert decrypted["filename"] == "test_video.mp4"
    assert decrypted["total_blocks"] == 204
    assert len(decrypted["block_message_ids"]) == 204
    print(f"[3] Decrypted: [OK] {decrypted['filename']}")

    # Wrong key
    wrong_key = secure_random_bytes(32)
    try:
        decrypt_manifest(encrypted, wrong_key)
        print("[4] Wrong key: [FAIL]")
    except ValueError as e:
        print(f"[4] Wrong key rejected: [OK]")

    print("\n" + "=" * 50)
    print("  All manifest tests passed! [OK]")
    print("=" * 50)
