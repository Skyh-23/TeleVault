package org.liethueis.televault

import android.content.ContentValues
import android.content.Context
import android.graphics.Bitmap
import android.graphics.BitmapFactory
import android.media.MediaMetadataRetriever
import android.net.Uri
import android.os.Build
import android.provider.MediaStore
import android.provider.OpenableColumns
import com.chaquo.python.Python
import com.chaquo.python.android.AndroidPlatform
import kotlinx.coroutines.Dispatchers
import kotlinx.coroutines.withContext
import org.json.JSONArray
import org.json.JSONObject
import org.json.JSONTokener
import java.io.File
import java.util.UUID

// ─────────────────────────────────────────────────────────────────────
//  Models
// ─────────────────────────────────────────────────────────────────────

data class TeleFolder(val id: Long?, val name: String)

/** Result of a full vault sync. */
data class SyncResult(
    val folders: List<TeleFolder>,
    val files: List<TeleFile>,
    val vaultMismatch: Boolean,
    /** Unix seconds when this snapshot was written locally (0 = n/a). */
    val updatedAt: Long = 0,
)

data class TeleFile(
    val id: Long,
    val name: String,
    val size: Long,
    val mime: String,
    val createdAt: String,
    val passwordProtected: Boolean,
    val folderId: Long? = null,
) {
    val isImage: Boolean get() = mime.startsWith("image/")
    val isVideo: Boolean get() = mime.startsWith("video/")
    val isAudio: Boolean get() = mime.startsWith("audio/")
    val isPreviewable: Boolean get() = isImage || isVideo || isAudio
    val extension: String
        get() {
            val dot = name.lastIndexOf('.')
            return if (dot >= 0 && dot < name.length - 1) name.substring(dot + 1).lowercase() else ""
        }
}

enum class TransferKind { UPLOAD, DOWNLOAD }

enum class TransferStatus { RUNNING, DONE, FAILED, CANCELLED }

data class TransferItem(
    val transferId: String,
    val name: String,
    val kind: TransferKind,
    val status: TransferStatus = TransferStatus.RUNNING,
    val percent: Float = 0f,
    val error: String? = null,
)

// ─────────────────────────────────────────────────────────────────────
//  Python bridge
// ─────────────────────────────────────────────────────────────────────

class TeleVaultEngine(context: Context) {
    private val appContext = context.applicationContext

    init {
        if (!Python.isStarted()) {
            Python.start(AndroidPlatform(appContext))
        }
    }

    private val module = Python.getInstance().getModule("android_commands")

    /** Thrown when the Telegram session is gone (re-auth required). */
    class SessionExpired(message: String) : Exception(message)

    private suspend fun call(cmd: String, args: JSONObject = JSONObject()): Any =
        withContext(Dispatchers.IO) {
            val raw = module.callAttr("dispatch", cmd, args.toString()).toString()
            val parsed = JSONTokener(raw).nextValue()
            if (parsed is JSONObject) {
                val ok = parsed.optBoolean("ok", true)
                if (!ok) {
                    val message = parsed.optString("error", "TeleVault command failed")
                    if (message.contains("SESSION_EXPIRED")) throw SessionExpired(message)
                    error(message)
                }
            }
            parsed
        }

    // ── Auth ────────────────────────────────────────────────────────

    suspend fun connect() {
        call("cmd_connect")
    }

    suspend fun requestCode(phone: String, apiId: String, apiHash: String) {
        call(
            "cmd_auth_request_code",
            JSONObject()
                .put("phone", phone.trim())
                .put("apiId", apiId.trim().toInt())
                .put("apiHash", apiHash.trim()),
        )
    }

    suspend fun signIn(code: String): JSONObject =
        call("cmd_auth_sign_in", JSONObject().put("code", code.trim())) as JSONObject

    suspend fun checkPassword(password: String): JSONObject =
        call("cmd_auth_check_password", JSONObject().put("password", password)) as JSONObject

