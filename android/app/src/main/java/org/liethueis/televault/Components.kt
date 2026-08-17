package org.liethueis.televault

import android.graphics.Bitmap
import android.graphics.BitmapFactory
import androidx.compose.animation.AnimatedVisibility
import androidx.compose.foundation.ExperimentalFoundationApi
import androidx.compose.foundation.Image
import androidx.compose.foundation.background
import androidx.compose.foundation.clickable
import androidx.compose.foundation.combinedClickable
import androidx.compose.foundation.layout.Arrangement
import androidx.compose.foundation.layout.Box
import androidx.compose.foundation.layout.Column
import androidx.compose.foundation.layout.PaddingValues
import androidx.compose.foundation.layout.Row
import androidx.compose.foundation.layout.Spacer
import androidx.compose.foundation.layout.aspectRatio
import androidx.compose.foundation.layout.fillMaxSize
import androidx.compose.foundation.layout.fillMaxWidth
import androidx.compose.foundation.layout.height
import androidx.compose.foundation.layout.padding
import androidx.compose.foundation.layout.size
import androidx.compose.foundation.layout.width
import androidx.compose.foundation.lazy.LazyColumn
import androidx.compose.foundation.lazy.items
import androidx.compose.foundation.shape.CircleShape
import androidx.compose.foundation.shape.RoundedCornerShape
import androidx.compose.material.icons.Icons
import androidx.compose.material.icons.automirrored.outlined.ArrowBack
import androidx.compose.material.icons.outlined.Archive
import androidx.compose.material.icons.outlined.ArrowDownward
import androidx.compose.material.icons.outlined.ArrowUpward
import androidx.compose.material.icons.outlined.AudioFile
import androidx.compose.material.icons.outlined.CheckCircle
import androidx.compose.material.icons.outlined.CloudUpload
import androidx.compose.material.icons.outlined.Description
import androidx.compose.material.icons.outlined.Download
import androidx.compose.material.icons.outlined.FilePresent
import androidx.compose.material.icons.outlined.FolderZip
import androidx.compose.material.icons.outlined.Image
import androidx.compose.material.icons.outlined.InsertDriveFile
import androidx.compose.material.icons.outlined.Lock
import androidx.compose.material.icons.outlined.MoreVert
import androidx.compose.material.icons.outlined.Movie
import androidx.compose.material.icons.outlined.MusicNote
import androidx.compose.material.icons.outlined.PictureAsPdf
import androidx.compose.material.icons.outlined.Videocam
import androidx.compose.material3.AlertDialog
import androidx.compose.material3.Card
import androidx.compose.material3.CardDefaults
import androidx.compose.material3.CircularProgressIndicator
import androidx.compose.material3.ExperimentalMaterial3Api
import androidx.compose.material3.HorizontalDivider
import androidx.compose.material3.Icon
import androidx.compose.material3.IconButton
import androidx.compose.material3.LinearProgressIndicator
import androidx.compose.material3.MaterialTheme
import androidx.compose.material3.OutlinedTextField
import androidx.compose.material3.Scaffold
import androidx.compose.material3.Surface
import androidx.compose.material3.Text
import androidx.compose.material3.TextButton
import androidx.compose.material3.TopAppBar
import androidx.compose.material3.TopAppBarDefaults
import androidx.compose.runtime.Composable
import androidx.compose.runtime.LaunchedEffect
import androidx.compose.runtime.getValue
import androidx.compose.runtime.mutableStateOf
import androidx.compose.runtime.remember
import androidx.compose.runtime.setValue
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.draw.clip
import androidx.compose.ui.graphics.Color
import androidx.compose.ui.graphics.asImageBitmap
import androidx.compose.ui.graphics.vector.ImageVector
import androidx.compose.ui.layout.ContentScale
import androidx.compose.ui.text.font.FontWeight
import androidx.compose.ui.text.style.TextAlign
import androidx.compose.ui.text.style.TextOverflow
import androidx.compose.ui.unit.dp
import androidx.compose.ui.unit.sp
import kotlinx.coroutines.Dispatchers
import kotlinx.coroutines.withContext

