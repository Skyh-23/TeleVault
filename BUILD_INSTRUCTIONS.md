# Building TeleVault Executable

## Prerequisites

### 1. Install Python 3.8+
Download from https://www.python.org/downloads/

### 2. Install Node.js 18+
Download from https://nodejs.org/

### 3. Install Dependencies

```bash
# Python dependencies
pip install -r requirements.txt

# Frontend dependencies
cd frontend
npm install
cd ..
```

---

## Method 1: Automated Build (Recommended)

```bash
# Full build (frontend + backend)
python build.py

# Output: dist/TeleVault.exe
```

**Build time**: ~3-5 minutes

---

## Method 2: Manual Build

### Step 1: Build Frontend

```bash
cd frontend
npm run build
cd ..
```

**Output**: `frontend/dist/` (static files)

### Step 2: Build Backend with PyInstaller

```bash
cd backend

# Create spec file (or use existing TeleVault.spec)
pyinstaller --name=TeleVault ^
    --onefile ^
    --windowed ^
    --add-data="../frontend/dist;frontend/dist" ^
    --hidden-import=telethon ^
    --hidden-import=cryptography ^
    --hidden-import=uvicorn ^
    --hidden-import=fastapi ^
    --hidden-import=argon2 ^
    --optimize=2 ^
    --upx-dir="C:\upx" ^
    main.py

cd ..
```

**Output**: `backend/dist/TeleVault.exe`

---

## Method 3: Development Build (No Frontend)

For testing backend changes without rebuilding frontend:

```bash
python build.py --dev
```

---

## Optimizations

### 1. UPX Compression (Optional)

Reduces executable size by ~40%

```bash
# Download UPX from https://upx.github.io/
# Extract to C:\upx\

# PyInstaller will auto-detect UPX
```

### 2. Exclude Unnecessary Packages

Edit `backend/TeleVault.spec`:

```python
excludes=[
    'matplotlib',
    'numpy',
    'pandas',
    'scipy',
    'IPython',
    'jupyter',
    'PIL',
    'tkinter',
]
```

### 3. Strip Debug Symbols

```python
strip=True,  # in TeleVault.spec
```

---

## Troubleshooting

### Issue: "Module not found" error

**Solution**: Add to `hiddenimports` in spec file

```python
hiddenimports=[
    'telethon.tl.types',
    'cryptography.hazmat.backends',
    'uvicorn.logging',
    # Add missing module here
]
```

### Issue: Frontend not loading

**Solution**: Verify frontend/dist exists

```bash
dir frontend\dist
# Should show index.html and assets/
```

### Issue: Large executable size (>100MB)

**Solutions**:
1. Enable UPX compression
2. Add excludes in spec file
3. Use virtual environment to avoid bundling unused packages

```bash
# Create clean venv
python -m venv venv
.\venv\Scripts\activate
pip install -r requirements.txt
python build.py
```

### Issue: Antivirus blocking executable

**Solution**: 
- PyInstaller executables may trigger false positives
- Add exclusion in Windows Defender
- Or sign executable with code signing certificate

---

## Testing the Executable

```bash
# Navigate to output
cd dist

# Run
.\TeleVault.exe

# Test features:
# 1. Authentication
# 2. File upload
# 3. File download
# 4. Folder creation
```

---

## Distribution

### Create Release Package

```bash
# Create zip for distribution
powershell Compress-Archive -Path dist\* -DestinationPath TeleVault-v1.0.0-Windows.zip
```

### Create Installer (Optional)

Use **Inno Setup** or **NSIS**:

```iss
[Setup]
AppName=TeleVault
AppVersion=1.0.0
DefaultDirName={pf}\TeleVault
DefaultGroupName=TeleVault
OutputBaseFilename=TeleVault-Setup
Compression=lzma
SolidCompression=yes

[Files]
Source: "dist\TeleVault.exe"; DestDir: "{app}"
Source: "dist\README.txt"; DestDir: "{app}"

[Icons]
Name: "{group}\TeleVault"; Filename: "{app}\TeleVault.exe"
```

---

## Build Sizes

**Expected sizes**:
- Uncompressed: ~80-120 MB
- With UPX: ~50-70 MB
- Installed: ~100-150 MB (with cache)

**Largest components**:
- Python runtime: ~30 MB
- Telethon + dependencies: ~20 MB
- Cryptography libraries: ~15 MB
- Frontend assets: ~5 MB

---

## CI/CD with GitHub Actions

Create `.github/workflows/build.yml`:

```yaml
name: Build

on:
  push:
    tags:
      - 'v*'

jobs:
  build-windows:
    runs-on: windows-latest
    steps:
      - uses: actions/checkout@v3
      
      - name: Setup Python
        uses: actions/setup-python@v4
        with:
          python-version: '3.11'
      
      - name: Setup Node
        uses: actions/setup-node@v3
        with:
          node-version: '18'
      
      - name: Build
        run: |
          pip install -r requirements.txt
          python build.py
      
      - name: Upload artifact
        uses: actions/upload-artifact@v3
        with:
          name: TeleVault-Windows
          path: dist/TeleVault.exe
```

---

## Build Checklist

Before releasing:

- [ ] Version number updated in `frontend/package.json`
- [ ] Frontend builds without errors
- [ ] Backend builds without errors
- [ ] Executable runs on clean Windows machine
- [ ] Authentication works
- [ ] File operations work
- [ ] No console window appears
- [ ] Icon displays correctly
- [ ] File size is reasonable (<100MB)

---

## Support

For build issues, check:
- PyInstaller docs: https://pyinstaller.org/
- GitHub Issues: https://github.com/YOUR_USERNAME/TeleVault/issues