    suspend fun logout() {
        runCatching { call("cmd_logout") }
    }

    // ── Folders ─────────────────────────────────────────────────────

    suspend fun scanFolders(): List<TeleFolder> =
        (call("cmd_scan_folders") as JSONArray).toFolders()

    suspend fun createFolder(name: String): TeleFolder {
        val item = call("cmd_create_folder", JSONObject().put("name", name.trim())) as JSONObject
        return TeleFolder(item.getLong("id"), item.getString("name"))
    }

    suspend fun deleteFolder(folderId: Long) {
        call("cmd_delete_folder", JSONObject().put("folderId", folderId))
    }

    // ── Files ───────────────────────────────────────────────────────

    suspend fun getFiles(folderId: Long?): List<TeleFile> =
        (call("cmd_get_files", JSONObject().putNullable("folderId", folderId)) as JSONArray).toFiles()

    suspend fun syncAll(): SyncResult {
        val result = call("cmd_sync_all_folders") as JSONObject
        return SyncResult(
            folders = result.getJSONArray("folders").toFolders(),
            files = result.getJSONArray("files").toFiles(),
            vaultMismatch = result.optBoolean("vault_mismatch", false),
        )
    }

    /**
     * Returns the last clean sync snapshot from the local encrypted cache, or
     * null when there is none (first run / key changed). Lets the dashboard
     * render instantly, then refresh from Telegram in the background.
     */
    suspend fun cachedListing(): SyncResult? {
        val result = runCatching { call("cmd_get_cached_listing") as JSONObject }.getOrNull() ?: return null
        if (!result.optBoolean("cached", false)) return null
        return SyncResult(
            folders = result.getJSONArray("folders").toFolders(),
            files = result.getJSONArray("files").toFiles(),
            vaultMismatch = result.optBoolean("vault_mismatch", false),
            updatedAt = result.optLong("updated_at", 0),
        )
    }

    /** Renames a file by re-uploading its manifest (data blocks untouched). */
    suspend fun renameFile(messageId: Long, folderId: Long?, newName: String) {
        call(
            "cmd_rename_file",
            JSONObject()
                .put("messageId", messageId)
                .putNullable("folderId", folderId)
                .put("newName", newName),
        )
    }

    suspend fun uploadFile(
        path: String,
        folderId: Long?,
        transferId: String,
        password: String? = null,
        thumbnailB64: String? = null,
    ) {
        val args = JSONObject()
            .put("path", path)
            .putNullable("folderId", folderId)
            .put("transferId", transferId)
            .put("resume", true)
        if (password != null) args.put("password", password)
        if (thumbnailB64 != null) args.put("thumbnail_b64", thumbnailB64)
        call("cmd_upload_file", args)
    }

    suspend fun downloadFile(
        messageId: Long,
        folderId: Long?,
        savePath: String,
        transferId: String,
        password: String? = null,
    ) {
        val args = JSONObject()
            .put("messageId", messageId)
            .putNullable("folderId", folderId)
            .put("savePath", savePath)
            .put("transferId", transferId)
            .put("resume", true)
        if (password != null) args.put("password", password)
        call("cmd_download_file", args)
    }

    suspend fun deleteFiles(messageIds: List<Long>, folderId: Long?) {
        call(
            "cmd_delete_files",
            JSONObject()
                .put("messageIds", JSONArray().apply { messageIds.forEach { put(it) } })
                .putNullable("folderId", folderId),
        )
    }

    suspend fun moveFiles(messageIds: List<Long>, sourceFolderId: Long?, targetFolderId: Long?) {
        call(
            "cmd_move_files",
            JSONObject()
                .put("messageIds", JSONArray().apply { messageIds.forEach { put(it) } })
                .putNullable("sourceFolderId", sourceFolderId)
                .putNullable("targetFolderId", targetFolderId),
        )
    }

    suspend fun searchGlobal(query: String): List<TeleFile> =
        (call("cmd_search_global", JSONObject().put("query", query)) as JSONArray).toFiles()

