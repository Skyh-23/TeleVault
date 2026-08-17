"""
TeleVault Android config.

This copy is used only by the native Android app. It keeps all persistent
secrets and caches inside the app-private Chaquopy HOME directory.
"""

import os

BACKEND_DIR = os.path.dirname(os.path.abspath(__file__))

_app_home = os.environ.get("HOME") or os.environ.get("APPDATA") or os.path.expanduser("~")
DATA_DIR = os.path.join(_app_home, "TeleVault", "data")

SESSION_FILE = os.path.join(DATA_DIR, "televault")
VAULT_KEY_FILE = os.path.join(DATA_DIR, "vault.key")
CACHE_DIR = os.path.join(DATA_DIR, "cache")

BLOCK_SIZE_STREAM = 5 * 1024 * 1024
BLOCK_SIZE_STORAGE = 20 * 1024 * 1024

CHANNEL_PREFIX = "TeleVault-"
MANIFEST_CHANNEL_TITLE = "TeleVault-System-Manifests"
TELEGRAM_MAX_FILE_SIZE = 2 * 1024 * 1024 * 1024

ALGO_ID = "AES-256-GCM-TeleVault-v1"
VAULT_KEY_SIZE = 32

os.makedirs(DATA_DIR, exist_ok=True)
os.makedirs(CACHE_DIR, exist_ok=True)
