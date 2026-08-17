"""
TeleVault Share Module
=======================
Channel-based end-to-end sharing.

A share creates a dedicated private Telegram channel ("share channel"),
forwards the file's encrypted blocks into it, and posts a metadata
envelope encrypted with a *mandatory* password. The recipient joins the
channel with their own Telegram account and unlocks the envelope with the
password — only then can the blocks be decrypted.

The envelope carries the per-file master key (derived from the sharer's
vault key + per-file salt). Sharing it unlocks *only that one file* — the
sharer's vault key itself never leaves their device, and blocks stay
AES-256-GCM ciphertext end-to-end.

Author: Hiren Sumra — Liethueis Foundation © 2026
"""

import os
import json
import hmac
import hashlib
import secrets

import argon2
from cryptography.hazmat.primitives.ciphers.aead import AESGCM

# ─────────────────────────────────────────────
#  Constants
# ─────────────────────────────────────────────

SHARE_MAGIC = b"TVSH"            # TeleVault Share envelope
SHARE_LINK_SCHEME = "televault://share"
SHARE_MIN_PASSWORD_LENGTH = 12
SHARE_SALT_SIZE = 32
SHARE_NONCE_SIZE = 12
SHARE_AUTH_TAG_SIZE = 16
SHARE_MAC_SIZE = 32

SHARE_FORWARD_CHUNK = 50  # Telegram forward limit per call

# Strong-share access key (SKYH256:<random>) — a second factor shared
# alongside the password. Both the access key AND the password are needed
# to unlock the envelope.
ACCESS_KEY_PREFIX = "SKYH256:"
ACCESS_KEY_RANDOM_LENGTH = 20
ACCESS_KEY_ALPHABET = (
    "ABCDEFGHIJKLMNOPQRSTUVWXYZ"
    "abcdefghijklmnopqrstuvwxyz"
    "0123456789$%&*()!+-_=?@#"
)

# Argon2id parameters for share-envelope key derivation.
SHARE_ARGON2_TIME_COST = 3
SHARE_ARGON2_MEMORY_COST = 64 * 1024  # 64 MiB (in KiB)
SHARE_ARGON2_PARALLELISM = 4
SHARE_ARGON2_HASH_LEN = 32


# ─────────────────────────────────────────────
#  Password Policy
# ─────────────────────────────────────────────

def validate_share_password(password: str) -> None:
    """Raise ValueError if the password does not meet share policy."""
    if not isinstance(password, str) or not password:
        raise ValueError("A share password is required")
    if len(password) < SHARE_MIN_PASSWORD_LENGTH:
        raise ValueError(
            f"Share password must be at least {SHARE_MIN_PASSWORD_LENGTH} characters"
        )


def generate_access_key() -> str:
    """Generate a random SKYH256 access key, e.g. SKYH256:aB3$xY9..."""
    random_part = "".join(
        secrets.choice(ACCESS_KEY_ALPHABET) for _ in range(ACCESS_KEY_RANDOM_LENGTH)
    )
    return f"{ACCESS_KEY_PREFIX}{random_part}"


def normalize_access_key(access_key: str) -> str:
    """Strip the optional SKYH256: prefix and surrounding whitespace."""
    key = (access_key or "").strip()
    if key.upper().startswith(ACCESS_KEY_PREFIX.upper()):
        key = key[len(ACCESS_KEY_PREFIX):].strip()
    return key


def validate_access_key(access_key: str) -> None:
    """Raise ValueError if the access key is missing or too short."""
    if not isinstance(access_key, str) or not access_key.strip():
        raise ValueError("An access key is required")
    normalized = normalize_access_key(access_key)
    if len(normalized) < 8:
        raise ValueError(
            "Access key must be at least 8 characters after the SKYH256: prefix"
        )


def derive_share_key(
    password: str,
    salt: bytes,
    access_key: str = "",
) -> bytes:
    """
    Derive a 32-byte envelope key from the password using Argon2id.

    When an access key is provided (strong share), the password-derived key
    is combined with the access key so BOTH are required to unlock the
    envelope.
    """
    if isinstance(password, str):
        password = password.encode("utf-8")
    base_key = argon2.low_level.hash_secret_raw(
        password,
        salt,
        time_cost=SHARE_ARGON2_TIME_COST,
        memory_cost=SHARE_ARGON2_MEMORY_COST,
        parallelism=SHARE_ARGON2_PARALLELISM,
        hash_len=SHARE_ARGON2_HASH_LEN,
        type=argon2.Type.ID,
    )
    normalized_key = normalize_access_key(access_key)
    if normalized_key:
        # Blind the password-derived key with the access key so both factors
        # are needed: final_key = HMAC-SHA256(access_key, base_key).
        return hmac.new(
            normalized_key.encode("utf-8"),
            base_key,
            hashlib.sha256,
        ).digest()
    return base_key


# ─────────────────────────────────────────────
#  Envelope Crypto
# ─────────────────────────────────────────────
#  Format: MAGIC(4) + salt(32) + nonce(12) + AES-GCM ciphertext + HMAC(32)