// ─────────────────────────────────────────────────────────────────────
//  File type icon (color-coded, like the desktop FileTypeIcon)
// ─────────────────────────────────────────────────────────────────────

data class TypeStyle(val icon: ImageVector, val color: Color, val label: String)

fun typeStyleFor(file: TeleFile): TypeStyle {
    val ext = file.extension
    return when {
        file.isImage -> TypeStyle(Icons.Outlined.Image, Color(0xFF3390EC), "Image")
        file.isVideo -> TypeStyle(Icons.Outlined.Movie, Color(0xFF8E44AD), "Video")
        file.isAudio -> TypeStyle(Icons.Outlined.MusicNote, Color(0xFF27AE60), "Audio")
        ext == "pdf" -> TypeStyle(Icons.Outlined.PictureAsPdf, Color(0xFFE74C3C), "PDF")
        ext in setOf("zip", "rar", "7z", "tar", "gz", "bz2", "xz") ->
            TypeStyle(Icons.Outlined.FolderZip, Color(0xFFF39C12), "Archive")
        ext in setOf("doc", "docx", "txt", "md", "rtf") ->
            TypeStyle(Icons.Outlined.Description, Color(0xFF2C3E50), "Document")
        ext in setOf("xls", "xlsx", "csv") ->
            TypeStyle(Icons.Outlined.FilePresent, Color(0xFF1D8348), "Sheet")
        ext in setOf("ppt", "pptx") ->
            TypeStyle(Icons.Outlined.AudioFile, Color(0xFFC0392B), "Slides")
        else -> TypeStyle(Icons.Outlined.InsertDriveFile, Color(0xFF5B636A), "File")
    }
}

@Composable
fun FileTypeIcon(file: TeleFile, size: Int = 48, corner: Int = 14) {
    val style = typeStyleFor(file)
    Box(
        modifier = Modifier
            .size(size.dp)
            .background(style.color.copy(alpha = 0.14f), RoundedCornerShape(corner.dp)),
        contentAlignment = Alignment.Center,
    ) {
        Icon(
            style.icon,
            contentDescription = style.label,
            tint = style.color,
            modifier = Modifier.size((size * 0.52f).dp),
        )
    }
}

// ─────────────────────────────────────────────────────────────────────
//  File items
// ─────────────────────────────────────────────────────────────────────

