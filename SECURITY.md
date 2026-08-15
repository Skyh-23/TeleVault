# Security Policy

## ⚠️ IMPORTANT: Never Commit Sensitive Data

### Files to NEVER commit:
- `backend/data/` - Contains session files and vault keys
- `*.session` - Telegram session files
- `vault.key` - Your encryption key (if this is lost, data is unrecoverable)
- `api_hash.txt` - Your Telegram API credentials
- `metadata.db` - Your file index database
- Any file containing your phone number or API credentials

### Before Pushing to GitHub:

1. **Check .gitignore is working:**
   ```bash
   git status
   ```
   Should NOT show any `.session`, `vault.key`, or `backend/data/` files

2. **Verify no secrets in code:**
   ```bash
   # Search for potential secrets
   grep -r "api_id" --exclude-dir=node_modules --exclude-dir=.git
   grep -r "api_hash" --exclude-dir=node_modules --exclude-dir=.git
   grep -r "phone" --exclude-dir=node_modules --exclude-dir=.git
   ```

3. **Clean history if you accidentally committed secrets:**
   ```bash
   # Remove file from all history
   git filter-branch --force --index-filter \
     "git rm --cached --ignore-unmatch backend/data/vault.key" \
     --prune-empty --tag-name-filter cat -- --all
   
   # Force push (warning: destructive!)
   git push origin --force --all
   ```

## Security Best Practices

### For Users:
- Never share your `vault.key` file
- Use strong, unique passwords for 2FA
- Keep API credentials private
- Regularly backup your `vault.key` using the app's export feature

### For Developers:
- Use environment variables for testing credentials
- Never hardcode API keys
- Keep dependencies updated: `pip install --upgrade -r requirements.txt`
- Review code for accidental credential logging

## Reporting Security Issues

If you find a security vulnerability, please report it privately:
- Email: security@yourdomain.com (replace with your email)
- Do NOT create public GitHub issues for security bugs

## Encryption Details

TeleVault uses:
- **AES-256-GCM** for file encryption (NIST approved)
- **Argon2id** for key derivation (memory-hard, resistant to brute force)
- **32-byte salts** per file (prevents rainbow table attacks)
- **Per-block nonces** (prevents replay attacks)

Encryption is performed locally; keys never leave your device.
