# 🚀 TeleVault - Quick Start Guide

This guide will get you from zero to a working `.exe` and safely pushed to GitHub in under 30 minutes.

---

## Part 1: Build the Executable (5 minutes)

### Step 1: Verify Prerequisites

```cmd
python --version
REM Should show: Python 3.8 or higher

node --version
REM Should show: Node 18 or higher
```

If either is missing, install from:
- Python: https://www.python.org/downloads/
- Node.js: https://nodejs.org/

### Step 2: Run the Build

```cmd
cd <project-folder>

REM This will install dependencies and build everything
python build.py
```

**What happens**:
1. Installs Node dependencies (~2 min)
2. Builds React frontend (~1 min)
3. Packages with PyInstaller (~2 min)

**Output**: `<project-folder>\dist\TeleVault.exe`

### Step 3: Test the Executable

```cmd
cd dist
TeleVault.exe
```

**Expected behavior**:
- Window opens with TeleVault UI
- You see the authentication screen
- No console window appears

If it works, you're ready for Part 2!

**⚠️ Troubleshooting**:

| Issue | Solution |
|-------|----------|
| "Module not found" error | Run `pip install -r requirements.txt` |
| Frontend not loading | Delete `frontend\dist` and run `python build.py` again |
| Antivirus blocking | Add exclusion for TeleVault.exe in Windows Defender |
| Large file size (>100MB) | Normal - includes Python runtime + dependencies |

---

## Part 2: Push Safely to GitHub (10 minutes)

### Step 1: Security Check (CRITICAL!)

```cmd
cd <project-folder>

REM Check what files will be committed
git status
```

**❌ STOP if you see ANY of these:**
- `backend/data/` folder
- `*.session` files
- `vault.key`
- `api_hash.txt`
- `metadata.db`
- `test_5mb.bin`

If you see these files, your `.gitignore` is not working. Contact support before proceeding.

**✅ Good to proceed if you see:**
- `backend/*.py` (Python source files)
- `frontend/src/` (React source files)
- `*.md` documentation files
- Configuration files

### Step 2: Clean Build Artifacts

```cmd
REM Remove PyInstaller build files (they're huge and not needed in git)
git rm -r --cached backend/dist/ 2>nul
git rm -r --cached backend/build/ 2>nul
git rm -r --cached frontend/dist/ 2>nul
git rm -r --cached dist/ 2>nul
git rm -r --cached graphify-out/ 2>nul
git rm --cached backend/main.spec 2>nul

REM Commit the cleanup
git add .gitignore
git commit -m "chore: remove build artifacts from git"
```

### Step 3: Verify No Secrets

```cmd
REM Search for potential secrets in tracked files
git ls-files | findstr /v node_modules | xargs grep -l "YOUR_API_ID" 2>nul
REM Should show: backend/debug_list_messages.py backend/download_song.py backend/upload_song.py
REM (These are test scripts - OK to commit)

git ls-files | xargs grep -l "vault.key" 2>nul
REM Should show: NOTHING or only documentation files

git ls-files | xargs grep -l "api_hash.txt" 2>nul
REM Should show: NOTHING or only documentation files
```

**If you found secrets**: Follow the emergency removal procedure in `GITHUB_SETUP.md`

### Step 4: Create GitHub Repository

**Option A: GitHub CLI (recommended)**

```cmd
REM Install GitHub CLI from: https://cli.github.com/
gh auth login

REM Create repository
gh repo create TeleVault --public --source=. --remote=origin --description "Encrypted unlimited cloud storage powered by Telegram"
```

**Option B: Manual**

1. Go to https://github.com/new
2. Repository name: `TeleVault`
3. Description: `Encrypted unlimited cloud storage powered by Telegram`
4. **Public** (or Private if you prefer)
5. **DO NOT** check "Initialize with README" (we already have one)
6. Click "Create repository"

### Step 5: Push to GitHub

```cmd
REM Add remote (skip if you used GitHub CLI)
git remote add origin https://github.com/YOUR_USERNAME/TeleVault.git

REM Push everything
git branch -M main
git push -u origin main
```

### Step 6: Verify on GitHub