@OptIn(ExperimentalFoundationApi::class)
@Composable
fun FileGridItem(
    file: TeleFile,
    folderId: Long?,
    engine: TeleVaultEngine,
    selected: Boolean,
    onClick: () -> Unit,
    onLongClick: () -> Unit,
    onMore: () -> Unit,
    modifier: Modifier = Modifier,
) {
    var thumb by remember(file.id) { mutableStateOf<Bitmap?>(null) }
    val wantThumb = file.isImage || file.isVideo

    LaunchedEffect(file.id) {
        if (wantThumb) {
            thumb = runCatching {
                engine.getThumbnail(file.id, folderId)?.let { BitmapFactory.decodeByteArray(it, 0, it.size) }
            }.getOrNull()
        }
    }

    Card(
        modifier = modifier
            .aspectRatio(0.82f)
            .combinedClickable(onClick = onClick, onLongClick = onLongClick)
            .then(if (selected) Modifier.padding(2.dp) else Modifier),
        shape = RoundedCornerShape(16.dp),
        colors = CardDefaults.cardColors(
            containerColor = MaterialTheme.colorScheme.surface,
        ),
        elevation = CardDefaults.cardElevation(defaultElevation = 1.dp),
    ) {
        Box(Modifier.fillMaxWidth()) {
            Column(Modifier.fillMaxSize()) {
                Box(
                    modifier = Modifier
                        .fillMaxWidth()
                        .weight(1f)
                        .background(MaterialTheme.colorScheme.surfaceVariant),
                    contentAlignment = Alignment.Center,
                ) {
                    val t = thumb
                    if (t != null) {
                        Image(
                            bitmap = t.asImageBitmap(),
                            contentDescription = file.name,
                            contentScale = ContentScale.Crop,
                            modifier = Modifier.fillMaxSize(),
                        )
                    } else {
                        FileTypeIcon(file, size = 56)
                    }
                    if (file.passwordProtected) {
                        Box(
                            modifier = Modifier
                                .align(Alignment.TopEnd)
                                .padding(6.dp)
                                .size(26.dp)
                                .background(Color.Black.copy(alpha = 0.45f), CircleShape),
                            contentAlignment = Alignment.Center,
                        ) {
                            Icon(Icons.Outlined.Lock, contentDescription = "Protected", tint = Color.White, modifier = Modifier.size(14.dp))
                        }
                    }
                }
                Column(Modifier.padding(10.dp)) {
                    Text(
                        file.name,
                        style = MaterialTheme.typography.bodySmall,
                        fontWeight = FontWeight.Medium,
                        maxLines = 2,
                        overflow = TextOverflow.Ellipsis,
                        color = MaterialTheme.colorScheme.onSurface,
                    )
                    Spacer(Modifier.height(2.dp))
                    Text(
                        formatBytes(file.size),
                        style = MaterialTheme.typography.labelSmall,
                        color = MaterialTheme.colorScheme.onSurfaceVariant,
                    )
                }
            }

            if (selected) {
                Box(
                    modifier = Modifier
                        .align(Alignment.TopStart)
                        .padding(6.dp)
                        .size(24.dp)
                        .background(MaterialTheme.colorScheme.primary, CircleShape),
                    contentAlignment = Alignment.Center,
                ) {
                    Icon(
                        Icons.Outlined.CheckCircle,
                        contentDescription = "Selected",
                        tint = MaterialTheme.colorScheme.onPrimary,
                        modifier = Modifier.size(24.dp),
                    )
                }
            } else {
                // ⋮ More: opens the file detail sheet (details, share link,
                // rename, download, delete) from grid view — including videos.
                IconButton(
                    onClick = onMore,
                    modifier = Modifier
                        .align(Alignment.TopStart)
                        .padding(4.dp)
                        .size(30.dp)
                        .background(Color.Black.copy(alpha = 0.45f), CircleShape),
                ) {
                    Icon(
                        Icons.Outlined.MoreVert,
                        contentDescription = "More",
                        tint = Color.White,
                        modifier = Modifier.size(18.dp),
                    )
                }
            }
        }
    }
}

@OptIn(ExperimentalFoundationApi::class)
@Composable
fun FileListItem(
    file: TeleFile,
    folderId: Long?,
    engine: TeleVaultEngine,
    selected: Boolean,
    onClick: () -> Unit,
    onLongClick: () -> Unit,
    onMore: () -> Unit,
    modifier: Modifier = Modifier,
) {
    var thumb by remember(file.id) { mutableStateOf<Bitmap?>(null) }
    val wantThumb = file.isImage || file.isVideo

    LaunchedEffect(file.id) {
        if (wantThumb) {
            thumb = runCatching {
                engine.getThumbnail(file.id, folderId)?.let { BitmapFactory.decodeByteArray(it, 0, it.size) }
            }.getOrNull()
        }
    }

    Row(
        modifier = modifier
            .fillMaxWidth()
            .combinedClickable(onClick = onClick, onLongClick = onLongClick)
            .then(if (selected) Modifier.background(MaterialTheme.colorScheme.primaryContainer.copy(alpha = 0.4f)) else Modifier)
            .padding(horizontal = 12.dp, vertical = 8.dp),
        verticalAlignment = Alignment.CenterVertically,
    ) {
        val t = thumb
        if (t != null) {
            Image(
                bitmap = t.asImageBitmap(),
                contentDescription = null,
                contentScale = ContentScale.Crop,
                modifier = Modifier
                    .size(44.dp)
                    .background(MaterialTheme.colorScheme.surfaceVariant, RoundedCornerShape(12.dp)),
            )
        } else {
            FileTypeIcon(file, size = 44, corner = 12)
        }
        Spacer(Modifier.width(12.dp))
        Column(Modifier.weight(1f)) {
            Text(
                file.name,
                style = MaterialTheme.typography.bodyMedium,
                fontWeight = FontWeight.Medium,
                maxLines = 1,
                overflow = TextOverflow.Ellipsis,
                color = MaterialTheme.colorScheme.onSurface,
            )
            Spacer(Modifier.height(2.dp))
            Row(verticalAlignment = Alignment.CenterVertically) {
                Text(
                    formatBytes(file.size),
                    style = MaterialTheme.typography.bodySmall,
                    color = MaterialTheme.colorScheme.onSurfaceVariant,
                )
                if (file.createdAt.isNotBlank()) {
                    Text("  •  ", style = MaterialTheme.typography.bodySmall, color = MaterialTheme.colorScheme.outline)
                    Text(
                        formatDate(file.createdAt),
                        style = MaterialTheme.typography.bodySmall,
                        color = MaterialTheme.colorScheme.onSurfaceVariant,
                    )
                }
                if (file.passwordProtected) {
                    Spacer(Modifier.width(6.dp))
                    Icon(Icons.Outlined.Lock, contentDescription = "Protected", tint = MaterialTheme.colorScheme.tertiary, modifier = Modifier.size(14.dp))
                }
            }
        }
        if (selected) {
            Icon(Icons.Outlined.CheckCircle, contentDescription = "Selected", tint = MaterialTheme.colorScheme.primary)
        } else {
            IconButton(onClick = onMore) {
                Icon(Icons.Outlined.MoreVert, contentDescription = "More", tint = MaterialTheme.colorScheme.onSurfaceVariant)
            }
        }
    }
}

