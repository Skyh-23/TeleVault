"""
TeleVault Config
================
Application-wide constants, paths, and settings.

Author: Liethueis-Foundation © 2026
"""

import os
import sys

# ─────────────────────────────────────────────
#  Paths
# ─────────────────────────────────────────────

# Root of the backend package
BACKEND_DIR = os.path.dirname(os.path.abspath(__file__))


def resource_path(*parts: str) -> str:
    """Return a path that works both from source and from a PyInstaller bundle."""
    if getattr(sys, "frozen", False) and hasattr(sys, "_MEIPASS"):
        return os.path.join(sys._MEIPASS, *parts)
    return os.path.join(os.path.dirname(BACKEND_DIR), *parts)

# Persistent data directory — stored in %APPDATA%/TeleVault/data so that
# session files survive app reinstalls, path changes, and updates.
# Falls back to ~/TeleVault/data on non-Windows systems.
_appdata = os.environ.get("APPDATA") or os.path.expanduser("~")
DATA_DIR = os.path.join(_appdata, "TeleVault", "data")

# Telethon session file (no .session extension — Telethon adds it)
SESSION_FILE = os.path.join(DATA_DIR, "televault")

# Vault key — the local-only secret that protects all user data
VAULT_KEY_FILE = os.path.join(DATA_DIR, "vault.key")

# Download cache directory (temp blocks during download)
CACHE_DIR = os.path.join(DATA_DIR, "cache")

# ─────────────────────────────────────────────
#  Server
# ─────────────────────────────────────────────

SERVER_HOST = "127.0.0.1"
SERVER_PORT = 8765

# Frontend dev server (Vite)
FRONTEND_DEV_URL = "http://localhost:3000"

# Built frontend bundled by PyInstaller.
FRONTEND_DIST_DIR = resource_path("frontend", "dist")

# ─────────────────────────────────────────────
#  Block Sizes (from televault_crypto.py)
# ─────────────────────────────────────────────

# Media files — smaller blocks for streaming
BLOCK_SIZE_STREAM = 5 * 1024 * 1024      # 5 MiB

# Everything else — larger blocks for speed
BLOCK_SIZE_STORAGE = 20 * 1024 * 1024    # 20 MiB

# ─────────────────────────────────────────────
#  Telegram
# ─────────────────────────────────────────────

# Prefix for TeleVault channels (folders)
CHANNEL_PREFIX = "TeleVault-"

# Special channel for manifest storage (hidden from user)
MANIFEST_CHANNEL_TITLE = "TeleVault-System-Manifests"

# Max file size Telegram allows per upload (2 GiB)
TELEGRAM_MAX_FILE_SIZE = 2 * 1024 * 1024 * 1024

# ─────────────────────────────────────────────
#  Encryption
# ─────────────────────────────────────────────

# Algorithm identifier stored in manifests
ALGO_ID = "AES-256-GCM-TeleVault-v1"

# Vault key size in bytes
VAULT_KEY_SIZE = 32

# ─────────────────────────────────────────────
#  Ensure data directories exist
# ─────────────────────────────────────────────

os.makedirs(DATA_DIR, exist_ok=True)
os.makedirs(CACHE_DIR, exist_ok=True)
