# TeleVault Troubleshooting

This guide covers common development, build, authentication, transfer, and runtime issues.

## Build Problems

### `PyInstaller` not found

Install the Python dependencies:

```bash
pip install -r requirements.txt
```

Or install PyInstaller directly:

```bash
pip install pyinstaller
```

### Frontend build fails

Check Node:

```bash
node --version
```

TeleVault expects Node.js 18+.

Reinstall frontend dependencies:

```powershell
cd frontend
rmdir /s /q node_modules
npm install
```

Then retry:

```bash
npm run build
```

### Backend module missing

If Python reports a missing module:

```text
ModuleNotFoundError: No module named '...'
```

Make sure the correct environment is active and run:

```bash
pip install -r requirements.txt
```

### Packaged EXE reports a missing module

PyInstaller may need an additional hidden import or package-data rule.

Check the current `build.py` before changing packaging configuration.

Build again from a clean environment after making the change.

## Frontend Problems

### Blank page

Check that the frontend development server is running.

For a packaged build, verify that the frontend was built successfully before packaging.

### API connection failed

Confirm the backend is running:

```bash
python backend/main.py --dev
```

The default local API is:

```text
http://127.0.0.1:8765
```

Check the browser developer console for the exact failing request.

## Authentication Problems

### Telegram login code not received

Check:

- Phone number format
- Telegram account availability
- Network connectivity
- Whether Telegram sent the code to another active session

### Two-step verification required

If the account uses Telegram two-step verification, complete the password step when requested.

### Session problems

If a saved session becomes invalid:

1. Log out through TeleVault if possible.
2. Remove the affected local session only if necessary.
3. Authenticate again.
4. Never upload the session file to GitHub.

## Upload Problems

### Upload stops or appears stuck

Check:

- Network connectivity
- Telegram availability
- Available local disk space
- Transfer progress events
- Application logs

For resumable transfers, retry using the application's resume functionality when available.

### Large file problems

Large transfers depend on local disk performance, network stability, Telegram behavior, and available resources.

Do not assume that a stalled transfer means the encrypted data is corrupted.

## Download Problems

### File fails integrity verification

Possible causes include:

- Incomplete block download
- Corrupted local cache
- Missing block
- Wrong vault key
- Incompatible manifest/version
- External storage changes

Retry the download and inspect the backend logs.

### Decryption fails

Verify that:

- The correct vault is being used.
- The vault key has not changed.
- The recovery backup was imported correctly.
- The file belongs to the same vault.

Do not delete recovery data while investigating.

## Media Problems

### Thumbnail does not appear

Check whether the file type is supported and whether thumbnail generation succeeded.

### Streaming fails

Check:

- File availability
- Telegram connectivity
- Decryption status
- Local cache
- Backend logs

## Android Problems

### Android build fails

Open `android/` in Android Studio and verify the Android SDK configuration.

Before building from a fresh clone:

```powershell
cd android
.\tools\vendor-python-deps.ps1
```

### SDK path not found

Create:

```text
android/local.properties
```

from:

```text
android/local.properties.example
```

Never commit `local.properties`.

### Android feature missing

Android is still under active development and does not necessarily have complete feature parity with the desktop application.

## Recovery Problems

### Vault key is missing

Use a valid encrypted recovery backup if one exists.

If both the vault key and all valid recovery backups are lost, encrypted files may not be recoverable.

## Security Problems

If you accidentally committed a secret:

1. Stop sharing the affected repository revision.
2. Rotate or revoke the exposed credential.
3. Remove the secret from Git history.
4. Check other commits and branches for copies.
5. Treat the old credential as compromised.

See [SECURITY.md](SECURITY.md).

## Getting Help

When reporting a problem, include:

- Operating system
- Python version
- Node.js version
- Android Studio/Gradle version when relevant
- Exact error message
- Steps to reproduce
- Whether the issue occurs in development or a packaged build

Never include:

- Telegram session files
- API hashes
- Vault keys
- Recovery passwords
- Private account information