// ─────────────────────────────────────────────────────────────────────
//  Transfer queue panel
// ─────────────────────────────────────────────────────────────────────

@Composable
fun TransferQueuePanel(
    transfers: List<TransferItem>,
    onCancel: (String) -> Unit,
    modifier: Modifier = Modifier,
) {
    AnimatedVisibility(visible = transfers.isNotEmpty(), modifier = modifier) {
        Column(
            modifier = Modifier
                .fillMaxWidth()
                .background(MaterialTheme.colorScheme.surface, RoundedCornerShape(topStart = 18.dp, topEnd = 18.dp))
                .padding(horizontal = 16.dp, vertical = 10.dp),
        ) {
            Row(verticalAlignment = Alignment.CenterVertically) {
                Icon(
                    if (transfers.any { it.kind == TransferKind.UPLOAD }) Icons.Outlined.CloudUpload else Icons.Outlined.Download,
                    contentDescription = null,
                    tint = MaterialTheme.colorScheme.primary,
                    modifier = Modifier.size(18.dp),
                )
                Spacer(Modifier.width(8.dp))
                Text(
                    "Transfers (${transfers.count { it.status == TransferStatus.RUNNING }})",
                    style = MaterialTheme.typography.titleSmall,
                    fontWeight = FontWeight.SemiBold,
                )
            }
            Spacer(Modifier.height(8.dp))
            transfers.forEach { transfer ->
                TransferRow(transfer = transfer, onCancel = { onCancel(transfer.transferId) })
                HorizontalDivider(color = MaterialTheme.colorScheme.outline.copy(alpha = 0.15f))
            }
        }
    }
}