    // ── Channel-based E2E sharing ─────────────────────────────────

    /** Creates a channel-based E2E share; returns the share JSON (link, revokeId, expiry). */
    suspend fun createChannelShare(
        messageId: Long,
        folderId: Long?,
        password: String,
        expiresInSeconds: Long,
        accessKey: String = "",
    ): JSONObject = call(
        "cmd_share_create",
        JSONObject()
            .put("messageId", messageId)
            .putNullable("folderId", folderId)
            .put("password", password)
            .putNullableString("accessKey", accessKey.takeIf { it.isNotBlank() })
            .put("expiresInSeconds", expiresInSeconds),
    ) as JSONObject

    /** Recipient-side: validate a share link, join the channel, unlock the envelope. */
    suspend fun joinChannelShare(link: String, password: String, accessKey: String = ""): JSONObject =
        call(
            "cmd_share_join",
            JSONObject()
                .put("link", link.trim())
                .put("password", password)
                .putNullableString("accessKey", accessKey.takeIf { it.isNotBlank() }),
        ) as JSONObject

    /** Downloads + decrypts one block of a shared file, returned as raw bytes. */
    suspend fun shareDownloadBlock(link: String, password: String, blockIndex: Int, accessKey: String = ""): ByteArray =
        withContext(Dispatchers.IO) {
            val result = call(
                "cmd_share_download_block",
                JSONObject()
                    .put("link", link.trim())
                    .put("password", password)
                    .putNullableString("accessKey", accessKey.takeIf { it.isNotBlank() })
                    .put("blockIndex", blockIndex),
            ) as JSONObject
            val b64 = result.optString("data_b64", "")
            if (b64.isBlank()) ByteArray(0) else android.util.Base64.decode(b64, android.util.Base64.DEFAULT)
        }

    // ── Thumbnails / previews ───────────────────────────────────────

    /** Returns decrypted thumbnail bytes (webp/jpeg) or null. */
    suspend fun getThumbnail(messageId: Long, folderId: Long?): ByteArray? =
        withContext(Dispatchers.IO) {
            val result = try {
                call(
                    "cmd_get_thumbnail",
                    JSONObject().put("messageId", messageId).putNullable("folderId", folderId),
                ) as JSONObject
            } catch (e: Exception) {
                return@withContext null
            }
            val b64 = result.optString("data_b64", "")
            if (b64.isBlank()) null else android.util.Base64.decode(b64, android.util.Base64.DEFAULT)
        }

    suspend fun streamServerStart(): Int {
        val result = call("cmd_stream_server_start") as JSONObject
        return result.getInt("port")
    }

    fun streamUrl(port: Int, file: TeleFile, folderId: Long?): String {
        val base = "http://127.0.0.1:$port/stream?path=${file.id}"
        return if (folderId != null) "$base&folderId=$folderId" else base
    }

    // ── Stats / vault / bandwidth ───────────────────────────────────

    suspend fun storageStats(): JSONObject =
        call("cmd_storage_stats", JSONObject().put("allFolders", true)) as JSONObject

    suspend fun bandwidth(): JSONObject =
        call("cmd_get_bandwidth") as JSONObject

    suspend fun exportVaultFile(password: String, path: String) {
        call(
            "cmd_export_vault_file",
            JSONObject().put("password", password).put("path", path),
        )
    }

    suspend fun importVaultFile(password: String, path: String) {
        call(
            "cmd_import_vault_file",
            JSONObject().put("password", password).put("path", path),
        )
    }

    // ── Transfers ───────────────────────────────────────────────────

    suspend fun transferProgress(transferId: String): JSONObject? {
        val result = call(
            "cmd_get_transfer_progress",
            JSONObject().put("transferId", transferId),
        )
        return if (result is JSONObject && !result.isNull("transferId")) result else null
    }

    suspend fun cancelTransfer(transferId: String) {
        runCatching {
            call("cmd_cancel_transfer", JSONObject().put("transferId", transferId))
        }
    }