def encrypt_share_payload(
    payload: dict,
    password: str,
    access_key: str = "",
) -> bytes:
    """
    Encrypt a share payload dict with a password-derived key.

    If access_key is provided (strong share), it is also required to
    decrypt. Returns: envelope bytes (MAGIC + salt + nonce + ciphertext + MAC).
    """
    validate_share_password(password)
    if access_key:
        validate_access_key(access_key)
    salt = os.urandom(SHARE_SALT_SIZE)
    key = derive_share_key(password, salt, access_key)
    nonce = os.urandom(SHARE_NONCE_SIZE)
    plaintext = json.dumps(payload, separators=(",", ":")).encode("utf-8")
    ciphertext = AESGCM(key).encrypt(nonce, plaintext, SHARE_MAGIC)
    envelope = SHARE_MAGIC + salt + nonce + ciphertext
    mac = hmac.new(key, envelope, hashlib.sha256).digest()
    return envelope + mac


def decrypt_share_payload(
    data: bytes,
    password: str,
    access_key: str = "",
) -> dict:
    """
    Decrypt a share envelope with the password (and access key for strong
    shares).

    Returns: the original payload dict.

    Raises: ValueError if the envelope is malformed or the password/access
    key is wrong.
    """
    minimum = (
        len(SHARE_MAGIC)
        + SHARE_SALT_SIZE
        + SHARE_NONCE_SIZE
        + SHARE_AUTH_TAG_SIZE
        + SHARE_MAC_SIZE
    )
    if len(data) < minimum:
        raise ValueError("Share envelope is too short / corrupted")
    if data[: len(SHARE_MAGIC)] != SHARE_MAGIC:
        raise ValueError("Invalid share envelope")

    offset = len(SHARE_MAGIC)
    salt = data[offset : offset + SHARE_SALT_SIZE]
    offset += SHARE_SALT_SIZE
    nonce = data[offset : offset + SHARE_NONCE_SIZE]
    offset += SHARE_NONCE_SIZE
    ciphertext = data[offset:-SHARE_MAC_SIZE]
    mac = data[-SHARE_MAC_SIZE:]

    key = derive_share_key(password, salt, access_key)
    expected_mac = hmac.new(key, data[:-SHARE_MAC_SIZE], hashlib.sha256).digest()
    if not hmac.compare_digest(mac, expected_mac):
        raise ValueError("Wrong password or access key")

    try:
        plaintext = AESGCM(key).decrypt(nonce, ciphertext, SHARE_MAGIC)
        payload = json.loads(plaintext.decode("utf-8"))
    except Exception:
        raise ValueError("Wrong password or access key")

    if not isinstance(payload, dict):
        raise ValueError("Invalid share envelope contents")
    return payload


# ─────────────────────────────────────────────
#  Share Link Format
# ─────────────────────────────────────────────
#  televault://share?rid=<revoke id>&exp=<unix>&inv=<invite hash>&mid=<metadata msg id>

def build_share_link(
    rid: str,
    expiry: int,
    invite_hash: str,
    metadata_message_id: int,
    requires_access_key: bool = False,
) -> str:
    """Build a televault share link from its components."""
    params = [
        f"rid={rid}",
        f"exp={int(expiry)}",
        f"inv={invite_hash}",
        f"mid={int(metadata_message_id)}",
    ]
    if requires_access_key:
        params.append("ak=1")
    return f"{SHARE_LINK_SCHEME}?{'&'.join(params)}"


def parse_share_link(link: str) -> dict:
    """
    Parse and validate a televault share link.

    Returns: {"rid": str, "exp": int, "inv": str, "mid": int}

    Raises: ValueError if the link is malformed or missing required params.
    """
    if not link or "?" not in link:
        raise ValueError("Invalid share link")
    scheme_path, query = link.split("?", 1)
    if scheme_path.strip() != SHARE_LINK_SCHEME:
        raise ValueError("Invalid share link")

    params = {}
    for pair in query.split("&"):
        if not pair:
            continue
        if "=" in pair:
            key, value = pair.split("=", 1)
            params[key] = value

    rid = params.get("rid", "").strip()
    exp_raw = params.get("exp", "").strip()
    invite_hash = params.get("inv", "").strip()
    mid_raw = params.get("mid", "").strip()

    if not rid or not exp_raw or not invite_hash or not mid_raw:
        raise ValueError("Share link is missing required parameters")

    try:
        exp = int(exp_raw)
        mid = int(mid_raw)
    except (TypeError, ValueError):
        raise ValueError("Share link has invalid parameters")

    if exp <= 0 or mid <= 0:
        raise ValueError("Share link has invalid parameters")

    return {
        "rid": rid,
        "exp": exp,
        "inv": invite_hash,
        "mid": mid,
        "requires_access_key": params.get("ak", "").strip() == "1",
    }


def extract_invite_hash(link: str) -> str:
    """Extract the raw invite token from a t.me/+hash or t.me/joinchat/hash link."""
    link = (link or "").strip()
    if not link:
        return ""
    if "/+" in link:
        return link.rsplit("/+", 1)[1]
    if "/joinchat/" in link:
        return link.rsplit("/joinchat/", 1)[1]
    return link