@Composable
fun TransferRow(transfer: TransferItem, onCancel: () -> Unit) {
    Row(
        modifier = Modifier.fillMaxWidth().padding(vertical = 6.dp),
        verticalAlignment = Alignment.CenterVertically,
    ) {
        Box(
            modifier = Modifier
                .size(34.dp)
                .background(
                    if (transfer.kind == TransferKind.UPLOAD)
                        MaterialTheme.colorScheme.primary.copy(alpha = 0.12f)
                    else
                        MaterialTheme.colorScheme.secondary.copy(alpha = 0.12f),
                    RoundedCornerShape(10.dp),
                ),
            contentAlignment = Alignment.Center,
        ) {
            Icon(
                if (transfer.kind == TransferKind.UPLOAD) Icons.Outlined.CloudUpload else Icons.Outlined.Download,
                contentDescription = null,
                tint = if (transfer.kind == TransferKind.UPLOAD) MaterialTheme.colorScheme.primary else MaterialTheme.colorScheme.secondary,
                modifier = Modifier.size(18.dp),
            )
        }
        Spacer(Modifier.width(10.dp))
        Column(Modifier.weight(1f)) {
            Text(
                transfer.name,
                style = MaterialTheme.typography.bodySmall,
                fontWeight = FontWeight.Medium,
                maxLines = 1,
                overflow = TextOverflow.Ellipsis,
            )
            Spacer(Modifier.height(3.dp))
            when (transfer.status) {
                TransferStatus.RUNNING -> LinearProgressIndicator(
                    progress = { transfer.percent / 100f },
                    modifier = Modifier.fillMaxWidth().height(4.dp),
                    trackColor = MaterialTheme.colorScheme.surfaceContainerHighest,
                )
                TransferStatus.DONE -> Text(
                    "Complete",
                    style = MaterialTheme.typography.labelSmall,
                    color = MaterialTheme.colorScheme.secondary,
                )
                TransferStatus.FAILED -> Text(
                    transfer.error ?: "Failed",
                    style = MaterialTheme.typography.labelSmall,
                    color = MaterialTheme.colorScheme.error,
                    maxLines = 2,
                    overflow = TextOverflow.Ellipsis,
                )
                TransferStatus.CANCELLED -> Text(
                    "Cancelled",
                    style = MaterialTheme.typography.labelSmall,
                    color = MaterialTheme.colorScheme.onSurfaceVariant,
                )
            }
        }
        Spacer(Modifier.width(8.dp))
        if (transfer.kind == TransferKind.UPLOAD || transfer.status == TransferStatus.RUNNING) {
            Text(
                "${transfer.percent.toInt()}%",
                style = MaterialTheme.typography.labelSmall,
                color = MaterialTheme.colorScheme.onSurfaceVariant,
            )
        }
        if (transfer.status == TransferStatus.RUNNING) {
            TextButton(onClick = onCancel, contentPadding = androidx.compose.foundation.layout.PaddingValues(8.dp)) {
                Text("Cancel", style = MaterialTheme.typography.labelSmall, color = MaterialTheme.colorScheme.error)
            }
        }
    }
}

// ─────────────────────────────────────────────────────────────────────
//  Round transfer-center button (progress ring + up/down arrows)
// ─────────────────────────────────────────────────────────────────────

/**
 * Round button pinned to the top bar on every folder. Shows up/down arrows;
 * while a transfer runs, the ring border fills with the average progress of
 * all running transfers (primary = an upload is active, secondary = download).
 * A small badge shows the number of transfers in flight.
 */
@Composable
fun TransferCenterButton(
    transfers: List<TransferItem>,
    onClick: () -> Unit,
    modifier: Modifier = Modifier,
) {
    val running = transfers.filter { it.status == TransferStatus.RUNNING }
    val fraction =
        if (running.isEmpty()) 0f
        else (running.map { it.percent }.sum() / (running.size * 100f)).coerceIn(0f, 1f)
    val ringColor =
        if (running.any { it.kind == TransferKind.UPLOAD })
            MaterialTheme.colorScheme.primary
        else
            MaterialTheme.colorScheme.secondary

    Box(
        modifier = modifier
            .size(38.dp)
            .clip(CircleShape)
            .clickable(onClick = onClick),
        contentAlignment = Alignment.Center,
    ) {
        CircularProgressIndicator(
            progress = { fraction },
            modifier = Modifier.fillMaxSize(),
            strokeWidth = 2.5.dp,
            color = ringColor,
            trackColor = MaterialTheme.colorScheme.surfaceVariant.copy(alpha = 0.6f),
        )
        Column(
            horizontalAlignment = Alignment.CenterHorizontally,
            modifier = Modifier.padding(top = 2.dp),
        ) {
            Icon(
                Icons.Outlined.ArrowUpward,
                contentDescription = "Uploads",
                tint = MaterialTheme.colorScheme.primary,
                modifier = Modifier.size(13.dp),
            )
            Icon(
                Icons.Outlined.ArrowDownward,
                contentDescription = "Downloads",
                tint = MaterialTheme.colorScheme.secondary,
                modifier = Modifier.size(13.dp),
            )
        }
        if (running.isNotEmpty()) {
            Box(
                modifier = Modifier
                    .align(Alignment.TopEnd)
                    .size(16.dp)
                    .background(MaterialTheme.colorScheme.error, CircleShape),
                contentAlignment = Alignment.Center,
            ) {
                Text(
                    running.size.toString(),
                    style = MaterialTheme.typography.labelSmall,
                    color = MaterialTheme.colorScheme.onError,
                    fontSize = 9.sp,
                    fontWeight = FontWeight.Bold,
                )
            }
        }
    }
}

