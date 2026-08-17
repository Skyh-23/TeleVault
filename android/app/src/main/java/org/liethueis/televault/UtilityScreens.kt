package org.liethueis.televault

import android.content.Intent
import android.net.Uri
import android.widget.Toast
import androidx.activity.compose.rememberLauncherForActivityResult
import androidx.activity.result.contract.ActivityResultContracts
import androidx.compose.foundation.background
import androidx.compose.foundation.layout.Arrangement
import androidx.compose.foundation.layout.Box
import androidx.compose.foundation.layout.Column
import androidx.compose.foundation.layout.Row
import androidx.compose.foundation.layout.Spacer
import androidx.compose.foundation.layout.fillMaxSize
import androidx.compose.foundation.layout.fillMaxWidth
import androidx.compose.foundation.layout.height
import androidx.compose.foundation.layout.padding
import androidx.compose.foundation.layout.size
import androidx.compose.foundation.layout.width
import androidx.compose.foundation.rememberScrollState
import androidx.compose.foundation.shape.RoundedCornerShape
import androidx.compose.foundation.verticalScroll
import androidx.compose.material.icons.Icons
import androidx.compose.material.icons.outlined.Archive
import androidx.compose.material.icons.outlined.Audiotrack
import androidx.compose.material.icons.outlined.CloudDone
import androidx.compose.material.icons.outlined.Description
import androidx.compose.material.icons.outlined.Code
import androidx.compose.material.icons.outlined.Download
import androidx.compose.material.icons.outlined.Email
import androidx.compose.material.icons.outlined.FilePresent
import androidx.compose.material.icons.outlined.Foundation
import androidx.compose.material.icons.outlined.Image
import androidx.compose.material.icons.outlined.InsertDriveFile
import androidx.compose.material.icons.outlined.Key
import androidx.compose.material.icons.outlined.Lock
import androidx.compose.material.icons.outlined.Movie
import androidx.compose.material.icons.outlined.Shield
import androidx.compose.material.icons.outlined.UploadFile
import androidx.compose.material.icons.outlined.Videocam
import androidx.compose.material3.Button
import androidx.compose.material3.Card
import androidx.compose.material3.CardDefaults
import androidx.compose.material3.CircularProgressIndicator
import androidx.compose.material3.HorizontalDivider
import androidx.compose.material3.Icon
import androidx.compose.material3.LinearProgressIndicator
import androidx.compose.material3.MaterialTheme
import androidx.compose.material3.OutlinedButton
import androidx.compose.material3.OutlinedTextField
import androidx.compose.material3.Surface
import androidx.compose.material3.Text
import androidx.compose.material3.TextButton
import androidx.compose.runtime.Composable
import androidx.compose.runtime.LaunchedEffect
import androidx.compose.runtime.getValue
import androidx.compose.runtime.mutableStateOf
import androidx.compose.runtime.remember
import androidx.compose.runtime.rememberCoroutineScope
import androidx.compose.runtime.setValue
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.graphics.Color
import androidx.compose.ui.graphics.vector.ImageVector
import androidx.compose.ui.platform.LocalContext
import androidx.compose.ui.text.font.FontWeight
import androidx.compose.ui.text.input.PasswordVisualTransformation
import androidx.compose.ui.text.style.TextAlign
import androidx.compose.ui.unit.dp
import kotlinx.coroutines.launch
import org.json.JSONObject
import java.io.File

// ─────────────────────────────────────────────────────────────────────
//  Storage stats
// ─────────────────────────────────────────────────────────────────────

private data class CategoryInfo(
    val key: String,
    val label: String,
    val icon: ImageVector,
    val color: Color,
)

private val CATEGORIES = listOf(
    CategoryInfo("videos", "Videos", Icons.Outlined.Movie, Color(0xFF8E44AD)),
    CategoryInfo("images", "Images", Icons.Outlined.Image, Color(0xFF3390EC)),
    CategoryInfo("audio", "Audio", Icons.Outlined.Audiotrack, Color(0xFF27AE60)),
    CategoryInfo("archives", "Archives", Icons.Outlined.Archive, Color(0xFFF39C12)),
    CategoryInfo("documents", "Documents", Icons.Outlined.Description, Color(0xFF2C3E50)),
    CategoryInfo("other", "Other", Icons.Outlined.InsertDriveFile, Color(0xFF5B636A)),
)

