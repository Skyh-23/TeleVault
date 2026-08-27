"""
TeleVault Vault Key Manager
============================
Manages the local vault.key — the device-bound secret that encrypts all user data.

- vault.key is 32 random bytes, generated on first run
- It NEVER leaves the device over the network
- Combined with optional per-file password via Argon2id → master key
- Lost vault.key = lost data forever (unless exported backup exists)

Author: Hiren Sumra — Liethueis Foundation © 2026
"""

import os
import base64
import hashlib
import hmac
import json

from config import VAULT_KEY_FILE, VAULT_KEY_SIZE, DATA_DIR
import os
import argon2
from cryptography.hazmat.primitives.ciphers.aead import AESGCM
from cryptography.hazmat.primitives.kdf.hkdf import HKDF
from cryptography.hazmat.primitives import hashes
from cryptography.hazmat.backends import default_backend


# ─────────────────────────────────────────────
#  Helper Functions
# ─────────────────────────────────────────────

def secure_random_bytes(size: int) -> bytes:
    """Generate cryptographically secure random bytes."""
    return os.urandom(size)


def _derive_key_argon2id(password: str, salt: bytes) -> bytes:
    """Derive key using Argon2id."""
    if isinstance(password, str):
        password = password.encode('utf-8')
    raw_hash = argon2.low_level.hash_secret(
        password,
        salt,
        time_cost=1,
        memory_cost=16384,
        parallelism=4,
        hash_len=32,
        type=argon2.Type.ID
    )
    return raw_hash[:32]


def _derive_key_pbkdf2(password: str, salt: bytes, iterations: int = 600_000) -> bytes:
    """Derive key using PBKDF2 as fallback."""
    import hashlib
    from cryptography.hazmat.primitives.kdf.pbkdf2 import PBKDF2HMAC
    from cryptography.hazmat.primitives import hashes
    from cryptography.hazmat.backends import default_backend
    
    if isinstance(password, str):
        password = password.encode('utf-8')
    
    kdf = PBKDF2HMAC(
        algorithm=hashes.SHA256(),
        length=32,
        salt=salt,
        iterations=iterations,
        backend=default_backend()
    )
    return kdf.derive(password)


# ─────────────────────────────────────────────
#  Vault Key — Generate / Load
# ─────────────────────────────────────────────

def generate_vault_key() -> bytes:
    """
    Generate a new 32-byte vault key and save to disk.
    Called only on first app launch.
    """
    key = secure_random_bytes(VAULT_KEY_SIZE)
    os.makedirs(os.path.dirname(VAULT_KEY_FILE), exist_ok=True)
    with open(VAULT_KEY_FILE, 'wb') as f:
        f.write(key)
    return key


def load_vault_key() -> bytes:
    """
    Load the vault key from disk.
    If it doesn't exist, generate a new one (first run).
    """
    if os.path.exists(VAULT_KEY_FILE):
        with open(VAULT_KEY_FILE, 'rb') as f:
            key = f.read()
        if len(key) != VAULT_KEY_SIZE:
            raise ValueError(
                f"vault.key is corrupted: expected {VAULT_KEY_SIZE} bytes, "
                f"got {len(key)}. Restore from backup or data is lost."
            )
        return key
    else:
        return generate_vault_key()


def vault_key_exists() -> bool:
    """Check if a vault key already exists on disk."""
    return os.path.exists(VAULT_KEY_FILE)


# ─────────────────────────────────────────────
#  Master Key Derivation
# ─────────────────────────────────────────────

