# TeleVault Documentation

This document explains the repository architecture, build flow, security model,
and release checklist for TeleVault.

## 1. Overview

TeleVault is a personal encrypted drive that stores encrypted file blocks in a
Telegram account. The desktop/web app and Android app share the same vault
format so a user can access the same uploaded files from multiple builds.

TeleVault is a student-built project by Liethueis-Foundation for education, research,
transparency, and personal experimentation with user-side encryption. It is not
an official Telegram product.

The project has three major parts:

| Area | Path | Purpose |
| --- | --- | --- |
| Backend | `backend/` | Python API, Telegram operations, crypto, vault handling |
| Frontend | `frontend/` | React UI for the desktop/web experience |
| Android | `android/` | Native Kotlin/Compose app with bundled Python core |

## 2. Storage Design

TeleVault does not upload raw files.

Upload flow:

1. Read the local file.
2. Choose block size based on file type.
3. Generate a per-file salt.
4. Derive encryption keys from the local vault key and optional file password.
5. Encrypt each block with AES-256-GCM.
6. Upload encrypted blocks to Telegram.
7. Create an encrypted manifest with metadata and block message IDs.
8. Upload the encrypted manifest.

Download flow:

1. Download and decrypt the manifest.
2. Fetch encrypted blocks by Telegram message ID.
3. Decrypt blocks in order.
4. Reassemble the original file.
5. Verify the SHA-256 checksum.

## 3. Folder Model

TeleVault treats Telegram storage locations as folders:

- `Saved Messages` is the default root storage.
- Private Telegram channels named with the configured TeleVault prefix are used
  as additional folders.

The manifest stores folder-compatible metadata, while the actual folder location
is represented by the Telegram peer/channel used for upload.

## 4. Encryption And Vault

Core files:

- `backend/vault.py`
- `backend/aes_gcm_crypto.py`
- `backend/manifest.py`
- `backend/televault_crypto.py`

Security properties:

- File contents are encrypted before they leave the device.
- AES-GCM provides confidentiality and tamper detection.
- Block index is authenticated to protect block ordering.
- Manifests are encrypted with a manifest-specific key derived from the vault
  key.
- Recovery files are encrypted and authenticated.

Important local secrets:

- `vault.key`
- Telegram session files
- saved Telegram API credentials

These are excluded from Git and must stay private.

## 5. Desktop/Web Architecture

The desktop app uses:

- FastAPI backend on localhost.
- Telethon for Telegram account access.
- React + TypeScript frontend.
- PyWebView/PyInstaller for packaged Windows use.

Key backend endpoints follow the `cmd_*` naming style, for example:

- `cmd_auth_request_code`
- `cmd_auth_sign_in`
- `cmd_connect`
- `cmd_scan_folders`
- `cmd_get_files`
- `cmd_upload_file`
- `cmd_download_file`
- `cmd_export_vault`
- `cmd_import_vault`

The frontend calls these through `frontend/src/lib/api.ts`.

See `API.md` for a fuller endpoint reference.

## 6. Android Architecture

The Android app is native, not a WebView. It is still in development.

Android layers:

- Kotlin/Compose UI in `android/app/src/main/java/.../MainActivity.kt`
- Python command bridge in `android/app/src/main/python/android_commands.py`
- Shared Python core copied from `backend/`
- Chaquopy bundles Python and native Python wheels into the APK

Fresh clone Android setup:

```powershell
cd android
.\tools\vendor-python-deps.ps1
```

This vendors pure-Python Telegram dependencies that are intentionally excluded
from Git.

Android build outputs are generated under:

```text
android/app/build/
```

Do not commit Android build outputs.

## 7. Build Instructions

### Desktop Development

```powershell
pip install -r requirements.txt
cd frontend
npm install
npm run dev
```

In another terminal:

```powershell
python backend/main.py --dev
```

### Windows EXE

```powershell
python build.py
```

Output goes to `dist/`.

### Android APK

```powershell
cd android
.\tools\vendor-python-deps.ps1
```

Then build with Android Studio or Gradle:

```powershell
gradle assembleDebug
```

If Gradle is not installed globally, use Android Studio or add a Gradle wrapper
before release.

## 8. Release Checklist

Before publishing:

- Run a secret/artifact scan.
- Confirm no `vault.key`, sessions, databases, or logs are present.
- Confirm no APK/EXE/ZIP build outputs are committed.
- Confirm `android/local.properties` is not committed.
- Build desktop and Android from a clean clone.
- Test login, reconnect, sync, upload, download, vault export, and vault import.
- Test wrong recovery password rejection.
- Test Android install on a real device.
- Re-read the disclaimer in `README.md` and keep it visible for users.

Suggested scan commands:

```powershell
rg --files | rg "(?i)(vault\.key|\.session|api_hash|api_id|metadata\.db|\.apk$|\.exe$|\.zip$|local\.properties$)"
rg "(?i)(api_hash\s*=|api_id\s*=|bot_token|secret\s*=|password\s*=)" .
```

The second command may find normal variable names. Review hits manually.

## 9. Repository Hygiene

Keep these out of Git:

- `node_modules/`
- `frontend/dist/`
- `dist/`
- `backend/build/`
- `backend/dist/`
- `android/.gradle/`
- `android/.kotlin/`
- `android/app/build/`
- `android/local.properties`
- `android/app/src/main/python/telethon/`
- `android/app/src/main/python/pyaes/`
- `android/app/src/main/python/rsa/`
- `android/app/src/main/python/pyasn1/`

The Android dependency folders can be regenerated with:

```powershell
cd android
.\tools\vendor-python-deps.ps1
```

## 10. Roadmap

High-value next work:

- Android vault recovery screen.
- Android transfer progress UI.
- Android move/delete/share screens.
- Release signing for APK/AAB.
- Automated clean-clone build checks.
- More focused tests for vault import/export and manifest compatibility.

## 11. Attribution

TeleVault is built and maintained by Liethueis-Foundation.

Project ownership, release decisions, and the current TeleVault product direction
in this repository are maintained under Liethueis-Foundation.

## 12. Responsibility And Risk

TeleVault is experimental software. It depends on Telegram account access,
Telegram API behavior, local files, local keys, and encrypted manifests staying
valid. Any of those can fail.

Users are responsible for:

- Keeping their own Telegram account safe.
- Keeping `vault.key` and recovery files safe.
- Testing recovery before trusting important data.
- Keeping independent backups of important files.
- Understanding Telegram service limits and terms.

The author and contributors do not accept responsibility for lost data, account
problems, broken backups, deleted Telegram messages, service policy changes, or
other damage from using this project.