@Composable
fun StorageStatsScreen(engine: TeleVaultEngine, onBack: () -> Unit, onMessage: (String) -> Unit) {
    var stats by remember { mutableStateOf<JSONObject?>(null) }
    var loading by remember { mutableStateOf(true) }

    LaunchedEffect(Unit) {
        stats = runCatching { engine.storageStats() }.getOrNull()
        loading = false
    }

    Column(
        modifier = Modifier
            .fillMaxSize()
            .background(MaterialTheme.colorScheme.background),
    ) {
        PreviewTopBar(title = "Storage stats", subtitle = "Across all folders", onBack = onBack)
        if (loading) {
            Box(Modifier.fillMaxSize(), contentAlignment = Alignment.Center) { CircularProgressIndicator() }
        } else {
            val data = stats
            if (data == null) {
                Box(Modifier.fillMaxSize(), contentAlignment = Alignment.Center) {
                    Text("Could not load stats", color = MaterialTheme.colorScheme.error)
                }
            } else {
                Column(
                    modifier = Modifier
                        .fillMaxSize()
                        .verticalScroll(rememberScrollState())
                        .padding(16.dp),
                    verticalArrangement = Arrangement.spacedBy(14.dp),
                ) {
                    // ── Total card ──────────────────────────────────
                    Card(
                        colors = CardDefaults.cardColors(
                            containerColor = MaterialTheme.colorScheme.primary,
                        ),
                        shape = RoundedCornerShape(20.dp),
                        modifier = Modifier.fillMaxWidth(),
                    ) {
                        Row(
                            modifier = Modifier.padding(20.dp),
                            verticalAlignment = Alignment.CenterVertically,
                        ) {
                            Box(
                                modifier = Modifier
                                    .size(52.dp)
                                    .background(Color.White.copy(alpha = 0.18f), RoundedCornerShape(16.dp)),
                                contentAlignment = Alignment.Center,
                            ) {
                                Icon(Icons.Outlined.CloudDone, contentDescription = null, tint = Color.White, modifier = Modifier.size(28.dp))
                            }
                            Spacer(Modifier.width(16.dp))
                            Column {
                                Text(
                                    formatBytes(data.optLong("total_size", 0)),
                                    style = MaterialTheme.typography.headlineMedium,
                                    fontWeight = FontWeight.Bold,
                                    color = Color.White,
                                )
                                Text(
                                    "${data.optLong("total_files", 0)} files encrypted in Telegram",
                                    style = MaterialTheme.typography.bodyMedium,
                                    color = Color.White.copy(alpha = 0.85f),
                                )
                            }
                        }
                    }

                    // ── Category breakdown ──────────────────────────
                    val categories = data.optJSONObject("categories") ?: JSONObject()
                    val totalSize = data.optLong("total_size", 0).coerceAtLeast(1)
                    CATEGORIES.forEach { category ->
                        val item = categories.optJSONObject(category.key) ?: JSONObject()
                        val files = item.optLong("files", 0)
                        val size = item.optLong("size", 0)
                        CategoryRow(category, files, size, totalSize)
                    }

                    // ── Largest files ───────────────────────────────
                    val largest = data.optJSONArray("largest_files")
                    if (largest != null && largest.length() > 0) {
                        SectionTitle("Largest files")
                        Card(
                            shape = RoundedCornerShape(18.dp),
                            colors = CardDefaults.cardColors(containerColor = MaterialTheme.colorScheme.surface),
                        ) {
                            Column(Modifier.padding(vertical = 6.dp)) {
                                for (i in 0 until largest.length()) {
                                    val item = largest.getJSONObject(i)
                                    Row(
                                        modifier = Modifier.fillMaxWidth().padding(horizontal = 16.dp, vertical = 8.dp),
                                        verticalAlignment = Alignment.CenterVertically,
                                    ) {
                                        Text(
                                            "${i + 1}",
                                            style = MaterialTheme.typography.labelLarge,
                                            color = MaterialTheme.colorScheme.onSurfaceVariant,
                                            modifier = Modifier.width(24.dp),
                                        )
                                        Icon(
                                            Icons.Outlined.FilePresent,
                                            contentDescription = null,
                                            tint = MaterialTheme.colorScheme.primary,
                                            modifier = Modifier.size(20.dp),
                                        )
                                        Spacer(Modifier.width(12.dp))
                                        Text(
                                            item.optString("name", "Untitled"),
                                            modifier = Modifier.weight(1f),
                                            maxLines = 1,
                                            style = MaterialTheme.typography.bodyMedium,
                                        )
                                        Text(
                                            formatBytes(item.optLong("size", 0)),
                                            style = MaterialTheme.typography.bodySmall,
                                            color = MaterialTheme.colorScheme.onSurfaceVariant,
                                        )
                                    }
                                }
                            }
                        }
                    }

                    // ── Folder usage ────────────────────────────────
                    val folderUsage = data.optJSONArray("folder_usage")
                    if (folderUsage != null && folderUsage.length() > 0) {
                        SectionTitle("Storage by folder")
                        Card(
                            shape = RoundedCornerShape(18.dp),
                            colors = CardDefaults.cardColors(containerColor = MaterialTheme.colorScheme.surface),
                        ) {
                            Column(Modifier.padding(vertical = 6.dp)) {
                                for (i in 0 until folderUsage.length()) {
                                    val item = folderUsage.getJSONObject(i)
                                    val size = item.optLong("size", 0)
                                    val files = item.optLong("files", 0)
                                    Row(
                                        modifier = Modifier.fillMaxWidth().padding(horizontal = 16.dp, vertical = 8.dp),
                                        verticalAlignment = Alignment.CenterVertically,
                                    ) {
                                        Icon(Icons.Outlined.Videocam, contentDescription = null, tint = MaterialTheme.colorScheme.secondary, modifier = Modifier.size(20.dp))
                                        Spacer(Modifier.width(12.dp))
                                        Column(Modifier.weight(1f)) {
                                            Text(item.optString("name", "Folder"), style = MaterialTheme.typography.bodyMedium, maxLines = 1)
                                            Text(
                                                "$files files",
                                                style = MaterialTheme.typography.labelSmall,
                                                color = MaterialTheme.colorScheme.onSurfaceVariant,
                                            )
                                        }
                                        Text(
                                            formatBytes(size),
                                            style = MaterialTheme.typography.bodySmall,
                                            color = MaterialTheme.colorScheme.onSurfaceVariant,
                                        )
                                    }
                                }
                            }
                        }
                    }

                    // ── Bandwidth ───────────────────────────────────
                    val bw = data.optJSONObject("bandwidth")
                    SectionTitle("Session bandwidth")
                    Row(horizontalArrangement = Arrangement.spacedBy(12.dp)) {
                        BandwidthPill(
                            icon = Icons.Outlined.UploadFile,
                            label = "Uploaded",
                            value = formatBytes(bw?.optLong("up_bytes", 0) ?: 0),
                            modifier = Modifier.weight(1f),
                        )
                        BandwidthPill(
                            icon = Icons.Outlined.Download,
                            label = "Downloaded",
                            value = formatBytes(bw?.optLong("down_bytes", 0) ?: 0),
                            modifier = Modifier.weight(1f),
                        )
                    }
                    Spacer(Modifier.height(8.dp))
                }
            }
        }
    }
}