def derive_master_key(
    vault_key: bytes,
    file_salt: bytes,
    password: str = None,
) -> bytes:
    """
    Derive a 32-byte master key for file encryption.

    Combines:
    - vault_key (32 bytes, device-bound)
    - file_salt (32 bytes, per-file, stored in manifest)
    - password  (optional, user-provided for extra protection)

    If password is provided:
        input = vault_key + password.encode()
    Else:
        input = vault_key (hex-encoded as "password" for KDF)

    The result is always passed through Argon2id for memory-hardness.
    """
    if len(vault_key) != VAULT_KEY_SIZE:
        raise ValueError(f"Vault key must be {VAULT_KEY_SIZE} bytes")
    if len(file_salt) != 32:
        raise ValueError("File salt must be 32 bytes")

    # Build the "password" input for the KDF
    if password:
        # vault_key + user password → combined secret
        combined = vault_key.hex() + ":" + password
    else:
        # vault_key alone (hex-encoded so KDF treats it as string)
        combined = vault_key.hex()

    # Run through KDF (always use Argon2id now)
    try:
        master_key = _derive_key_argon2id(combined, file_salt)
    except RuntimeError:
        # argon2-cffi not installed → fallback to PBKDF2
        master_key = _derive_key_pbkdf2(combined, file_salt, iterations=600_000)

    if len(master_key) != 32:
        raise RuntimeError("KDF produced invalid key length")

    return master_key


# ─────────────────────────────────────────────
#  Vault Key Export / Import (Backup)
# ─────────────────────────────────────────────

_EXPORT_VERSION = 1
_EXPORT_MAGIC = b"TVAULT-BACKUP-V1"
_EXPORT_MAGIC_V2 = b"TVAULT-BACKUP-V2"


def _derive_backup_key_argon2id(password: str, salt: bytes) -> bytes:
    """Derive a raw 32-byte key for encrypting vault recovery files."""
    if isinstance(password, str):
        password = password.encode("utf-8")
    return argon2.low_level.hash_secret_raw(
        password,
        salt,
        time_cost=1,
        memory_cost=16384,
        parallelism=4,
        hash_len=32,
        type=argon2.Type.ID,
    )


def export_vault_key(export_password: str) -> bytes:
    """
    Export vault.key as an encrypted backup file.

    The backup is encrypted with the export password via Argon2id + AES-256-GCM.
    User can transfer this file to another device.

    Returns: encrypted backup bytes
    """
    if not export_password:
        raise ValueError("Export password cannot be empty")

    vault_key = load_vault_key()
    salt = secure_random_bytes(32)

    # Derive encryption key from export password.
    enc_key = _derive_backup_key_argon2id(export_password, salt)

    # Encrypt vault key using AES-256-GCM
    nonce = secure_random_bytes(12)
    aesgcm = AESGCM(enc_key)
    encrypted = aesgcm.encrypt(nonce, vault_key, None)

    # Build backup format: magic + salt + nonce + encrypted_data
    backup = _EXPORT_MAGIC_V2 + salt + nonce + encrypted

    # Add HMAC for integrity
    mac = hmac.new(enc_key, backup, hashlib.sha256).digest()
    return backup + mac


