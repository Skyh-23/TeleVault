# GitHub Setup Guide

## Step-by-Step Guide to Safely Push TeleVault to GitHub

### 1. Pre-Push Security Checklist

**CRITICAL: Run these checks BEFORE first push:**

```bash
# Navigate to project root
cd <project-folder>

# Verify .gitignore is working
git status

# Check for secrets in tracked files
git ls-files | xargs grep -l "api_id" || echo "No matches"
git ls-files | xargs grep -l "phone" || echo "No matches"
git ls-files | xargs grep -l "vault.key" || echo "No matches"
```

**Expected results:**
- `git status` should NOT show:
  - `backend/data/`
  - `*.session` files
  - `vault.key`
  - `api_hash.txt`
  - `metadata.db`
  - `test_5mb.bin`
  - `node_modules/`
  - `dist/` folders

---

### 2. Clean Your Repository

```bash
# Remove any accidentally tracked sensitive files
git rm -r --cached backend/data/ 2>/dev/null || true
git rm --cached backend/*.session 2>/dev/null || true
git rm --cached backend/data/vault.key 2>/dev/null || true
git rm --cached test_5mb.bin 2>/dev/null || true
git rm --cached backend/main.spec 2>/dev/null || true

# Remove build artifacts
git rm -r --cached backend/dist/ 2>/dev/null || true
git rm -r --cached backend/build/ 2>/dev/null || true
git rm -r --cached frontend/dist/ 2>/dev/null || true
git rm -r --cached node_modules/ 2>/dev/null || true
git rm -r --cached graphify-out/ 2>/dev/null || true
git rm -r --cached dist/ 2>/dev/null || true

# Commit the cleanup
git commit -m "chore: remove sensitive files and build artifacts"
```

---

### 3. Create README.md for GitHub

Your current README should be updated for public viewing:

```markdown
# 🔐 TeleVault - Encrypted Unlimited Cloud Storage

Transform Telegram into your private, encrypted cloud storage with unlimited capacity.

[![License: MIT](https://img.shields.io/badge/License-MIT-blue.svg)](LICENSE)
[![Python 3.8+](https://img.shields.io/badge/python-3.8+-blue.svg)](https://www.python.org/downloads/)
[![React](https://img.shields.io/badge/react-19.1-blue.svg)](https://reactjs.org/)

## ✨ Features

- 🔒 **AES-256-GCM Encryption** - Military-grade security
- ♾️ **Unlimited Storage** - Leverage Telegram's infrastructure
- 📁 **Folder Management** - Organize with private channels
- ⚡ **Resume Support** - Auto-resume interrupted transfers
- 🎬 **Media Streaming** - Stream videos directly from cloud
- 🌙 **Dark/Light Theme** - Beautiful modern UI
- 🔍 **Global Search** - Find files instantly
- 📤 **Secure Sharing** - Share files with expiry & passwords

## 🚀 Quick Start

### Prerequisites
- Windows 10/11
- Telegram account
- API credentials from https://my.telegram.org

### Installation

**Option 1: Download Executable (Easiest)**
1. Download `TeleVault.exe` from [Releases](https://github.com/YOUR_USERNAME/TeleVault/releases)
2. Run the executable
3. Sign in with Telegram

**Option 2: Build from Source**

```bash
# Clone repository
git clone https://github.com/YOUR_USERNAME/TeleVault.git
cd TeleVault

# Install Python dependencies
pip install -r requirements.txt

# Install Node dependencies
cd frontend
npm install
cd ..

# Build executable
python build.py
```

## 📖 Usage

1. **Get API Credentials**
   - Visit https://my.telegram.org
   - Create a new application
   - Save your API ID and API Hash

2. **First Launch**
   - Run TeleVault.exe
   - Enter API credentials
   - Sign in with phone number + OTP

3. **Upload Files**
   - Click "Upload" button or drag & drop
   - Files are encrypted locally before upload
   - Resume interrupted uploads automatically

## 🔒 Security

- **End-to-End Encryption**: AES-256-GCM with Argon2id key derivation
- **Local-Only Keys**: Vault key never leaves your device
- **Optional Per-File Passwords**: Extra protection for sensitive files
- **Metadata Privacy**: Filenames encrypted in manifests

**⚠️ Important**: Never share your `vault.key` file. If lost, encrypted data cannot be recovered.

## 🏗️ Architecture

- **Backend**: Python + FastAPI + Telethon
- **Frontend**: React 19 + TypeScript + Vite
- **Desktop**: Tauri (native Windows app)
- **Database**: SQLite for instant file indexing
- **Encryption**: AES-256-GCM (hardware-accelerated)

## 📂 Data Location

- Session & Keys: `%APPDATA%/TeleVault/data/`
- Cache: `%APPDATA%/TeleVault/data/cache/`
- Thumbnails: `%APPDATA%/TeleVault/data/thumbnails/`

## 🤝 Contributing

Contributions welcome! Please read [SECURITY.md](SECURITY.md) before contributing.

## 📄 License

MIT License - See [LICENSE](LICENSE) file

## ⚠️ Disclaimer

This project is not affiliated with Telegram. Use responsibly and comply with Telegram's Terms of Service.

## 🙏 Acknowledgments

- **Telethon**: Python Telegram client
- **FastAPI**: Modern Python web framework
- **React**: UI library
- **Cryptography**: Python cryptographic library

---

**Liethueis Foundation © 2026**
```