@Composable
private fun CategoryRow(category: CategoryInfo, files: Long, size: Long, totalSize: Long) {
    val fraction = (size.toFloat() / totalSize).coerceIn(0f, 1f)
    Card(
        shape = RoundedCornerShape(16.dp),
        colors = CardDefaults.cardColors(containerColor = MaterialTheme.colorScheme.surface),
    ) {
        Row(
            modifier = Modifier.padding(horizontal = 16.dp, vertical = 12.dp),
            verticalAlignment = Alignment.CenterVertically,
        ) {
            Box(
                modifier = Modifier
                    .size(40.dp)
                    .background(category.color.copy(alpha = 0.14f), RoundedCornerShape(12.dp)),
                contentAlignment = Alignment.Center,
            ) {
                Icon(category.icon, contentDescription = null, tint = category.color, modifier = Modifier.size(22.dp))
            }
            Spacer(Modifier.width(12.dp))
            Column(Modifier.weight(1f)) {
                Row(verticalAlignment = Alignment.CenterVertically) {
                    Text(category.label, style = MaterialTheme.typography.bodyMedium, fontWeight = FontWeight.Medium, modifier = Modifier.weight(1f))
                    Text(
                        formatBytes(size),
                        style = MaterialTheme.typography.bodySmall,
                        color = MaterialTheme.colorScheme.onSurfaceVariant,
                    )
                }
                Spacer(Modifier.height(6.dp))
                LinearProgressIndicator(
                    progress = { fraction },
                    modifier = Modifier.fillMaxWidth().height(5.dp),
                    color = category.color,
                    trackColor = MaterialTheme.colorScheme.surfaceContainerHighest,
                )
            }
        }
    }
}

