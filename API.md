# TeleVault API

The desktop application exposes a local FastAPI server used by the React frontend.

Default address:

```text
http://127.0.0.1:8765
```

> **Security:** This API is intended for local application communication. Do not expose it directly to the public internet.

Most command endpoints use JSON request/response bodies.

## Health

### `GET /health`

Checks whether the backend is running.

```json
{
  "status": "ok",
  "service": "TeleVault"
}
```

## Events

### `GET /events`

Server-sent events stream used for transfer progress.

Example payload:

```json
{
  "id": "transfer-id",
  "percent": 42
}
```

## Authentication

### `POST /cmd_auth_request_code`

Requests a Telegram login code.

```json
{
  "phone": "+10000000000",
  "apiId": 123456,
  "apiHash": "your_api_hash"
}
```

### `POST /cmd_auth_sign_in`

Completes phone-code authentication.

```json
{
  "code": "12345"
}
```

### `POST /cmd_auth_check_password`

Completes Telegram two-step verification when required.

```json
{
  "password": "telegram_cloud_password"
}
```

### `POST /cmd_connect`

Reconnects using a locally saved Telegram session.

```json
{
  "apiId": 123456
}
```

### `POST /cmd_logout`

Logs out and removes the local Telegram session data.

## Folders

### `POST /cmd_scan_folders`

Lists TeleVault folders.

### `POST /cmd_sync_all_folders`

Scans Saved Messages and configured folders.

### `POST /cmd_create_folder`

Creates a Telegram channel-backed folder.

```json
{
  "name": "Documents"
}
```

### `POST /cmd_delete_folder`

Deletes a folder/channel.

```json
{
  "folderId": 123456789
}
```

## Files

### `POST /cmd_get_files`

Lists files in a folder.

Use `null` for Saved Messages.

```json
{
  "folderId": null
}
```

### `POST /cmd_upload_file`

Encrypts and uploads a local file.

```json
{
  "path": "C:/path/to/file.ext",
  "folderId": null,
  "transferId": "unique-transfer-id",
  "password": null,
  "resume": false
}
```

### `POST /cmd_download_file`

Downloads, decrypts, verifies and saves a file.

```json
{
  "messageId": 123,
  "savePath": "C:/path/to/output.ext",
  "folderId": null,
  "transferId": "unique-transfer-id",
  "password": null,
  "resume": false
}
```

### `POST /cmd_delete_file`

Deletes a file manifest and related data where supported.

### `POST /cmd_move_files`

Moves files between folders.

### `POST /cmd_search_global`

Searches files across configured Telegram storage.

```json
{
  "query": "invoice"
}
```

## Preview and Streaming

### `POST /cmd_get_thumbnail`

Returns thumbnail information/data for supported files.

### `GET /thumbnail`

Retrieves cached/generated thumbnail data.

### `GET /stream`

Streams decrypted media for playback.

Example query:

```text
/stream?path=<messageId>&folderId=<folderId>
```

## Vault Recovery

### `POST /cmd_export_vault`

Exports an encrypted vault backup.

```json
{
  "password": "backup_password"
}
```

### `POST /cmd_export_vault_file`

Writes an encrypted vault backup to a local file.

```json
{
  "password": "backup_password",
  "path": "C:/path/to/recovery.tvault"
}
```

### `POST /cmd_import_vault`

Imports an encrypted vault backup.

### `POST /cmd_import_vault_file`

Imports an encrypted vault backup from a file.

### `GET /cmd_vault_status`

Returns local vault-key status.

## Sharing

### `POST /cmd_create_share`

Creates a local share record.

### `POST /cmd_revoke_share`

Revokes a share record.

### `POST /cmd_list_shares`

Lists share records.

## Utility

### `POST /cmd_get_bandwidth`

Returns local transfer counters.

### `POST /cmd_storage_stats`

Returns storage statistics.

### `POST /cmd_clean_cache`

Cleans local cache data.

### `POST /cmd_pick_file`

Desktop file-picker helper.

### `POST /cmd_pick_save_path`

Desktop save-path helper.

### `POST /cmd_is_network_available`

Checks apparent network/Telegram connectivity.

## Android

The Android application does **not** expose this HTTP API.

Android uses native Kotlin/Compose UI and calls the bundled Python command layer through Chaquopy. Command names are kept aligned with the desktop API where practical.

## Source of Truth

The implementation in `backend/` is the authoritative source for endpoint behavior. This document should be updated whenever the public local API changes.
