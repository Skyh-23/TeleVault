# TeleVault Troubleshooting Guide

This guide covers common issues when building and running TeleVault as an executable.

---

## Build Issues

### ❌ "PyInstaller not found"

**Error:**
```
ModuleNotFoundError: No module named 'PyInstaller'
```

**Solution:**
```cmd
pip install pyinstaller
```

### ❌ "Frontend build failed"

**Error:**
```
npm run build failed
```

**Solutions:**
1. Delete `node_modules` and reinstall:
   ```cmd
   cd frontend
   rmdir /s /q node_modules
   npm install
   cd ..
   ```

2. Check Node version (needs 18+):
   ```cmd
   node --version
   ```

3. Skip frontend build for testing:
   ```cmd
   python build.py --dev
   ```

### ❌ "Hidden import not found"

**Error:**
```
ImportError: No module named 'xxx'
```

**Solution:**
Add to `hiddenimports` in `build.py`:
```python
hiddenimports=[
    # ... existing imports ...
    'xxx',  # Add missing module
]
```

---

## Runtime Issues

### ❌ "AttributeError: 'NoneType' object has no attribute 'isatty'"

**Error:**
```
AttributeError: 'NoneType' object has no attribute 'isatty'
ValueError: Unable to configure formatter 'default'
```

**Cause:** Uvicorn's logging tries to access stdout/stderr which are None in windowed mode.

**Solution:** ✅ Already fixed in main.py:
```python
# Fix for PyInstaller windowed mode
if sys.stdout is None:
    sys.stdout = open(os.devnull, 'w')
if sys.stderr is None:
    sys.stderr = open(os.devnull, 'w')
```

**If still occurring:**
1. Rebuild after pulling latest changes
2. Or run in console mode temporarily by editing `build.py`:
   ```python
   console=True,  # Change from False to True
   ```

### ❌ "Frontend not loading / blank screen"

**Symptoms:** Window opens but shows blank page or loading forever.

**Solutions:**

1. **Check if frontend was built:**
   ```cmd
   dir frontend\dist
   ```
   Should show `index.html` and `assets/` folder.
   
   If missing:
   ```cmd
   cd frontend
   npm run build
   cd ..
   python build.py
   ```

2. **Check if frontend is bundled in exe:**
   - Run exe once (it extracts to temp folder)
   - Check console output for: `Serving frontend from: ...`
   
3. **Test backend separately:**
   ```cmd
   cd backend
   python main.py --dev
   ```
   Then open http://localhost:8765/health in browser
   Should show: `{"status":"ok"}`

4. **Check browser console:**
   - Open DevTools in the app window (if available)
   - Look for CORS errors or 404s

### ❌ "Failed to execute script main"

**Cause:** Missing dependencies or incorrect paths.

**Solution:**
1. Check all dependencies are installed:
   ```cmd
   pip install -r requirements.txt
   ```

2. Rebuild from clean state:
   ```cmd
   rmdir /s /q backend\build
   rmdir /s /q backend\dist
   rmdir /s /q dist
   python build.py
   ```

### ❌ "The code execution cannot proceed because python3X.dll was not found"