    // ── Saving to the device ───────────────────────────────────────

    /**
     * Copies a decrypted file into the system Downloads folder via MediaStore.
     * Requires Android 10+ (API 29); returns false on older versions so the
     * caller can fall back to the SAF save dialog.
     */
    suspend fun saveToDownloads(name: String, mime: String, sourcePath: String): Boolean =
        withContext(Dispatchers.IO) {
            if (Build.VERSION.SDK_INT < Build.VERSION_CODES.Q) return@withContext false
            runCatching {
                val resolver = appContext.contentResolver
                val values = ContentValues().apply {
                    put(MediaStore.Downloads.DISPLAY_NAME, name)
                    put(MediaStore.Downloads.MIME_TYPE, mime.ifBlank { "application/octet-stream" })
                    put(MediaStore.Downloads.IS_PENDING, 1)
                }
                val uri = resolver.insert(MediaStore.Downloads.EXTERNAL_CONTENT_URI, values)
                if (uri == null) return@runCatching false
                val copied = resolver.openOutputStream(uri)?.use { out ->
                    File(sourcePath).inputStream().use { it.copyTo(out) }
                    true
                } ?: false
                if (copied) {
                    values.clear()
                    values.put(MediaStore.Downloads.IS_PENDING, 0)
                    resolver.update(uri, values, null, null)
                } else {
                    runCatching { resolver.delete(uri, null, null) }
                }
                copied
            }.getOrDefault(false)
        }
}

// ─────────────────────────────────────────────────────────────────────
//  JSON helpers
// ─────────────────────────────────────────────────────────────────────

fun JSONObject.putNullable(name: String, value: Long?): JSONObject =
    put(name, if (value == null) JSONObject.NULL else value)

fun JSONObject.putNullableString(name: String, value: String?): JSONObject =
    put(name, if (value == null) JSONObject.NULL else value)

fun JSONArray.toFolders(): List<TeleFolder> =
    (0 until length()).map { index ->
        val item = getJSONObject(index)
        TeleFolder(
            id = if (item.isNull("id")) null else item.optLong("id"),
            name = item.getString("name"),
        )
    }

fun JSONArray.toFiles(): List<TeleFile> =
    (0 until length()).mapNotNull { index ->
        val item = getJSONObject(index)
        val id = item.optLong("id", -1)
        if (id < 0) return@mapNotNull null
        TeleFile(
            id = id,
            name = item.optString("name", item.optString("filename", "File")),
            size = item.optLong("size", 0L),
            mime = item.optString("mime", ""),
            createdAt = item.optString("created_at", ""),
            passwordProtected = item.optBoolean("password_protected", false),
            folderId = if (item.isNull("folder_id")) null else item.optLong("folder_id"),
        )
    }

// ─────────────────────────────────────────────────────────────────────
//  Formatting
// ─────────────────────────────────────────────────────────────────────

fun formatBytes(bytes: Long): String {
    if (bytes < 1024) return "$bytes B"
    val units = listOf("KB", "MB", "GB", "TB")
    var value = bytes / 1024.0
    var unit = 0
    while (value >= 1024 && unit < units.lastIndex) {
        value /= 1024.0
        unit++
    }
    return "%.1f %s".format(value, units[unit])
}

fun formatDate(iso: String): String {
    // Manifest timestamps look like "2026-08-07T10:00:00Z".
    // Kept dependency-free (java.time needs API 26+/desugaring).
    if (iso.isBlank()) return ""
    return try {
        val datePart = iso.take(10)
        val parts = datePart.split("-")
        if (parts.size == 3 && parts[0].length == 4) {
            "${parts[1]}/${parts[2]}/${parts[0]}"
        } else {
            datePart
        }
    } catch (e: Exception) {
        iso.take(10)
    }
}

// ─────────────────────────────────────────────────────────────────────
//  Content URI helpers (Storage Access Framework)
// ─────────────────────────────────────────────────────────────────────