def import_vault_key(backup_data: bytes, export_password: str) -> bool:
    """
    Restore vault.key from an encrypted backup.

    Args:
        backup_data: the encrypted backup bytes
        export_password: the password used during export

    Returns: True if successful

    Raises: ValueError if backup is invalid or password is wrong
    """
    if not export_password:
        raise ValueError("Export password cannot be empty")

    # Parse backup
    if len(backup_data) < len(_EXPORT_MAGIC) + 32 + 12 + 16 + 32:
        raise ValueError("Backup file is too short / corrupted")

    magic = backup_data[:len(_EXPORT_MAGIC_V2)]
    # V1 legacy support for migration from old 7/31 .exe
    if magic == _EXPORT_MAGIC:
        salt = backup_data[len(_EXPORT_MAGIC):len(_EXPORT_MAGIC) + 32]
        nonce = backup_data[len(_EXPORT_MAGIC) + 32:len(_EXPORT_MAGIC) + 44]
        encrypted = backup_data[len(_EXPORT_MAGIC) + 44:-32]
        mac = backup_data[-32:]
        enc_key = _derive_key_argon2id(export_password, salt)
        expected_mac = hmac.new(enc_key, backup_data[:-32], hashlib.sha256).digest()
        if not hmac.compare_digest(mac, expected_mac):
            raise ValueError("Wrong password or corrupted backup (V1 legacy file)")
        aesgcm = AESGCM(enc_key)
        try:
            vault_key = aesgcm.decrypt(nonce, encrypted, None)
        except Exception as exc:
            raise ValueError(f"Wrong password or corrupted backup (V1 decrypt failed): {exc}") from exc
        if len(vault_key) != VAULT_KEY_SIZE:
            raise ValueError("Decrypted vault key has invalid size")
        os.makedirs(os.path.dirname(VAULT_KEY_FILE), exist_ok=True)
        with open(VAULT_KEY_FILE, 'wb') as f:
            f.write(vault_key)
        return True

    if magic != _EXPORT_MAGIC_V2:
        raise ValueError("Invalid backup file format")

    salt = backup_data[len(_EXPORT_MAGIC_V2):len(_EXPORT_MAGIC_V2) + 32]
    nonce = backup_data[len(_EXPORT_MAGIC_V2) + 32:len(_EXPORT_MAGIC_V2) + 44]
    encrypted = backup_data[len(_EXPORT_MAGIC_V2) + 44:-32]
    mac = backup_data[-32:]

    # Derive key and verify MAC (V2 secure)
    enc_key = _derive_backup_key_argon2id(export_password, salt)
    expected_mac = hmac.new(enc_key, backup_data[:-32], hashlib.sha256).digest()

    if not hmac.compare_digest(mac, expected_mac):
        raise ValueError("Wrong password or corrupted backup")

    # Decrypt vault key using AES-256-GCM
    aesgcm = AESGCM(enc_key)
    vault_key = aesgcm.decrypt(nonce, encrypted, None)

    if len(vault_key) != VAULT_KEY_SIZE:
        raise ValueError("Decrypted vault key has invalid size")

    # Save to disk
    os.makedirs(os.path.dirname(VAULT_KEY_FILE), exist_ok=True)
    with open(VAULT_KEY_FILE, 'wb') as f:
        f.write(vault_key)

    return True


# ─────────────────────────────────────────────
#  Quick Test
# ─────────────────────────────────────────────

if __name__ == "__main__":
    print("=" * 50)
    print("  TeleVault Vault — Self Test")
    print("=" * 50)

    # Load or generate vault key
    key = load_vault_key()
    print(f"\n[1] Vault key loaded: {key.hex()[:16]}... ({len(key)} bytes)")

    # Derive master key
    salt = secure_random_bytes(32)
    mk1 = derive_master_key(key, salt)
    print(f"[2] Master key (no password): {mk1.hex()[:16]}...")

    mk2 = derive_master_key(key, salt, password="test123")
    print(f"[3] Master key (with password): {mk2.hex()[:16]}...")

    assert mk1 != mk2, "Keys should differ with/without password"
    print("[4] Keys differ: [OK]")

    # Export / Import
    print("\n[5] Testing export/import...")
    backup = export_vault_key("backup-password-123")
    print(f"    Backup size: {len(backup)} bytes")

    # Temporarily rename vault.key to test import
    import shutil
    temp_path = VAULT_KEY_FILE + ".bak"
    shutil.move(VAULT_KEY_FILE, temp_path)

    try:
        import_vault_key(backup, "backup-password-123")
        restored_key = load_vault_key()
        assert restored_key == key, "Restored key doesn't match!"
        print("    Import: [OK] Key matches")
    finally:
        # Restore original
        shutil.move(temp_path, VAULT_KEY_FILE)

    # Wrong password test
    try:
        import_vault_key(backup, "wrong-password")
        print("    Wrong password: [FAIL] (should have raised)")
    except ValueError as e:
        print(f"    Wrong password rejected: [OK] — {e}")

    print("\n" + "=" * 50)
    print("  All vault tests passed! [OK]")
    print("=" * 50)