// ─────────────────────────────────────────────────────────────────────
//  Transfer center screen (Downloads + Uploads sections)
// ─────────────────────────────────────────────────────────────────────

@Composable
private fun TransferSectionHeader(title: String, running: Int, total: Int, icon: ImageVector) {
    Row(
        verticalAlignment = Alignment.CenterVertically,
        modifier = Modifier
            .fillMaxWidth()
            .padding(top = 10.dp, bottom = 2.dp),
    ) {
        Icon(icon, contentDescription = null, tint = MaterialTheme.colorScheme.primary, modifier = Modifier.size(18.dp))
        Spacer(Modifier.width(8.dp))
        Text(title, style = MaterialTheme.typography.titleMedium, fontWeight = FontWeight.Bold)
        Spacer(Modifier.weight(1f))
        if (running > 0) {
            Text(
                "$running running",
                style = MaterialTheme.typography.labelSmall,
                color = MaterialTheme.colorScheme.primary,
                fontWeight = FontWeight.SemiBold,
            )
            Spacer(Modifier.width(8.dp))
        }
        Text(
            "$total total",
            style = MaterialTheme.typography.labelSmall,
            color = MaterialTheme.colorScheme.onSurfaceVariant,
        )
    }
}

@OptIn(ExperimentalMaterial3Api::class)
@Composable
fun TransferCenterScreen(
    transfers: TransferTracker,
    onCancel: (String) -> Unit,
    onBack: () -> Unit,
) {
    val items = transfers.items.toList()
    val downloads = items.filter { it.kind == TransferKind.DOWNLOAD }
    val uploads = items.filter { it.kind == TransferKind.UPLOAD }

    Scaffold(
        topBar = {
            TopAppBar(
                title = {
                    Column {
                        Text("Transfers", fontWeight = FontWeight.Bold)
                        Text(
                            "Uploads & downloads",
                            style = MaterialTheme.typography.labelSmall,
                            color = MaterialTheme.colorScheme.onSurfaceVariant,
                        )
                    }
                },
                navigationIcon = {
                    IconButton(onClick = onBack) {
                        Icon(Icons.AutoMirrored.Outlined.ArrowBack, contentDescription = "Back")
                    }
                },
                colors = TopAppBarDefaults.topAppBarColors(
                    containerColor = MaterialTheme.colorScheme.surface,
                ),
            )
        },
    ) { padding ->
        if (items.isEmpty()) {
            Box(
                modifier = Modifier
                    .fillMaxSize()
                    .padding(padding),
                contentAlignment = Alignment.Center,
            ) {
                Column(horizontalAlignment = Alignment.CenterHorizontally) {
                    Icon(
                        Icons.Outlined.CloudUpload,
                        contentDescription = null,
                        tint = MaterialTheme.colorScheme.onSurfaceVariant,
                        modifier = Modifier.size(40.dp),
                    )
                    Text(
                        "No transfers yet",
                        style = MaterialTheme.typography.titleMedium,
                        fontWeight = FontWeight.SemiBold,
                        modifier = Modifier.padding(top = 12.dp),
                    )
                    Text(
                        "Uploads and downloads will show up here with live progress.",
                        style = MaterialTheme.typography.bodySmall,
                        color = MaterialTheme.colorScheme.onSurfaceVariant,
                        textAlign = TextAlign.Center,
                        modifier = Modifier.padding(top = 4.dp, start = 32.dp, end = 32.dp),
                    )
                }
            }
        } else {
            LazyColumn(
                modifier = Modifier
                    .fillMaxSize()
                    .padding(padding),
                contentPadding = PaddingValues(start = 16.dp, end = 16.dp, bottom = 24.dp),
            ) {
                if (downloads.isNotEmpty()) {
                    item(key = "header-downloads") {
                        TransferSectionHeader(
                            title = "Downloads",
                            running = downloads.count { it.status == TransferStatus.RUNNING },
                            total = downloads.size,
                            icon = Icons.Outlined.Download,
                        )
                    }
                    items(downloads, key = { it.transferId }) { transfer ->
                        TransferRow(transfer = transfer, onCancel = { onCancel(transfer.transferId) })
                        HorizontalDivider(color = MaterialTheme.colorScheme.outline.copy(alpha = 0.15f))
                    }
                }
                if (uploads.isNotEmpty()) {
                    item(key = "header-uploads") {
                        TransferSectionHeader(
                            title = "Uploads",
                            running = uploads.count { it.status == TransferStatus.RUNNING },
                            total = uploads.size,
                            icon = Icons.Outlined.CloudUpload,
                        )
                    }
                    items(uploads, key = { it.transferId }) { transfer ->
                        TransferRow(transfer = transfer, onCancel = { onCancel(transfer.transferId) })
                        HorizontalDivider(color = MaterialTheme.colorScheme.outline.copy(alpha = 0.15f))
                    }
                }
            }
        }
    }
}

