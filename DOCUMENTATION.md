# TeleVault Technical Documentation

## Overview

TeleVault is a personal encrypted storage application that uses Telegram as its remote storage layer.

The system has three primary application areas:

| Area | Location | Purpose |
|---|---|---|
| Backend | `backend/` | Python API, Telegram integration, encryption and vault operations |
| Frontend | `frontend/` | React + TypeScript desktop/web interface |
| Android | `android/` | Native Kotlin/Compose application with bundled Python functionality |

## Architecture

```text
React / TypeScript
        │
        ▼
     FastAPI
        │
        ├── Authentication
        ├── Folder Management
        ├── File Transfers
        ├── Vault Operations
        ├── Media Streaming
        └── Share Management
        │
        ▼
     Telethon
        │
        ▼
     Telegram
```

Android uses native Kotlin/Compose UI and calls its bundled Python command layer through Chaquopy rather than exposing the desktop HTTP API.

## Storage Model

TeleVault represents uploaded files using encrypted storage blocks and an encrypted manifest.

Conceptually:

```text
Original File
     │
     ▼
Block Partitioning
     │
     ▼
Per-block Encryption
     │
     ├── Encrypted Block 0
     ├── Encrypted Block 1
     ├── Encrypted Block 2
     └── ...
     │
     ▼
Encrypted Manifest
     │
     ▼
Telegram
```

The manifest contains the information required to locate and reconstruct the file.

## Encryption

TeleVault uses AES-256-GCM for authenticated encryption.

Argon2id is used where password-based key derivation is required.

The implementation also authenticates block-related information so that encrypted data cannot simply be rearranged without detection.

The exact implementation should always be treated as the source of truth; this document describes the architecture rather than replacing the cryptographic code.

## Vault Key

A local vault key is created and used by the application.

The key should never be committed to source control.

Recovery data is exported in encrypted form and protected by a user-supplied password.

If the vault key and all valid recovery backups are lost, encrypted data may be unrecoverable.

## Upload Flow

```text
File Selection
      │
      ▼
Read File
      │
      ▼
Split Into Blocks
      │
      ▼
Encrypt Blocks
      │
      ▼
Upload Encrypted Blocks
      │
      ▼
Write / Update Manifest
```

The desktop backend also contains transfer state used for resumable operations.

## Download Flow

```text
Read Manifest
      │
      ▼
Locate Blocks
      │
      ▼
Download Blocks
      │
      ▼
Decrypt
      │
      ▼
Verify Integrity
      │
      ▼
Reconstruct File
```

## Telegram Integration

Telethon provides Telegram connectivity.

The application supports:

- Saved Messages as a default storage location
- Private Telegram channels as folder-backed storage
- Telegram message IDs as references for stored encrypted blocks

Telegram remains an external service. Its availability, limits, account policies, and API behavior can change independently of TeleVault.

## Media

The desktop application can generate/cache thumbnails and provide decrypted media streams for supported content.

Streaming is performed through the local application rather than uploading plaintext media to Telegram.

## Local API

The desktop application exposes a local FastAPI server, normally on:

```text
http://127.0.0.1:8765
```

See [API.md](API.md) for endpoint details.

The API is designed for local application communication and should not be exposed directly to the public internet.

## Android Architecture

```text
Kotlin / Jetpack Compose
          │
          ▼
   Android command layer
          │
          ▼
   Bundled Python modules
       (Chaquopy)
          │
          ▼
      Telegram / Vault
```

The Android implementation is still under development.

## Security Boundaries

Important local secrets include:

```text
vault.key
*.session
api_id.txt
api_hash.txt
metadata.db
```

These must remain outside version control.

## Development Principles

- Encrypt before remote upload.
- Keep vault keys local.
- Never log secrets.
- Do not expose the local API unnecessarily.
- Validate decrypted data before writing final output.
- Preserve compatibility when changing the manifest format.
- Test recovery after changing cryptographic or vault logic.

## Project Status

The desktop application is the primary implementation.

Android is under active development.

Storage formats and APIs may change while the project evolves.

## Related Documentation

- [README](README.md)
- [Quick Start](QUICK_START.md)
- [Build Instructions](BUILD_INSTRUCTIONS.md)
- [API Reference](API.md)
- [Security](SECURITY.md)
- [Troubleshooting](TROUBLESHOOTING.md)
- [Crypto Engineering Notes](solution_for_speed.md)