@Composable
private fun SectionTitle(text: String) {
    Text(
        text,
        style = MaterialTheme.typography.titleSmall,
        fontWeight = FontWeight.Bold,
        color = MaterialTheme.colorScheme.onSurfaceVariant,
        modifier = Modifier.padding(start = 4.dp, top = 4.dp),
    )
}

@Composable
private fun BandwidthPill(icon: ImageVector, label: String, value: String, modifier: Modifier = Modifier) {
    Card(
        modifier = modifier,
        shape = RoundedCornerShape(16.dp),
        colors = CardDefaults.cardColors(containerColor = MaterialTheme.colorScheme.surface),
    ) {
        Column(Modifier.padding(14.dp)) {
            Icon(icon, contentDescription = null, tint = MaterialTheme.colorScheme.primary)
            Spacer(Modifier.height(8.dp))
            Text(label, style = MaterialTheme.typography.labelSmall, color = MaterialTheme.colorScheme.onSurfaceVariant)
            Text(value, style = MaterialTheme.typography.titleMedium, fontWeight = FontWeight.SemiBold)
        }
    }
}

// ─────────────────────────────────────────────────────────────────────
//  Vault backup & restore
// ─────────────────────────────────────────────────────────────────────

@Composable
fun VaultRecoveryScreen(engine: TeleVaultEngine, onBack: () -> Unit, onMessage: (String) -> Unit) {
    val context = LocalContext.current
    val scope = rememberCoroutineScope()

    var exportPassword by remember { mutableStateOf("") }
    var importPassword by remember { mutableStateOf("") }
    var importPath by remember { mutableStateOf<String?>(null) }
    var busy by remember { mutableStateOf(false) }

    val exportLauncher = rememberLauncherForActivityResult(
        ActivityResultContracts.CreateDocument("application/octet-stream"),
    ) { uri: android.net.Uri? ->
        if (uri == null) return@rememberLauncherForActivityResult
        scope.launch {
            busy = true
            try {
                val cachePath = File(context.cacheDir, "televault-backup.tvault").absolutePath
                engine.exportVaultFile(exportPassword, cachePath)
                copyFileToUri(context, cachePath, uri)
                File(cachePath).delete()
                onMessage("Recovery file saved")
            } catch (e: Exception) {
                onMessage(e.message ?: "Export failed")
            }
            busy = false
        }
    }

    val importLauncher = rememberLauncherForActivityResult(
        ActivityResultContracts.GetContent(),
    ) { uri: android.net.Uri? ->
        if (uri == null) return@rememberLauncherForActivityResult
        scope.launch {
            busy = true
            try {
                importPath = copyUriToCache(context, uri, "recovery")
                onMessage("Backup file selected")
            } catch (e: Exception) {
                onMessage(e.message ?: "Could not read backup file")
            }
            busy = false
        }
    }

    Column(
        modifier = Modifier
            .fillMaxSize()
            .background(MaterialTheme.colorScheme.background),
    ) {
        PreviewTopBar(title = "Vault backup & restore", subtitle = "Recovery for your encryption key", onBack = onBack)
        Column(
            modifier = Modifier
                .fillMaxSize()
                .verticalScroll(rememberScrollState())
                .padding(16.dp),
            verticalArrangement = Arrangement.spacedBy(14.dp),
        ) {
            Text(
                "Your vault key encrypts every file. Keep a recovery file somewhere safe — " +
                    "without it, your files cannot be decrypted if this device is lost.",
                style = MaterialTheme.typography.bodyMedium,
                color = MaterialTheme.colorScheme.onSurfaceVariant,
            )

            // ── Export ─────────────────────────────────────────────
            Card(
                shape = RoundedCornerShape(18.dp),
                colors = CardDefaults.cardColors(containerColor = MaterialTheme.colorScheme.surface),
            ) {
                Column(Modifier.padding(18.dp)) {
                    Row(verticalAlignment = Alignment.CenterVertically) {
                        Icon(Icons.Outlined.UploadFile, contentDescription = null, tint = MaterialTheme.colorScheme.primary)
                        Spacer(Modifier.width(10.dp))
                        Text("Export recovery file", fontWeight = FontWeight.SemiBold, style = MaterialTheme.typography.titleMedium)
                    }
                    Spacer(Modifier.height(12.dp))
                    OutlinedTextField(
                        value = exportPassword,
                        onValueChange = { exportPassword = it },
                        label = { Text("New recovery password (12+ chars)") },
                        visualTransformation = PasswordVisualTransformation(),
                        singleLine = true,
                        modifier = Modifier.fillMaxWidth(),
                    )
                    Spacer(Modifier.height(12.dp))
                    Button(
                        onClick = { exportLauncher.launch("televault-backup.tvault") },
                        enabled = exportPassword.length >= 12 && !busy,
                        modifier = Modifier.fillMaxWidth(),
                    ) {
                        Text("Create recovery file")
                    }
                }
            }

            // ── Import ─────────────────────────────────────────────
            Card(
                shape = RoundedCornerShape(18.dp),
                colors = CardDefaults.cardColors(containerColor = MaterialTheme.colorScheme.surface),
            ) {
                Column(Modifier.padding(18.dp)) {
                    Row(verticalAlignment = Alignment.CenterVertically) {
                        Icon(Icons.Outlined.Key, contentDescription = null, tint = MaterialTheme.colorScheme.tertiary)
                        Spacer(Modifier.width(10.dp))
                        Text("Restore from backup", fontWeight = FontWeight.SemiBold, style = MaterialTheme.typography.titleMedium)
                    }
                    Spacer(Modifier.height(12.dp))
                    OutlinedButton(
                        onClick = { importLauncher.launch("*/*") },
                        enabled = !busy,
                        modifier = Modifier.fillMaxWidth(),
                    ) {
                        Text(importPath?.let { "Backup selected ✓" } ?: "Choose backup file…")
                    }
                    Spacer(Modifier.height(10.dp))
                    OutlinedTextField(
                        value = importPassword,
                        onValueChange = { importPassword = it },
                        label = { Text("Recovery password") },
                        visualTransformation = PasswordVisualTransformation(),
                        singleLine = true,
                        enabled = importPath != null,
                        modifier = Modifier.fillMaxWidth(),
                    )
                    Spacer(Modifier.height(12.dp))
                    Button(
                        onClick = {
                            scope.launch {
                                busy = true
                                try {
                                    engine.importVaultFile(importPassword, importPath ?: error("No backup selected"))
                                    importPassword = ""
                                    importPath = null
                                    onMessage("Vault restored successfully")
                                } catch (e: Exception) {
                                    onMessage(e.message ?: "Restore failed — wrong password?")
                                }
                                busy = false
                            }
                        },
                        enabled = importPath != null && importPassword.isNotBlank() && !busy,
                        modifier = Modifier.fillMaxWidth(),
                    ) {
                        Text("Restore vault")
                    }
                }
            }

            if (busy) {
                Box(Modifier.fillMaxWidth(), contentAlignment = Alignment.Center) {
                    CircularProgressIndicator(modifier = Modifier.size(28.dp))
                }
            }
            Spacer(Modifier.height(8.dp))
        }
    }
}

