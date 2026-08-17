# Android Parity Map

This file maps the desktop command names to the Android implementation.

| Command | Android bridge | UI exposed |
| --- | --- | --- |
| `cmd_auth_request_code` | Yes | Yes |
| `cmd_auth_sign_in` | Yes | Yes |
| `cmd_auth_check_password` | Yes | Yes |
| `cmd_connect` | Yes | Yes |
| `cmd_logout` | Yes | Yes |
| `cmd_scan_folders` | Yes | Yes |
| `cmd_create_folder` | Yes | Partial |
| `cmd_delete_folder` | Yes | No |
| `cmd_get_files` | Yes | Yes |
| `cmd_sync_all_folders` | Yes | Yes |
| `cmd_upload_file` | Yes | Yes |
| `cmd_download_file` | Yes | Yes |
| `cmd_delete_file` | Yes | No |
| `cmd_move_files` | Yes | No |
| `cmd_search_global` | Yes | Local search only in first UI pass |
| `cmd_export_vault` | Yes | No |
| `cmd_import_vault` | Yes | No |
| `cmd_vault_status` | Yes | No |
| `cmd_get_bandwidth` | Yes | No |
| `cmd_is_network_available` | Yes | No |

The Android bridge keeps compatibility with the current Python/Telethon backend
while the UI is native Compose.
