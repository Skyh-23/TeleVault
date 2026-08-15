# TeleVault Quick Start

This guide gets a development copy of TeleVault running as quickly as possible.

## 1. Clone

```bash
git clone https://github.com/Skyh-23/TeleVault.git
cd TeleVault
```

## 2. Check Requirements

```bash
python --version
node --version
```

Recommended:

```text
Python 3.10+
Node.js 18+
```

## 3. Install Backend Dependencies

```bash
pip install -r requirements.txt
```

## 4. Install Frontend Dependencies

```bash
cd frontend
npm install
```

## 5. Start the Frontend

```bash
npm run dev
```

Keep this terminal open.

## 6. Start the Backend

Open another terminal at the repository root:

```bash
python backend/main.py --dev
```

The local API normally runs at:

```text
http://127.0.0.1:8765
```

## 7. Telegram Credentials

TeleVault requires a Telegram API ID and API hash for Telegram connectivity.

Keep these credentials private and never commit them to Git.

## 8. First Run

On first use, TeleVault creates the local vault encryption material.

Before uploading important data:

1. Verify that encryption/decryption works.
2. Export a recovery backup.
3. Store the recovery backup somewhere safe.
4. Test recovery before relying on the vault.

## 9. Build Windows EXE

From the repository root:

```bash
python build.py
```

Output:

```text
dist/TeleVault.exe
```

## 10. Android

```powershell
cd android
.\tools\vendor-python-deps.ps1
```

Then open `android/` in Android Studio.

The Android application is under active development and may not have complete desktop feature parity.

## Important Security Notes

Never commit:

```text
vault.key
*.session
api_id.txt
api_hash.txt
metadata.db
backend/data/
android/local.properties
```

Do not expose the local FastAPI server directly to the public internet.

## Next Steps

- [Build Instructions](BUILD_INSTRUCTIONS.md)
- [Technical Documentation](DOCUMENTATION.md)
- [API Reference](API.md)
- [Security Policy](SECURITY.md)
- [Troubleshooting](TROUBLESHOOTING.md)
