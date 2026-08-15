<div align="center">

<img src="Preview-image.png" width="225" alt="Project Logo">

</div>
<div align="center">

# TeleVault

> Private, client-side encrypted cloud storage powered by your Telegram account.

TeleVault is a personal cloud-storage application that uses Telegram as the remote storage layer while performing file encryption locally.

Files are split into blocks, encrypted before upload, stored through Telegram, and reconstructed after local decryption. The project includes a desktop/web application and a native Android application under active development.

> **Important:** TeleVault is independent software and is not affiliated with, endorsed by, or officially connected to Telegram.

## Features

- Client-side AES-256-GCM encryption
- Argon2id-based key derivation
- Encrypted file blocks
- Encrypted vault manifest
- Telegram Saved Messages storage
- Private Telegram channel-backed folders
- Upload and download resume support
- File search and folder management
- Media thumbnails and streaming
- Vault export/import and password-protected recovery
- Local share management
- Storage and bandwidth statistics
- React + TypeScript desktop/web interface
- FastAPI + Python backend
- Native Kotlin + Jetpack Compose Android app
- Chaquopy-based Python core on Android
- Windows executable packaging with PyInstaller

## How It Works

```text
                     TELEVAULT

                    Local Device
                         │
                         ▼
                 Select / Read File
                         │
                         ▼
                 Split into Blocks
                         │
                         ▼
                 AES-256-GCM Encrypt
                         │
                         ▼
              Encrypted Blocks + Manifest
                         │
                         ▼
                    Telegram
                         │
                         ▼
                 Remote Storage
```

During download, the process is reversed:

```text
Telegram
   │
   ▼
Encrypted Manifest
   │
   ▼
Encrypted Blocks
   │
   ▼
Local Decryption
   │
   ▼
Integrity Verification
   │
   ▼
Original File
```

The primary design goal is that file contents are encrypted locally before being uploaded.

## Security

TeleVault currently uses:

- **AES-256-GCM** for authenticated encryption
- **Argon2id** for password-based key derivation
- Per-file encryption metadata
- Block-level encryption
- Block index information as authenticated data
- Encrypted vault recovery data

TeleVault has not undergone an independent professional security audit. Cryptographic primitives being used correctly does not by itself guarantee that the complete application is secure.

Do not commit or share:

```text
vault.key
*.session
api_id.txt
api_hash.txt
metadata.db
backend/data/
android/local.properties
```

If the vault key is lost and no valid recovery backup exists, encrypted data may be unrecoverable.

## Applications

| Target | Location | Status |
|---|---|---|
| Desktop/Web | `backend/` + `frontend/` | Main application |
| Windows | `build.py` | PyInstaller packaging |
| Android | `android/` | Native app, active development |

The Android application is not a WebView wrapper. It uses Kotlin/Jetpack Compose for the UI and bundles the Python core through Chaquopy.

## Technology Stack

| Area | Technology |
|---|---|
| Frontend | React + TypeScript |
| Backend | Python |
| API | FastAPI |
| ASGI server | Uvicorn |
| Telegram | Telethon |
| Encryption | AES-256-GCM |
| KDF | Argon2id |
| Desktop shell | PyWebView |
| Windows packaging | PyInstaller |
| Android UI | Kotlin + Jetpack Compose |
| Android Python runtime | Chaquopy |

## Requirements

### Desktop

- Python 3.10+
- Node.js 18+
- Telegram API ID
- Telegram API hash

Telegram API credentials can be obtained from Telegram's official developer portal.

### Android

- Android Studio
- Android SDK
- Python 3.12 for the Chaquopy dependency-packaging workflow

## Quick Start

Clone the repository:

```bash
git clone https://github.com/Skyh-23/TeleVault.git
cd TeleVault
```

Install Python dependencies:

```bash
pip install -r requirements.txt
```

Install frontend dependencies:

```bash
cd frontend
npm install
```

Run the frontend:

```bash
npm run dev
```

In another terminal:

```bash
cd ..
python backend/main.py --dev
```

The local backend normally listens on:

```text
http://127.0.0.1:8765
```

The API is intended for local use. Do not expose it directly to the public internet without implementing an appropriate security boundary.

## Windows Build

From the repository root:

```bash
python build.py
```

The packaged application is produced under:

```text
dist/
```

For detailed build instructions, see [BUILD_INSTRUCTIONS.md](BUILD_INSTRUCTIONS.md).

## Android Build

```powershell
cd android
.\tools\vendor-python-deps.ps1
```

Then open `android/` in Android Studio.

If required, create `android/local.properties` from `android/local.properties.example` and configure your local Android SDK path.

Never commit `local.properties`.

## Documentation

- [Quick Start](QUICK_START.md)
- [Build Instructions](BUILD_INSTRUCTIONS.md)
- [Architecture & Technical Documentation](DOCUMENTATION.md)
- [API Reference](API.md)
- [Security Policy](SECURITY.md)
- [Troubleshooting](TROUBLESHOOTING.md)
- [GitHub/Maintainer Setup](GITHUB_SETUP.md)
- [Crypto Engineering Notes](solution_for_speed.md)

## Project Structure

```text
TeleVault/
├── backend/                         Python backend, API, Telegram, vault and crypto logic
├── frontend/                        React + TypeScript application
├── android/                         Native Android application
├── build.py                         Windows packaging/build script
├── requirements.txt                 Desktop Python dependencies
├── API.md                            Local API reference
├── BUILD_INSTRUCTIONS.md             Build documentation
├── DOCUMENTATION.md                  Technical documentation
├── GITHUB_SETUP.md                   Repository security/maintenance guide
├── QUICK_START.md                    Quick setup guide
├── SECURITY.md                       Security guidance
├── TROUBLESHOOTING.md                Troubleshooting guide
├── solution_for_speed.md             Crypto/performance engineering notes
├── LICENSE                            Project license
└── README.md                          Project overview
```

## Project Status

TeleVault is under active development.

The desktop application is currently the primary implementation. Android is being developed toward broader feature parity.

Features, APIs, storage formats, and internal architecture may change between development versions.

Do not use an unreleased development build as the only copy of important or irreplaceable data.

## Contributing

Issues, suggestions, testing, and pull requests are welcome.

When contributing:

1. Keep changes focused.
2. Do not commit credentials, Telegram sessions, vault keys, or private data.
3. Test affected functionality before submitting a pull request.
4. Update documentation when behavior or APIs change.
5. Keep security-sensitive changes clearly documented.

## License

TeleVault is licensed under the MIT License. See [LICENSE](LICENSE).

## Disclaimer

TeleVault is an independent third-party application. Telegram and related trademarks belong to their respective owners.

The software is provided without warranty. The project author is not responsible for account restrictions, service changes, lost credentials, lost encryption keys, data corruption, data loss, or other consequences resulting from use of the software.

Use TeleVault responsibly and comply with the terms and applicable laws governing the services you use.