**Cause:** Missing Python DLL (shouldn't happen with PyInstaller).

**Solution:**
1. Ensure Python is properly installed
2. Rebuild with `--onefile` flag (already set in build.py)
3. Or install Visual C++ Redistributable:
   https://aka.ms/vs/17/release/vc_redist.x64.exe

### ❌ Antivirus blocking or deleting executable

**Symptoms:** 
- Exe disappears after build
- Windows Defender alerts
- False positive malware detection

**Cause:** PyInstaller executables often trigger false positives.

**Solutions:**

1. **Add Windows Defender exclusion:**
   ```cmd
   powershell -Command "Add-MpPreference -ExclusionPath '<project-folder>\dist'"
   ```

2. **Submit to Microsoft as false positive:**
   https://www.microsoft.com/en-us/wdsi/filesubmission

3. **Sign the executable** (for distribution):
   - Get code signing certificate
   - Use `signtool.exe` to sign
   - Reduces false positives significantly

### ❌ "Port 8765 already in use"

**Error:**
```
OSError: [WinError 10048] Only one usage of each socket address is normally permitted
```

**Solution:**
1. Close any running TeleVault instances
2. Find and kill process using port:
   ```cmd
   netstat -ano | findstr :8765
   taskkill /PID <PID> /F
   ```

3. Or change port in `backend/config.py`:
   ```python
   SERVER_PORT = 8766  # Change to different port
   ```

### ❌ "Cannot connect to Telegram"

**Symptoms:** Authentication fails or "Connection error" messages.

**Solutions:**

1. **Check internet connection**

2. **Check API credentials:**
   - Valid API ID and Hash from https://my.telegram.org
   - No extra spaces or quotes

3. **Check firewall:**
   - Allow TeleVault.exe through Windows Firewall
   - Check corporate proxy settings

4. **Try different DC (Data Center):**
   - Delete session file: `%APPDATA%\TeleVault\data\televault.session`
   - Sign in again

### ❌ Large executable size (>100 MB)

**Expected size:** 50-100 MB (includes Python runtime + all dependencies)

**To reduce size:**

1. **Enable UPX compression** (already enabled in build.py):
   - Download UPX: https://upx.github.io/
   - Extract to `C:\upx\`
   - PyInstaller will auto-detect and compress

2. **Add more excludes** in `build.py`:
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
       'test',
       'unittest',
       'setuptools',
   ]
   ```

3. **Use virtual environment** (clean install):
   ```cmd
   python -m venv venv
   .\venv\Scripts\activate
   pip install -r requirements.txt
   python build.py
   ```

---

## Development Issues

### ❌ "Module not found" when running from source

**Error:**
```
ModuleNotFoundError: No module named 'fastapi'
```

**Solution:**
```cmd
pip install -r requirements.txt
```

### ❌ Frontend dev server not starting

**Error:**
```
npm run dev fails
```

**Solution:**
```cmd
cd frontend
npm install
npm run dev
```

Then access at: http://localhost:1420

### ❌ API calls returning 404

**Cause:** Backend not running or wrong port.

**Solution:**
1. Start backend:
   ```cmd
   cd backend
   python main.py --dev
   ```

2. Check port in `backend/config.py` matches frontend API calls

---

## Data Issues

### ❌ "Cannot find vault key"

**Cause:** Vault key file missing or corrupted.

**Location:** `%APPDATA%\TeleVault\data\vault.key`

**Solutions:**
1. If you have backup: Restore `vault.key` to this location
2. If no backup: **Data is unrecoverable** (by design - security)
3. Create new vault: Delete all files in `%APPDATA%\TeleVault\data\` and restart

### ❌ "Session expired" / need to re-authenticate frequently

**Cause:** Session file being deleted or moved.

**Solution:**
1. Check antivirus isn't quarantining `.session` files
2. Ensure `%APPDATA%\TeleVault\data\` has write permissions
3. Don't run multiple instances simultaneously

### ❌ "Disk full" errors

**Cause:** Download cache filling up.

**Solution:**
1. Clear cache through app: Settings → Clear Cache
2. Or manually delete: `%APPDATA%\TeleVault\data\cache\`

---

## Debugging

### Enable Console Mode

To see debug output, edit `build.py`:

```python
exe = EXE(
    # ...
    console=True,  # Change from False
    # ...
)
```

Then rebuild. Now exe will show console window with logs.

### Enable Debug Logging

Edit `backend/main.py`:

```python
logging.basicConfig(
    level=logging.DEBUG,  # Change from INFO
    format="%(asctime)s [%(name)s] %(levelname)s: %(message)s",
)
```

### Test Without Building

Run from source to get full error messages:

```cmd
REM Terminal 1: Backend
cd backend
python main.py --dev

REM Terminal 2: Frontend
cd frontend
npm run dev
```

Then open http://localhost:1420 in browser.

### Check Extracted Files

PyInstaller extracts to temp folder. To see what's bundled:

```cmd
REM Run exe once, then check:
dir /s %TEMP%\_MEI*
```

Look for `frontend/dist/` folder.

---

## Performance Issues

### ❌ Slow uploads/downloads

**Solutions:**
1. Check internet speed
2. Reduce concurrent transfers in app settings
3. Check if antivirus is scanning uploads/downloads
4. Try different Telegram DC (data center)

### ❌ High CPU usage during idle

**Cause:** Usually manifest refreshing or thumbnail generation.

**Solution:**
1. Reduce refresh frequency in app settings
2. Disable thumbnail generation temporarily
3. Clear manifest cache

### ❌ High memory usage

**Expected:** 200-500 MB

**If higher:**
1. Clear cache: `%APPDATA%\TeleVault\data\cache\`
2. Restart app
3. Reduce number of open folders

---

## Getting Help

If your issue isn't covered here:

1. **Check logs:**
   - Run in console mode (see Debugging section)
   - Look for error messages in console output

2. **Search GitHub Issues:**
   https://github.com/YOUR_USERNAME/TeleVault/issues

3. **Create Issue:**
   Include:
   - Windows version
   - Python version: `python --version`
   - Full error message
   - Steps to reproduce
   - Console output (if available)

4. **Ask in Discussions:**
   https://github.com/YOUR_USERNAME/TeleVault/discussions

---

## Quick Fixes Summary

| Issue | Quick Fix |
|-------|-----------|
| Build fails | `pip install -r requirements.txt` |
| Blank screen | Check `frontend/dist` exists, rebuild |
| Antivirus blocking | Add exclusion for `dist/` folder |
| Port in use | Kill existing instance or change port |
| Can't authenticate | Check API credentials, internet |
| Vault key missing | Restore backup or start fresh |
| Large exe size | Use UPX, add more excludes |
| Slow performance | Clear cache, check internet |

---

**Still stuck?** Run in console mode (see Debugging) and share the output when asking for help!

*Liethueis Foundation © 2026*
