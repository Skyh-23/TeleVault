# TeleVault Android

Native Android version of TeleVault. This folder is intentionally separate from
the desktop/web app.

## Architecture

- UI: Kotlin + Jetpack Compose.
- Runtime bridge: Kotlin calls `android_commands.py` through Chaquopy.
- Telegram/storage core: copied Python modules from `../backend`.
- File compatibility: uses the same TeleVault encrypted block and manifest
  format as the Windows/web build.
- User install requirement: friends install only the APK. Python is bundled into
  the APK by Chaquopy.

This is not a WebView wrapper. The React frontend is not loaded in the Android
app.

## Build

1. Open this `android` folder in Android Studio.
2. Let Android Studio sync Gradle dependencies.
3. Build `app` as a debug or release APK.

The local SDK path is already set in `local.properties` for this machine:

```properties
sdk.dir=D\:\/Android\/Sdk  # or your own SDK path
```

## Current Native Feature Surface

- Telegram login with API ID, API hash, phone, code, and 2FA password.
- Session reconnect through the copied Telethon session.
- Folder scan and folder creation.
- Saved Messages and TeleVault channel folder browsing.
- Encrypted upload and encrypted download.
- Sync all folders.
- Vault backup/import commands are available in the Python bridge.
- Search, move, delete commands are available in the Python bridge.

## Important

The Kotlin UI currently exposes the core file workflow first: login, sync,
folder browsing, upload, and download. The Python bridge already has more
commands than the first UI pass exposes, so the next Android work should wire
the remaining screens: vault recovery, search results, move/delete actions,
storage stats, share management, password-protected upload/download prompts,
and transfer progress.