// ─────────────────────────────────────────────────────────────────────
//  Dialogs + empty state
// ─────────────────────────────────────────────────────────────────────

@Composable
fun ConfirmDialog(
    title: String,
    text: String,
    confirmLabel: String = "Delete",
    destructive: Boolean = true,
    onConfirm: () -> Unit,
    onDismiss: () -> Unit,
) {
    AlertDialog(
        onDismissRequest = onDismiss,
        title = { Text(title, fontWeight = FontWeight.SemiBold) },
        text = { Text(text) },
        confirmButton = {
            TextButton(
                onClick = {
                    onDismiss()
                    onConfirm()
                },
            ) {
                Text(confirmLabel, color = if (destructive) MaterialTheme.colorScheme.error else MaterialTheme.colorScheme.primary)
            }
        },
        dismissButton = {
            TextButton(onClick = onDismiss) { Text("Cancel") }
        },
    )
}

@Composable
fun PasswordDialog(
    title: String,
    onConfirm: (String) -> Unit,
    onDismiss: () -> Unit,
) {
    var password by remember { mutableStateOf("") }
    AlertDialog(
        onDismissRequest = onDismiss,
        title = { Text(title) },
        text = {
            OutlinedTextField(
                value = password,
                onValueChange = { password = it },
                label = { Text("File password") },
                singleLine = true,
            )
        },
        confirmButton = {
            TextButton(
                enabled = password.isNotBlank(),
                onClick = {
                    onDismiss()
                    onConfirm(password)
                },
            ) { Text("Unlock") }
        },
        dismissButton = {
            TextButton(onClick = onDismiss) { Text("Cancel") }
        },
    )
}

@Composable
fun EmptyState(icon: androidx.compose.ui.graphics.vector.ImageVector, title: String, subtitle: String) {
    Column(
        modifier = Modifier.fillMaxWidth().padding(vertical = 48.dp),
        horizontalAlignment = Alignment.CenterHorizontally,
    ) {
        Icon(
            icon,
            contentDescription = null,
            tint = MaterialTheme.colorScheme.outline,
            modifier = Modifier.size(56.dp),
        )
        Spacer(Modifier.height(12.dp))
        Text(title, style = MaterialTheme.typography.titleMedium, fontWeight = FontWeight.SemiBold)
        Spacer(Modifier.height(4.dp))
        Text(
            subtitle,
            style = MaterialTheme.typography.bodyMedium,
            color = MaterialTheme.colorScheme.onSurfaceVariant,
            textAlign = TextAlign.Center,
        )
    }
}
