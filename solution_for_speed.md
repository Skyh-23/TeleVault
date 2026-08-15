# 🔐 AES-256-GCM — TeleVault Crypto Module (Documentation)

## Overview

**AES-256-GCM** is the default encryption mode for TeleVault, providing **high-speed, authenticated encryption** with strong real-world security guarantees.

It replaces the slower custom cipher for production use while maintaining compatibility with TeleVault’s architecture.

---

## 🚀 Why AES-256-GCM?

* ⚡ **Extremely fast** (hardware-accelerated on most CPUs)
* 🔐 **256-bit encryption** (practically unbreakable)
* 🛡️ **Built-in authentication** (detects tampering)
* 🌍 **Industry standard** (used in TLS, VPNs, cloud storage)

---

## 🧠 Design Principles

TeleVault uses AES-GCM with additional safeguards:

* **Per-file salt** → ensures unique key per file
* **Argon2id KDF** → secure password → key derivation
* **Per-block encryption** → scalable for large files
* **Block index in AAD** → prevents block reordering attacks
* **No timestamp expiry** → files decrypt even after years

---

## 🔑 Key Derivation

```text
password + salt (32 bytes)
    ↓
Argon2id (memory-hard KDF)
    ↓
Master Key (32 bytes)
    ↓
HKDF
    ↓
enc_key (AES-256)
metadata_key (AAD binding)
```

---

## 📦 Block Encryption Format

Each encrypted block follows this structure:

```
[1 byte version]
[8 bytes block_index]
[12 bytes nonce]
[N bytes ciphertext]
[16 bytes auth tag]
```

### Fields:

* **version** → identifies AES-GCM mode
* **block_index** → prevents reordering/swapping
* **nonce** → unique per block (critical for security)
* **ciphertext** → encrypted data
* **auth tag** → ensures integrity (tamper detection)

---

## 🧩 AAD (Additional Authenticated Data)

AAD binds metadata to encryption:

```
AAD = version + block_index + hash(salt)
```

### Purpose:

* Prevents block swapping
* Prevents cross-file attacks
* Ensures correct file reconstruction

---

## 🔐 Encryption Flow

```
file → split into blocks
    ↓
for each block:
    generate random nonce (12 bytes)
    encrypt using AES-256-GCM
    attach header + tag
    upload to Telegram
```

---

## 🔓 Decryption Flow

```
download block
    ↓
verify auth tag
    ↓
check block_index
    ↓
decrypt using AES-256-GCM
    ↓
append to file
```

---

## ⚠️ Security Requirements

### 1. Nonce MUST be unique

* Never reuse nonce with same key
* TeleVault uses random nonce per block

---

### 2. Always verify auth tag

* If verification fails → reject block

---

### 3. Strong password required

* Weak passwords reduce security
* Argon2id mitigates brute force

---

### 4. Salt must be stored

* Stored in manifest (not secret)
* Required for key derivation

---

## ⚡ Performance

| Operation      | Expected Speed     |
| -------------- | ------------------ |
| 1 MB encrypt   | < 0.01 sec         |
| 100 MB encrypt | ~1–2 sec           |
| Large files    | near network speed |

---

## 🆚 Compared to Sky256

| Feature               | AES-GCM      | Sky256          |
| --------------------- | ------------ | --------------- |
| Speed                 | 🚀 Very fast | 🐢 Very slow    |
| Security              | ✅ Proven     | ❓ Custom        |
| Hardware acceleration | ✅ Yes        | ❌ No            |
| Production ready      | ✅ Yes        | ⚠️ Experimental |

---

## 🎯 Recommendation

* Use **AES-256-GCM as default**
* Keep Sky256 as **optional experimental mode**

---

## 💬 Summary

AES-256-GCM provides:

* Strong encryption
* Built-in integrity
* High performance

It is the **recommended and production-ready encryption mode** for TeleVault.

---