---

### 4. Create GitHub Repository

```bash
# Initialize git (if not already)
git init

# Add all files (respecting .gitignore)
git add .

# First commit
git commit -m "feat: initial commit - TeleVault encrypted cloud storage"

# Create GitHub repo (via GitHub CLI or web interface)
# Option A: GitHub CLI
gh repo create TeleVault --public --source=. --remote=origin

# Option B: Manual (on github.com)
# 1. Create new repository named "TeleVault"
# 2. Don't initialize with README (we have one)
# 3. Copy the git remote add command

# Add remote (if using manual method)
git remote add origin https://github.com/YOUR_USERNAME/TeleVault.git

# Push to GitHub
git branch -M main
git push -u origin main
```

---

### 5. Add GitHub Secrets Protection

**Create `.github/workflows/security-check.yml`:**

```yaml
name: Security Check

on: [push, pull_request]

jobs:
  security:
    runs-on: ubuntu-latest
    steps:
      - uses: actions/checkout@v3
      
      - name: Check for secrets
        run: |
          # Check for common secret patterns
          if grep -r "api_id.*=[^']" --exclude-dir=node_modules --exclude-dir=.git .; then
            echo "❌ Found hardcoded api_id"
            exit 1
          fi
          
          if grep -r "api_hash.*=[^']" --exclude-dir=node_modules --exclude-dir=.git .; then
            echo "❌ Found hardcoded api_hash"
            exit 1
          fi
          
          echo "✅ No secrets detected"
```

---

### 6. Optional: Add LICENSE

```bash
# Create MIT License
cat > LICENSE << 'EOF'
MIT License

Copyright (c) 2026 Liethueis Foundation

Permission is hereby granted, free of charge, to any person obtaining a copy
of this software and associated documentation files (the "Software"), to deal
in the Software without restriction, including without limitation the rights
to use, copy, modify, merge, publish, distribute, sublicense, and/or sell
copies of the Software, and to permit persons to whom the Software is
furnished to do so, subject to the following conditions:

The above copyright notice and this permission notice shall be included in all
copies or substantial portions of the Software.

THE SOFTWARE IS PROVIDED "AS IS", WITHOUT WARRANTY OF ANY KIND, EXPRESS OR
IMPLIED, INCLUDING BUT NOT LIMITED TO THE WARRANTIES OF MERCHANTABILITY,
FITNESS FOR A PARTICULAR PURPOSE AND NONINFRINGEMENT. IN NO EVENT SHALL THE
AUTHORS OR COPYRIGHT HOLDERS BE LIABLE FOR ANY CLAIM, DAMAGES OR OTHER
LIABILITY, WHETHER IN AN ACTION OF CONTRACT, TORT OR OTHERWISE, ARISING FROM,
OUT OF OR IN CONNECTION WITH THE SOFTWARE OR THE USE OR OTHER DEALINGS IN THE
SOFTWARE.
EOF

git add LICENSE
git commit -m "docs: add MIT license"
git push
```

---

## 🚨 Emergency: Leaked Secrets

If you accidentally pushed secrets:

```bash
# 1. Change credentials immediately
#    - Revoke API keys at my.telegram.org
#    - Generate new API credentials

# 2. Remove from git history
git filter-branch --force --index-filter \
  "git rm --cached --ignore-unmatch backend/data/vault.key" \
  --prune-empty --tag-name-filter cat -- --all

# 3. Force push (DESTRUCTIVE - use with caution)
git push origin --force --all

# 4. Verify on GitHub that secrets are gone
```

---

## ✅ Final Checklist

Before making repository public:

- [ ] `.gitignore` excludes all sensitive files
- [ ] No `*.session` files in git
- [ ] No `vault.key` in git
- [ ] No `api_hash.txt` in git
- [ ] No hardcoded credentials in code
- [ ] README.md has no personal info
- [ ] SECURITY.md is included
- [ ] LICENSE file added
- [ ] All commits clean of secrets

---

## 📞 Support

- Issues: https://github.com/YOUR_USERNAME/TeleVault/issues
- Discussions: https://github.com/YOUR_USERNAME/TeleVault/discussions