fun Context.displayName(uri: Uri): String {
    contentResolver.query(uri, arrayOf(OpenableColumns.DISPLAY_NAME), null, null, null)
        ?.use { cursor ->
            if (cursor.moveToFirst()) {
                val index = cursor.getColumnIndex(OpenableColumns.DISPLAY_NAME)
                if (index >= 0) return cursor.getString(index)
            }
        }
    return "upload-${System.currentTimeMillis()}"
}

/** Copies a picked content URI into the app cache so Python can read it. */
suspend fun copyUriToCache(context: Context, uri: Uri, subdir: String = "uploads"): String =
    withContext(Dispatchers.IO) {
        val name = context.displayName(uri)
        val target = File(context.cacheDir, "$subdir/$name")
        target.parentFile?.mkdirs()
        context.contentResolver.openInputStream(uri)?.use { input ->
            target.outputStream().use { output -> input.copyTo(output) }
        } ?: error("Unable to open selected file")
        target.absolutePath
    }

/** Copies an app-internal file to a user-picked content URI. */
suspend fun copyFileToUri(context: Context, sourcePath: String, uri: Uri) {
    withContext(Dispatchers.IO) {
        context.contentResolver.openOutputStream(uri)?.use { out ->
            File(sourcePath).inputStream().use { input -> input.copyTo(out) }
        } ?: error("Unable to open save destination")
    }
}

// ─────────────────────────────────────────────────────────────────────
//  Native thumbnail generation (images + videos)
// ─────────────────────────────────────────────────────────────────────

private const val MAX_THUMB_DIM = 512

/**
 * Generates a small thumbnail (webp bytes) for an image/video file on disk.
 * Returns null for non-media files or on failure.
 */
fun generateThumbnail(filePath: String, mime: String): ByteArray? {
    val bitmap = when {
        mime.startsWith("video/") -> try {
            val retriever = MediaMetadataRetriever()
            try {
                retriever.setDataSource(filePath)
                retriever.getFrameAtTime(0, MediaMetadataRetriever.OPTION_CLOSEST_SYNC)
            } finally {
                runCatching { retriever.release() }
            }
        } catch (e: Exception) {
            null
        }
        mime.startsWith("image/") -> try {
            val opts = BitmapFactory.Options().apply { inJustDecodeBounds = true }
            BitmapFactory.decodeFile(filePath, opts)
            opts.inSampleSize = calculateSampleSize(opts.outWidth, opts.outHeight)
            opts.inJustDecodeBounds = false
            BitmapFactory.decodeFile(filePath, opts)
        } catch (e: Exception) {
            null
        }
        else -> null
    } ?: return null

    // Downscale to a reasonable thumbnail size.
    val scaled = scaleDown(bitmap, MAX_THUMB_DIM)
    if (scaled !== bitmap) bitmap.recycle()

    val out = java.io.ByteArrayOutputStream()
    val compressed = scaled.compress(Bitmap.CompressFormat.WEBP, 80, out)
    scaled.recycle()
    return if (compressed) out.toByteArray() else null
}

private fun calculateSampleSize(width: Int, height: Int): Int {
    var sample = 1
    var w = width
    var h = height
    while (w / 2 >= MAX_THUMB_DIM || h / 2 >= MAX_THUMB_DIM) {
        w /= 2
        h /= 2
        sample *= 2
    }
    return sample
}

private fun scaleDown(bitmap: Bitmap, maxDim: Int): Bitmap {
    val max = maxOf(bitmap.width, bitmap.height)
    if (max <= maxDim) return bitmap
    val scale = maxDim.toFloat() / max
    return Bitmap.createScaledBitmap(
        bitmap,
        (bitmap.width * scale).toInt().coerceAtLeast(1),
        (bitmap.height * scale).toInt().coerceAtLeast(1),
        true,
    )
}

fun newTransferId(): String = UUID.randomUUID().toString()
