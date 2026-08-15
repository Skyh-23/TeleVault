# Building TeleVault

This document covers development and Windows executable builds.

## Prerequisites

### Desktop

- Python 3.10+
- Node.js 18+
- Git
- Telegram API ID and API hash

### Android

- Android Studio
- Android SDK
- Python 3.12 for the Chaquopy dependency-packaging workflow

## 1. Install Dependencies

From the repository root:

```bash
pip install -r requirements.txt
```

Install frontend dependencies:

```bash
cd frontend
npm install
cd ..
```

## 2. Development Build

Build the frontend:

```bash
cd frontend
npm run build
cd ..
```

Run the backend in development mode:

```bash
python backend/main.py --dev
```

## 3. Windows Executable

The recommended build command is:

```bash
python build.py
```

The packaged application is generated under:

```text
dist/
```

Do not commit build artifacts.

## 4. Development Packaging

For backend-focused development, where the frontend build is intentionally skipped:

```bash
python build.py --dev
```

Use this only when the current development workflow supports the expected output.

## 5. Manual Frontend Build

```bash
cd frontend
npm run build
```

The generated static files are placed in:

```text
frontend/dist/
```

## 6. PyInstaller

The project uses PyInstaller for Windows packaging. If a module is missing from a packaged build, inspect `build.py` and add the required hidden import or package data according to the actual dependency.

Avoid copying old PyInstaller commands from previous project versions without checking the current `build.py`.

## 7. UPX

UPX compression is optional. If you use it, verify the packaged executable carefully after compression.

Do not assume a fixed executable-size reduction; the result depends on the current dependency set and build configuration.

## 8. Android

From the repository root:

```powershell
cd android
.\tools\vendor-python-deps.ps1
```

Then open `android/` in Android Studio and build the application.

If the Android SDK path is not detected, create:

```text
android/local.properties
```

from:

```text
android/local.properties.example
```

Never commit `local.properties`.

## Build Hygiene

Before committing:

```bash
git status
```

Make sure the repository does not contain:

```text
vault.key
*.session
api_id.txt
api_hash.txt
metadata.db
backend/data/
node_modules/
dist/
build/
android/local.properties
```

## Troubleshooting

If the packaged application reports a missing Python module:

1. Confirm the dependency is installed in the build environment.
2. Check whether PyInstaller needs a hidden import.
3. Rebuild from a clean environment.
4. Check the traceback before adding exclusions or hidden imports.

For runtime and authentication issues, see [TROUBLESHOOTING.md](TROUBLESHOOTING.md).
