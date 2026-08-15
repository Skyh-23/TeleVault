# TeleVault API

TeleVault's desktop/web build exposes a local FastAPI server. The React frontend
uses this API through `frontend/src/lib/api.ts`.

Default local server:

```text
http://127.0.0.1:8765
```

The API is intended for the local TeleVault app, not for public internet
hosting. Do not expose it directly to the internet.

Most command endpoints accept and return JSON.

## Common Response Style

Successful command responses vary by endpoint:

```json
{ "ok": true }
```

or:

```json
[
  { "id": 123, "name": "Example" }
]
```

FastAPI errors return HTTP errors with a message body.

## Health

### `GET /health`

Checks whether the local backend is running.

Example response:

```json
{ "status": "ok", "service": "TeleVault" }
```

## Events

### `GET /events`

Server-sent events stream used by the frontend for upload/download progress.

Payloads are progress objects such as:

```json
{ "id": "transfer-id", "percent": 42 }
```

## Authentication

### `POST /cmd_auth_request_code`

Requests a Telegram login code.

Request:

```json
{
  "phone": "+10000000000",
  "apiId": 123456,
  "apiHash": "your_api_hash"
}
```

### `POST /cmd_auth_sign_in`

Completes phone-code login.

Request:

```json
{ "code": "12345" }
```

Response:

```json
{ "success": true }
```

If Telegram two-step verification is enabled:

```json
{ "success": false, "next_step": "password" }
```

### `POST /cmd_auth_check_password`

Completes Telegram two-step verification.

Request:

```json
{ "password": "telegram_cloud_password" }
```

### `POST /cmd_connect`

Reconnects using a saved local Telegram session.

Request:

```json
{ "apiId": 123456 }
```

The backend may also use locally saved API credentials if available.

### `POST /cmd_logout`

Logs out and removes local Telegram session data.

## Folders

### `POST /cmd_scan_folders`

Lists TeleVault folders.

Response:

```json
[
  { "id": 123456789, "name": "Documents" }
]
```

### `POST /cmd_sync_all_folders`

Scans Saved Messages and all TeleVault folders.

Response:

```json
{
  "folders": [],
  "files": [],
  "total_files": 0
}
```

### `POST /cmd_create_folder`

Creates a Telegram channel-backed folder.

Request:

```json
{ "name": "Documents" }
```

### `POST /cmd_delete_folder`

Deletes a folder/channel.

Request:

```json
{ "folderId": 123456789 }
```

## Files

### `POST /cmd_get_files`

Lists files in a folder. Use `null` for Saved Messages.

Request:

```json
{ "folderId": null }
```

### `POST /cmd_upload_file`

Encrypts and uploads a local file.

Request:

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

Downloads, decrypts, verifies, and saves a file.

Request:

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

Request:

```json
{ "messageId": 123, "folderId": null }
```

### `POST /cmd_move_files`

Moves one or more files between folders.

Request:

```json
{
  "messageIds": [123, 124],
  "sourceFolderId": null,
  "targetFolderId": 123456789
}
```

### `POST /cmd_search_global`

Searches files across Telegram.

Request:

```json
{ "query": "invoice" }
```

## Preview And Streaming

### `POST /cmd_get_thumbnail`

Returns thumbnail metadata or data for supported files.

### `GET /thumbnail`

Retrieves cached/generated thumbnail data.

### `GET /stream`

Streams a decrypted file for media playback.

Query parameters:

```text
path=<messageId>&folderId=<folderId>
```

## Vault Recovery

### `POST /cmd_export_vault`

Exports the local vault key as an encrypted base64 backup.

Request:

```json
{ "password": "backup_password" }
```

### `POST /cmd_export_vault_file`

Exports the encrypted vault backup to a file path.

Request:

```json
{ "password": "backup_password", "path": "C:/path/to/recovery.tvault" }
```

### `POST /cmd_import_vault`

Imports a base64 encrypted vault backup.

Request:

```json
{
  "backup": "base64_backup_data",
  "password": "backup_password"
}
```

### `POST /cmd_import_vault_file`

Imports an encrypted vault backup from a file path.

Request:

```json
{ "password": "backup_password", "path": "C:/path/to/recovery.tvault" }
```

### `GET /cmd_vault_status`

Returns whether a local vault key exists.

## Sharing

### `POST /cmd_create_share`

Creates a local share record/link.

Request:

```json
{
  "messageId": 123,
  "folderId": null,
  "mode": "secure",
  "expiresInSeconds": 86400
}
```

### `POST /cmd_revoke_share`

Revokes a share record.

Request:

```json
{ "revokeId": "share-id" }
```

### `POST /cmd_list_shares`

Lists share records.

Request:

```json
{ "fileId": 123, "includeInactive": true }
```

## Utility

### `POST /cmd_get_bandwidth`

Returns local upload/download byte counters.

### `POST /cmd_storage_stats`

Returns storage statistics.

Request:

```json
{ "folderId": null, "allFolders": true }
```

### `POST /cmd_clean_cache`

Cleans local cache files.

### `POST /cmd_pick_file`

Desktop helper for native file picking.

### `POST /cmd_pick_save_path`

Desktop helper for native save path picking.

### `POST /cmd_is_network_available`

Checks whether Telegram/network connectivity appears available.

## Android Note

The Android app does not expose this HTTP API. It uses native Kotlin UI and calls
`android/app/src/main/python/android_commands.py` directly through Chaquopy.
The command names are intentionally aligned with the desktop API where practical.
