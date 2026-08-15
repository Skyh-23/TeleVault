# TeleVault Crypto & Performance Notes

## Overview

TeleVault uses AES-256-GCM for authenticated encryption.

The crypto layer is designed to support encrypted file blocks while keeping transfer and storage operations practical for large files.

## Why AES-256-GCM

AES-GCM provides:

- Authenticated encryption
- Hardware acceleration on many modern devices
- A widely implemented cryptographic construction
- Integrity verification as part of decryption

TeleVault should treat the cryptographic implementation as security-sensitive code and avoid unnecessary custom cryptographic primitives.

## Design

The current design uses:

- AES-256-GCM
- Argon2id where password-derived keys are required
- Per-file encryption metadata
- Block-level encryption
- Block index information as authenticated data

Conceptually:

```text
Password / Vault Key
        │
        ▼
     Argon2id
        │
        ▼
   Encryption Key
        │
        ▼
     AES-GCM
        │
        ▼
   Encrypted Block
```

## Block Encryption

Large files are processed as blocks rather than requiring the entire file to be held in memory.

A block contains encrypted data and the authentication information required for verification.

The block index can be authenticated as associated data so that blocks cannot be silently reordered without detection.

## Performance

Encryption performance depends on:

- CPU hardware acceleration
- File size
- Block size
- Storage speed
- Memory pressure
- Python/runtime overhead
- Network speed

A fast cipher does not remove transfer bottlenecks. Upload and download performance are usually constrained by the slowest part of the complete pipeline.

## Important Security Rule

Do not optimize cryptographic code by removing authentication, weakening key derivation, reusing nonces incorrectly, or inventing a custom cipher.

Performance changes must preserve the security properties of the encryption format.

## Compatibility

Any change to:

- key derivation
- encryption parameters
- nonce handling
- block format
- manifest format

may affect the ability to decrypt existing data.

Changes should therefore be versioned and tested against existing vault data before release.
