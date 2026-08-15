# Security Policy

## Scope

TeleVault is a client-side encrypted storage project. Security depends on the application code, local device, cryptographic implementation, Telegram, and the user's handling of credentials and recovery data.

## Never Commit Secrets

Do not commit:

```text
vault.key
*.session
api_id.txt
api_hash.txt
metadata.db
backend/data/
android/local.properties
```

Also do not commit:

- Telegram login codes
- Telegram passwords
- Phone numbers when stored as personal configuration
- Recovery passwords
- Private test files
- Personal backups
- Generated build artifacts containing sensitive data

## Vault Key

The vault key is sensitive.

If it is lost and no valid recovery backup exists, encrypted data may be unrecoverable.

Do not send the vault key to other people or store it in public repositories.

## Telegram Sessions

Telegram session files can provide access to an authenticated account.

Treat them as credentials.

If a session file is exposed, revoke the affected session through Telegram's account security controls.

## API Credentials

Telegram API ID and API hash should not be hard-coded into public source code when they are being used as private configuration.

Keep personal credentials outside the repository.

## Local API

The desktop FastAPI server is designed for local communication.

Do not bind it to a public interface or expose it through port forwarding unless you have intentionally implemented authentication, authorization, transport security, and network controls appropriate for that deployment.

## Cryptography

TeleVault uses AES-256-GCM for authenticated encryption and Argon2id for password-based key derivation.

The use of established cryptographic primitives does not constitute a complete security audit.

Do not change cryptographic parameters or formats casually. Changes can affect compatibility and data recovery.

## Reporting a Vulnerability

If you discover a security issue, do not publish credentials, private keys, session files, or exploit details containing sensitive data in a public issue.

Contact the repository maintainer privately through an appropriate GitHub contact method and include:

- A short description
- Affected component
- Reproduction steps
- Security impact
- Suggested mitigation, if known

## Data Safety

TeleVault is under active development.

Before trusting important data to a development build:

1. Export a recovery backup.
2. Store it separately.
3. Test recovery.
4. Keep an additional backup of irreplaceable files.

## No Security Guarantee

TeleVault has not undergone an independent professional security audit.

The project is provided without warranty. Do not assume that encryption alone prevents every possible privacy or security failure.
