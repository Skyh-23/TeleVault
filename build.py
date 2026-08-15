"""
TeleVault Build Script
======================
Builds Windows executable with PyInstaller

Usage:
    python build.py          # Build with frontend
    python build.py --dev    # Build dev version (no frontend)

Requirements:
    pip install pyinstaller
"""

import os
import sys
import shutil
import subprocess

BACKEND_DIR = os.path.join(os.path.dirname(__file__), "backend")
FRONTEND_DIR = os.path.join(os.path.dirname(__file__), "frontend")
DIST_DIR = os.path.join(os.path.dirname(__file__), "dist")


def build_frontend():
    """Build frontend with Vite"""
    print("\n[1/3] Building frontend...")
    
    if not os.path.exists(FRONTEND_DIR):
        print("[ERROR] Frontend directory not found")
        return False
    
    os.chdir(FRONTEND_DIR)
    
    # Install dependencies
    print("  -> Installing dependencies...")
    result = subprocess.run(["npm", "install"], shell=True, capture_output=True)
    if result.returncode != 0:
        print(f"[ERROR] npm install failed: {result.stderr.decode()}")
        return False
    
    # Build
    print("  -> Building with Vite...")
    result = subprocess.run(["npm", "run", "build"], shell=True, capture_output=True)
    if result.returncode != 0:
        print(f"[ERROR] Build failed: {result.stderr.decode()}")
        return False
    
    print("[OK] Frontend built successfully")
    return True


def build_backend():
    """Build backend with PyInstaller"""
    print("\n[2/3] Building backend...")
    
    os.chdir(BACKEND_DIR)
    
    # Create PyInstaller spec
    spec_content = """# -*- mode: python ; coding: utf-8 -*-

import os
import sys
from PyInstaller.utils.hooks import collect_data_files, collect_submodules

# Collect telethon data
telethon_datas = collect_data_files('telethon')

a = Analysis(
    ['main.py'],
    pathex=[],
    binaries=[],
    datas=[
        ('../frontend/dist', 'frontend/dist'),
        *telethon_datas,
    ],
    hiddenimports=[
        'telethon',
        'telethon.tl',
        'telethon.tl.types',
        'telethon.tl.functions',
        'telethon.crypto',
        'cryptography',
        'cryptography.hazmat',
        'cryptography.hazmat.primitives',
        'cryptography.hazmat.primitives.ciphers',
        'cryptography.hazmat.primitives.ciphers.aead',
        'argon2',
        'argon2.low_level',
        'uvicorn',
        'uvicorn.logging',
        'uvicorn.loops',
        'uvicorn.loops.auto',
        'uvicorn.protocols',
        'uvicorn.protocols.http',
        'uvicorn.protocols.http.auto',
        'uvicorn.lifespan',
        'uvicorn.lifespan.on',
        'fastapi',
        'starlette',
        'pydantic',
        'webview',
        'webview.platforms',
        'webview.platforms.edgechromium',
        'tkinter',
    ],
    hookspath=[],
    hooksconfig={},
    runtime_hooks=[],
    excludes=[
        'matplotlib',
        'numpy',
        'pandas',
        'scipy',
        'IPython',
        'jupyter',
    ],
    noarchive=False,
    optimize=2,
)

pyz = PYZ(a.pure)

exe = EXE(
    pyz,
    a.scripts,
    a.binaries,
    a.datas,
    [],
    name='TeleVault',
    debug=False,
    bootloader_ignore_signals=False,
    strip=False,
    upx=True,
    upx_exclude=[],
    runtime_tmpdir=None,
    console=False,
    disable_windowed_traceback=False,
    argv_emulation=False,
    target_arch=None,
    codesign_identity=None,
    entitlements_file=None,
    icon='../frontend/public/logo.ico' if os.path.exists('../frontend/public/logo.ico') else None,
)
"""
    
    with open("TeleVault.spec", "w") as f:
        f.write(spec_content)
    
    print("  -> Running PyInstaller...")
    result = subprocess.run([
        sys.executable, "-m", "PyInstaller",
        "--clean",
        "--noconfirm",
        "TeleVault.spec"
    ], shell=True)
    
    if result.returncode != 0:
        print("[ERROR] PyInstaller failed")
        return False
    
    print("[OK] Backend built successfully")
    return True


def create_dist():
    """Create distribution folder"""
    print("\n[3/3] Creating distribution...")
    
    # Clean dist
    if os.path.exists(DIST_DIR):
        shutil.rmtree(DIST_DIR)
    os.makedirs(DIST_DIR)
    
    # Copy executable
    exe_path = os.path.join(BACKEND_DIR, "dist", "TeleVault.exe")
    if os.path.exists(exe_path):
        shutil.copy2(exe_path, os.path.join(DIST_DIR, "TeleVault.exe"))
        print(f"[OK] Created: {DIST_DIR}/TeleVault.exe")
    else:
        print("[ERROR] Executable not found")
        return False

    # Keep a copy of the icon beside the executable for installers/shortcuts.
    icon_path = os.path.join(FRONTEND_DIR, "public", "logo.ico")
    if os.path.exists(icon_path):
        shutil.copy2(icon_path, os.path.join(DIST_DIR, "TeleVault.ico"))
    
    # Create README
    readme_content = """# TeleVault - Encrypted Cloud Storage

## Installation
1. Double-click TeleVault.exe to launch
2. Get Telegram API credentials from https://my.telegram.org
3. Sign in with your phone number

## Features
- Unlimited encrypted cloud storage via Telegram
- AES-256-GCM encryption
- Resume support for large files
- Media streaming
- Dark/Light theme

## Data Location
- Session & vault key: %APPDATA%/TeleVault/data/
- Cache: %APPDATA%/TeleVault/data/cache/

## Support
GitHub: https://github.com/YOUR_USERNAME/TeleVault
"""
    
    with open(os.path.join(DIST_DIR, "README.txt"), "w") as f:
        f.write(readme_content)
    
    print(f"[OK] Distribution ready in: {DIST_DIR}")
    return True


def main():
    print("=" * 60)
    print("  TeleVault - Build Script")
    print("  Liethueis Foundation (c) 2026")
    print("=" * 60)
    
    # Check PyInstaller
    try:
        import PyInstaller
    except ImportError:
        print("[ERROR] PyInstaller not found. Install it:")
        print("   pip install pyinstaller")
        return 1
    
    # Build frontend (skip if --dev flag)
    if "--dev" not in sys.argv:
        if not build_frontend():
            print("\n[ERROR] Build failed at frontend stage")
            return 1
    else:
        print("\n[WARN] Skipping frontend build (--dev mode)")
    
    # Build backend
    if not build_backend():
        print("\n[ERROR] Build failed at backend stage")
        return 1
    
    # Create distribution
    if not create_dist():
        print("\n[ERROR] Build failed at distribution stage")
        return 1
    
    print("\n" + "=" * 60)
    print("  [OK] Build Complete!")
    print("  Output: dist/TeleVault.exe")
    print("=" * 60)
    return 0


if __name__ == "__main__":
    sys.exit(main())