// ─────────────────────────────────────────────────────────────────────
//  About
// ─────────────────────────────────────────────────────────────────────

@Composable
fun AboutScreen(onBack: () -> Unit) {
    val context = LocalContext.current

    Column(
        modifier = Modifier
            .fillMaxSize()
            .background(MaterialTheme.colorScheme.background),
    ) {
        PreviewTopBar(title = "About TeleVault", subtitle = "Student research project", onBack = onBack)
        Column(
            modifier = Modifier
                .fillMaxSize()
                .verticalScroll(rememberScrollState())
                .padding(20.dp),
            horizontalAlignment = Alignment.CenterHorizontally,
        ) {
            Spacer(Modifier.height(8.dp))
            Box(
                modifier = Modifier
                    .size(80.dp)
                    .background(MaterialTheme.colorScheme.primary, RoundedCornerShape(26.dp)),
                contentAlignment = Alignment.Center,
            ) {
                Icon(Icons.Outlined.Lock, contentDescription = null, tint = MaterialTheme.colorScheme.onPrimary, modifier = Modifier.size(42.dp))
            }
            Spacer(Modifier.height(14.dp))
            Text("TeleVault", style = MaterialTheme.typography.headlineMedium, fontWeight = FontWeight.ExtraBold)
            Text(
                "Free unlimited encrypted cloud storage on your Telegram account",
                style = MaterialTheme.typography.bodyMedium,
                color = MaterialTheme.colorScheme.onSurfaceVariant,
                textAlign = TextAlign.Center,
                modifier = Modifier.padding(top = 4.dp),
            )
            Text(
                "A Liethueis-Foundation project",
                style = MaterialTheme.typography.labelMedium,
                fontWeight = FontWeight.SemiBold,
                color = MaterialTheme.colorScheme.primary,
                modifier = Modifier.padding(top = 6.dp),
            )
            Spacer(Modifier.height(20.dp))

            FeatureRow(Icons.Outlined.Shield, "AES-256-GCM encryption", "Files are split into encrypted blocks before they ever leave your device.")
            FeatureRow(Icons.Outlined.Lock, "Your key stays local", "Only the vault key on this device can decrypt your data — not even Telegram.")
            FeatureRow(Icons.Outlined.CloudDone, "Unlimited storage", "Use your own Telegram account storage for free, with no size quotas.")
            FeatureRow(Icons.Outlined.Description, "Streaming playback", "Watch videos and listen to audio without downloading.")

            // ── About us ───────────────────────────────────────────
            Spacer(Modifier.height(12.dp))
            Card(
                shape = RoundedCornerShape(18.dp),
                colors = CardDefaults.cardColors(containerColor = MaterialTheme.colorScheme.surface),
                modifier = Modifier.fillMaxWidth(),
            ) {
                Column(Modifier.padding(18.dp)) {
                    Text("About us", style = MaterialTheme.typography.titleMedium, fontWeight = FontWeight.Bold)
                    Spacer(Modifier.height(8.dp))
                    Text(
                        "TeleVault is a personal encrypted vault experiment built to explore user-side " +
                            "file encryption, Telegram account storage, recovery keys, and cross-device " +
                            "access. It is transparent by design and intended for education, research, and " +
                            "personal learning — not a commercial service.",
                        style = MaterialTheme.typography.bodyMedium,
                        color = MaterialTheme.colorScheme.onSurfaceVariant,
                    )
                    HorizontalDivider(color = MaterialTheme.colorScheme.outline.copy(alpha = 0.2f), modifier = Modifier.padding(vertical = 14.dp))
                    Text("Credits", style = MaterialTheme.typography.titleSmall, fontWeight = FontWeight.Bold)
                    Spacer(Modifier.height(6.dp))
                    Text(
                        "Built by Liethueis-Foundation © 2026.",
                        style = MaterialTheme.typography.bodySmall,
                    )
                    Spacer(Modifier.height(4.dp))
                    Text(
                        "TeleVault rewrites the Telegram-as-a-drive concept with its own encrypted " +
                            "vault, manifest, and recovery design.",
                        style = MaterialTheme.typography.bodySmall,
                        color = MaterialTheme.colorScheme.onSurfaceVariant,
                    )
                }
            }

            // ── The company ────────────────────────────────────────
            Spacer(Modifier.height(12.dp))
            Card(
                shape = RoundedCornerShape(18.dp),
                colors = CardDefaults.cardColors(containerColor = MaterialTheme.colorScheme.surface),
                modifier = Modifier.fillMaxWidth(),
            ) {
                Column(Modifier.padding(18.dp)) {
                    Row(verticalAlignment = Alignment.CenterVertically) {
                        Box(
                            modifier = Modifier
                                .size(40.dp)
                                .background(MaterialTheme.colorScheme.primaryContainer, RoundedCornerShape(12.dp)),
                            contentAlignment = Alignment.Center,
                        ) {
                            Icon(
                                Icons.Outlined.Foundation,
                                contentDescription = null,
                                tint = MaterialTheme.colorScheme.primary,
                                modifier = Modifier.size(22.dp),
                            )
                        }
                        Spacer(Modifier.width(12.dp))
                        Column {
                            Text("Liethueis-Foundation", style = MaterialTheme.typography.titleMedium, fontWeight = FontWeight.Bold)
                            Text(
                                "The company behind TeleVault",
                                style = MaterialTheme.typography.labelSmall,
                                color = MaterialTheme.colorScheme.onSurfaceVariant,
                            )
                        }
                    }
                    Spacer(Modifier.height(12.dp))
                    Text(
                        "Liethueis-Foundation is the independent research initiative behind TeleVault — " +
                            "focused on encrypted storage, data ownership, and privacy-first software for " +
                            "everyone.",
                        style = MaterialTheme.typography.bodyMedium,
                        color = MaterialTheme.colorScheme.onSurfaceVariant,
                    )
                    Spacer(Modifier.height(12.dp))
                    Text(
                        "© 2026 Liethueis-Foundation. All rights reserved.",
                        style = MaterialTheme.typography.labelSmall,
                        color = MaterialTheme.colorScheme.outline,
                    )
                }
            }

            // ── Important notice ────────────────────────────────────
            Spacer(Modifier.height(12.dp))
            Card(
                shape = RoundedCornerShape(18.dp),
                colors = CardDefaults.cardColors(
                    containerColor = MaterialTheme.colorScheme.tertiaryContainer,
                ),
                modifier = Modifier.fillMaxWidth(),
            ) {
                Column(Modifier.padding(18.dp)) {
                    Text(
                        "Important notice",
                        style = MaterialTheme.typography.titleSmall,
                        fontWeight = FontWeight.Bold,
                        color = MaterialTheme.colorScheme.onTertiaryContainer,
                    )
                    Spacer(Modifier.height(6.dp))
                    Text(
                        "TeleVault is not an official Telegram project and is not endorsed by Telegram. " +
                            "Use it responsibly, follow Telegram's terms, and keep independent backups of " +
                            "important files. No warranty is provided.",
                        style = MaterialTheme.typography.bodySmall,
                        color = MaterialTheme.colorScheme.onTertiaryContainer.copy(alpha = 0.8f),
                    )
                }
            }

            // ── GitHub / contact ────────────────────────────────────
            Spacer(Modifier.height(16.dp))
            Row(horizontalArrangement = Arrangement.spacedBy(12.dp)) {
                OutlinedButton(
                    onClick = {
                        val ok = runCatching {
                            context.startActivity(Intent(Intent.ACTION_VIEW, Uri.parse("https://github.com/Skyh-23")))
                        }.isSuccess
                        if (!ok) Toast.makeText(context, "No app available to open this link", Toast.LENGTH_SHORT).show()
                    },
                    modifier = Modifier.weight(1f),
                ) {
                    Icon(Icons.Outlined.Code, contentDescription = null, modifier = Modifier.size(18.dp))
                    Spacer(Modifier.width(8.dp))
                    Text("GitHub")
                }
                Button(
                    onClick = {
                        val ok = runCatching {
                            context.startActivity(Intent(Intent.ACTION_SENDTO, Uri.parse("mailto:sumrahiren020@gmail.com")))
                        }.isSuccess
                        if (!ok) Toast.makeText(context, "No email app available", Toast.LENGTH_SHORT).show()
                    },
                    modifier = Modifier.weight(1f),
                ) {
                    Icon(Icons.Outlined.Email, contentDescription = null, modifier = Modifier.size(18.dp))
                    Spacer(Modifier.width(8.dp))
                    Text("Contact")
                }
            }

            Spacer(Modifier.height(20.dp))
            Text(
                "TeleVault Mobile 1.0.0 · sumrahiren020@gmail.com",
                style = MaterialTheme.typography.labelSmall,
                color = MaterialTheme.colorScheme.outline,
                textAlign = TextAlign.Center,
            )
        }
    }
}

@Composable
private fun FeatureRow(icon: ImageVector, title: String, body: String) {
    Row(
        modifier = Modifier
            .fillMaxWidth()
            .padding(vertical = 10.dp),
    ) {
        Box(
            modifier = Modifier
                .size(44.dp)
                .background(MaterialTheme.colorScheme.primaryContainer, RoundedCornerShape(14.dp)),
            contentAlignment = Alignment.Center,
        ) {
            Icon(icon, contentDescription = null, tint = MaterialTheme.colorScheme.primary, modifier = Modifier.size(24.dp))
        }
        Spacer(Modifier.width(14.dp))
        Column(Modifier.weight(1f)) {
            Text(title, style = MaterialTheme.typography.bodyLarge, fontWeight = FontWeight.Medium)
            Text(body, style = MaterialTheme.typography.bodySmall, color = MaterialTheme.colorScheme.onSurfaceVariant)
        }
    }
}