1. Go to your repository on GitHub
2. **Check that these files are NOT visible:**
   - ❌ `backend/data/` folder
   - ❌ Any `.session` files
   - ❌ `vault.key`
   - ❌ `api_hash.txt`
   - ❌ `metadata.db`
3. **Check that these files ARE visible:**
   - ✅ `README.md`
   - ✅ `LICENSE`
   - ✅ `SECURITY.md`
   - ✅ `backend/*.py` source files
   - ✅ `frontend/src/` folder

**✅ SUCCESS!** Your repository is safe and public.

---

## Part 3: Release the Executable (5 minutes)

### Step 1: Create a Release

**Option A: GitHub CLI**

```cmd
REM Tag the current version
git tag v1.0.0
git push origin v1.0.0

REM Create release with executable
gh release create v1.0.0 dist\TeleVault.exe --title "TeleVault v1.0.0" --notes "Initial release with AES-256-GCM encryption and unlimited storage"
```

**Option B: Manual**

1. Go to your repository on GitHub
2. Click "Releases" → "Create a new release"
3. Tag: `v1.0.0`
4. Title: `TeleVault v1.0.0`
5. Description:
   ```
   ## 🎉 Initial Release
   
   TeleVault v1.0.0 brings encrypted unlimited cloud storage to Windows.
   
   ### Features
   - AES-256-GCM encryption
   - Unlimited storage via Telegram
   - Resume support for large files
   - Media streaming
   - Dark/Light theme
   
   ### Installation
   1. Download `TeleVault.exe`
   2. Run and sign in with Telegram
   3. Start uploading encrypted files
   
   ### Requirements
   - Windows 10/11
   - Telegram account
   ```
6. Drag `dist\TeleVault.exe` into the upload area
7. Click "Publish release"

### Step 2: Update README with Release Link

```cmd
REM Edit README.md and replace YOUR_USERNAME with your actual GitHub username
notepad README.md

REM Commit and push
git add README.md
git commit -m "docs: update release link"
git push
```

---

## Next Steps

### 🎨 Optional: Add Icon

1. Create `frontend/public/logo.ico` (256x256 icon)
2. Rebuild: `python build.py`
3. The executable will now have your icon

### 📦 Optional: Create Installer

Use **Inno Setup** to create a professional installer:

1. Download: https://jrsoftware.org/isdl.php
2. See `BUILD_INSTRUCTIONS.md` for Inno Setup script
3. Build installer
4. Upload to GitHub Releases

### 🤖 Optional: GitHub Actions CI/CD

Create `.github/workflows/build.yml`:

```yaml
name: Build and Release

on:
  push:
    tags:
      - 'v*'

jobs:
  build:
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
        run: python build.py
      
      - name: Create Release
        uses: softprops/action-gh-release@v1
        with:
          files: dist/TeleVault.exe
```

Now every git tag push will automatically build and release!

---

## 🆘 Help & Support

### Common Issues

**Build fails with "PyInstaller not found"**
```cmd
pip install pyinstaller
```

**Git won't push (large files)**
```cmd
REM Remove large files from git
git rm --cached large_file.bin
git commit --amend --no-edit
git push --force-with-lease
```

**Accidentally pushed secrets**
1. Change credentials immediately at https://my.telegram.org
2. Follow emergency removal in `GITHUB_SETUP.md`
3. Force push clean history

### Get Help

- **Issues**: https://github.com/YOUR_USERNAME/TeleVault/issues
- **Discussions**: https://github.com/YOUR_USERNAME/TeleVault/discussions
- **Email**: your-email@example.com

---

## ✅ Final Checklist

Before releasing to public:

- [ ] Executable builds and runs
- [ ] No secrets in git repository
- [ ] README.md updated with correct GitHub username
- [ ] LICENSE file included
- [ ] SECURITY.md included
- [ ] GitHub release created
- [ ] Tested on clean Windows machine
- [ ] Added repository topics on GitHub (encryption, telegram, cloud-storage, python, react)

---

**Congratulations! 🎉 You've successfully built and released TeleVault!**

*Liethueis Foundation © 2026*
