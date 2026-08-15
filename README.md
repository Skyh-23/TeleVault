# TeleVault

Encrypted personal cloud storage powered by your Telegram account.

TeleVault lets you upload files to Telegram as encrypted blocks, browse them as a
drive, stream media, and restore your vault on another device with a recovery
file. It includes a desktop/web build and a native Android project in the same
repository.

> TeleVault is independent software and is not affiliated with Telegram.
> It is a student-built research and education project made for learning,
> transparency, and improving user-side file privacy.

## Disclaimer

TeleVault is not an official Telegram product, not endorsed by Telegram, and not
connected to Telegram FZ-LLC.

This project is provided for educational, research, and personal-use purposes.
The goal is to explore user-controlled encryption and privacy-preserving storage.
Use it responsibly and follow Telegram's terms and all applicable laws.

No warranty is provided. The author and contributors are not responsible for
account restrictions, data loss, corrupted backups, lost keys, service changes,
misuse, or any other damage caused by using or modifying this software.

The Android version is still in development. It is included for transparency and
experimentation, but it should be tested carefully before storing important data.

## Highlights

- End-to-end local encryption before upload.
- AES-256-GCM authenticated encryption for file blocks and manifests.
- Argon2id-based key derivation for vault recovery and protected files.
- Telegram account storage through Telethon.
- Private Telegram channels work as folders.
- Saved Messages support for default storage.
- Manifest-based metadata so desktop and Android can read the same vault.
- Resume-aware transfer logic in the desktop backend.
- Media streaming support for desktop/web.
- Native Android app under `android/`, not a WebView wrapper.
- Windows `.exe` packaging support.

## Apps In This Repository

| Target | Location | Status |
| --- | --- | --- |
| Desktop/Web | `backend/` + `frontend/` | Main app |
| Windows EXE | `build.py` | PyInstaller packaging |
| Android | `android/` | Native Kotlin/Compose + bundled Python core, in development |

## How It Works

1. TeleVault creates a local `vault.key` on first run.
2. Each selected file is split into storage blocks.
3. Blocks are encrypted locally before upload.
4. Encrypted blocks are uploaded to Telegram.
5. A small encrypted manifest records filename, size, block IDs, checksum, and
   encryption metadata.
6. Downloads read the manifest, fetch blocks, decrypt locally, and verify the
   checksum.

Telegram sees encrypted block files and encrypted manifests, not the original
file contents.

## Security Model

TeleVault keeps the encryption key local to the device.

Do not commit or share:

- `vault.key`
- `*.session`
- `api_hash.txt`
- `api_id.txt`
- `metadata.db`
- APK/EXE/ZIP build outputs
- Android `local.properties`

The repository `.gitignore` is configured to exclude these files.

Recovery files are encrypted with a password. Losing `vault.key` without a valid
recovery file means encrypted data cannot be decrypted.

## Requirements

Desktop development:

- Python 3.10+
- Node.js 18+
- Telegram API ID and API hash from `my.telegram.org`

Android development:

- Android Studio
- Android SDK
- Python 3.12 for Chaquopy build packaging

End users do not need Python or Node installed when you share built apps:

- Windows users can run the packaged `.exe`.
- Android users can install the APK.

## Desktop Development

Install Python dependencies:

```powershell
pip install -r requirements.txt
```

Install frontend dependencies:

```powershell
cd frontend
npm install
```

Run the frontend in development:

```powershell
npm run dev
```

Run the backend:

```powershell
cd ..
python backend/main.py --dev
```

## Build Windows EXE

```powershell
python build.py
```

Build output is created in `dist/`. Do not commit `dist/`.

## Android

The Android app is in `android/`. It is native Kotlin/Compose and uses Chaquopy
to bundle Python modules inside the APK.

Android is still under active development. The current native UI focuses on the
main file workflow first, while more parity screens are being added.

Before building from a fresh clone:

```powershell
cd android
.\tools\vendor-python-deps.ps1
```

Then open `android/` in Android Studio and build the app.

If Android Studio does not find your SDK, copy:

```text
android/local.properties.example
```

to:

```text
android/local.properties
```

and set your own SDK path. Never commit `local.properties`.

## Project Structure

```text
TeleVault/
  backend/                  Python FastAPI, Telethon, crypto, vault logic
  frontend/                 React + TypeScript app
  android/                  Native Android app
  android/app/src/main/python/
                            Android Python core and command bridge
  build.py                  Windows packaging script
  requirements.txt          Desktop Python dependencies
  DOCUMENTATION.md          Architecture, build, security, release notes
  API.md                    Local backend/API endpoint reference
```

## Credits

TeleVault is built and maintained by Liethueis-Foundation.

## Documentation

- `DOCUMENTATION.md` - architecture, security model, build flow, release notes
- `API.md` - local backend endpoint documentation
- `SECURITY.md` - sensitive files and safety guidance

## License

See `LICENSE`.
