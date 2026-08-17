package org.liethueis.televault

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
import androidx.compose.foundation.layout.imePadding
import androidx.compose.foundation.layout.padding
import androidx.compose.foundation.layout.size
import androidx.compose.foundation.layout.width
import androidx.compose.foundation.rememberScrollState
import androidx.compose.foundation.shape.RoundedCornerShape
import androidx.compose.foundation.verticalScroll
import androidx.compose.material.icons.Icons
import androidx.compose.material.icons.automirrored.outlined.ArrowBack
import androidx.compose.material.icons.outlined.ContentCopy
import androidx.compose.material.icons.outlined.Download
import androidx.compose.material.icons.outlined.Key
import androidx.compose.material.icons.outlined.Link
import androidx.compose.material.icons.outlined.Refresh
import androidx.compose.material.icons.outlined.Shield
import androidx.compose.material3.AlertDialog
import androidx.compose.material3.Button
import androidx.compose.material3.Checkbox
import androidx.compose.material3.CircularProgressIndicator
import androidx.compose.material3.ExperimentalMaterial3Api
import androidx.compose.material3.Icon
import androidx.compose.material3.IconButton
import androidx.compose.material3.LinearProgressIndicator
import androidx.compose.material3.MaterialTheme
import androidx.compose.material3.ModalBottomSheet
import androidx.compose.material3.OutlinedTextField
import androidx.compose.material3.Scaffold
import androidx.compose.material3.Text
import androidx.compose.material3.TextButton
import androidx.compose.material3.TopAppBar
import androidx.compose.material3.rememberModalBottomSheetState
import androidx.compose.runtime.Composable
import androidx.compose.runtime.getValue
import androidx.compose.runtime.mutableStateOf
import androidx.compose.runtime.remember
import androidx.compose.runtime.rememberCoroutineScope
import androidx.compose.runtime.setValue
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.platform.LocalContext
import androidx.compose.ui.platform.LocalClipboardManager
import androidx.compose.ui.text.AnnotatedString
import androidx.compose.ui.text.font.FontWeight
import androidx.compose.ui.text.style.TextAlign
import androidx.compose.ui.unit.dp
import kotlinx.coroutines.launch
import org.json.JSONObject
import java.io.File

// ─────────────────────────────────────────────────────────────────────
//  Sharer side: create a channel-based E2E share
// ─────────────────────────────────────────────────────────────────────

private const val ACCESS_KEY_PREFIX = "SKYH256:"
private const val ACCESS_KEY_CHARS =
    "ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789\$%&*()!+-_=?@#"

private fun generateAccessKey(): String {
    val random = StringBuilder()
    repeat(20) {
        random.append(ACCESS_KEY_CHARS[Math.floor(Math.random() * ACCESS_KEY_CHARS.length).toInt()])
    }
    return ACCESS_KEY_PREFIX + random
}

@OptIn(ExperimentalMaterial3Api::class)
@Composable
fun ChannelShareSheet(
    file: TeleFile,
    folderId: Long?,
    engine: TeleVaultEngine,
    onMessage: (String) -> Unit,
    onDismiss: () -> Unit,
) {
    val sheetState = rememberModalBottomSheetState(skipPartiallyExpanded = true)
    val scope = rememberCoroutineScope()
    val context = LocalContext.current
    val clipboard = LocalClipboardManager.current

    var password by remember { mutableStateOf("") }
    var expiryHours by remember { mutableStateOf("24") }
    var strong by remember { mutableStateOf(false) }
    var accessKey by remember { mutableStateOf(generateAccessKey()) }
    var creating by remember { mutableStateOf(false) }
    var shareLink by remember { mutableStateOf<String?>(null) }
    var error by remember { mutableStateOf<String?>(null) }

    fun copyLink(link: String) {
        clipboard.setText(AnnotatedString(link))
        Toast.makeText(context, "Share link copied", Toast.LENGTH_SHORT).show()
    }

    ModalBottomSheet(onDismissRequest = onDismiss, sheetState = sheetState) {
        Column(Modifier.fillMaxWidth().padding(start = 20.dp, end = 20.dp, bottom = 28.dp)) {
            Row(verticalAlignment = Alignment.CenterVertically) {
                Box(
                    modifier = Modifier
                        .size(44.dp)
                        .background(MaterialTheme.colorScheme.primaryContainer, RoundedCornerShape(14.dp)),
                    contentAlignment = Alignment.Center,
                ) {
                    Icon(Icons.Outlined.Shield, contentDescription = null, tint = MaterialTheme.colorScheme.primary)
                }
                Spacer(Modifier.width(12.dp))
                Column {
                    Text("E2E channel share", style = MaterialTheme.typography.titleMedium, fontWeight = FontWeight.SemiBold)
                    Text(file.name, style = MaterialTheme.typography.bodySmall, color = MaterialTheme.colorScheme.onSurfaceVariant, maxLines = 1)
                }
            }

            Spacer(Modifier.height(18.dp))

            if (shareLink != null) {
                Text("Share this link with anyone. They'll join with their own TeleVault account and enter the password to unlock the file.", style = MaterialTheme.typography.bodySmall, color = MaterialTheme.colorScheme.onSurfaceVariant)
                if (strong && accessKey.isNotBlank()) {
                    Spacer(Modifier.height(8.dp))
                    OutlinedTextField(
                        value = accessKey,
                        onValueChange = {},
                        readOnly = true,
                        label = { Text("Access key — share separately") },
                        singleLine = true,
                        modifier = Modifier.fillMaxWidth(),
                    )
                }
                Spacer(Modifier.height(12.dp))
                OutlinedTextField(
                    value = shareLink.orEmpty(),
                    onValueChange = {},
                    readOnly = true,
                    modifier = Modifier.fillMaxWidth(),
                    minLines = 2,
                )
                Spacer(Modifier.height(12.dp))
                Button(onClick = { shareLink?.let { copyLink(it) } }, modifier = Modifier.fillMaxWidth()) {
                    Icon(Icons.Outlined.ContentCopy, contentDescription = null, modifier = Modifier.size(18.dp))
                    Spacer(Modifier.width(8.dp))
                    Text("Copy link")
                }
                Spacer(Modifier.height(8.dp))
                TextButton(onClick = { shareLink = null }, modifier = Modifier.fillMaxWidth()) {
                    Text("Create another share")
                }
                return@ModalBottomSheet
            }

            OutlinedTextField(
                value = password,
                onValueChange = { password = it },
                label = { Text("Share password (required)") },
                supportingText = { Text("At least 12 characters — the recipient needs it to unlock") },
                singleLine = true,
                modifier = Modifier.fillMaxWidth(),
            )
            Spacer(Modifier.height(12.dp))
            Row(verticalAlignment = Alignment.CenterVertically) {
                Checkbox(checked = strong, onCheckedChange = { strong = it })
                Spacer(Modifier.width(8.dp))
                Text("Strong share — also require a SKYH256 access key", style = MaterialTheme.typography.bodySmall)
            }
            if (strong) {
                Spacer(Modifier.height(8.dp))
                OutlinedTextField(
                    value = accessKey,
                    onValueChange = {},
                    readOnly = true,
                    label = { Text("Access key (SKYH256:…) — share separately") },
                    singleLine = true,
                    modifier = Modifier.fillMaxWidth(),
                    trailingIcon = {
                        IconButton(onClick = { accessKey = generateAccessKey() }) {
                            Icon(Icons.Outlined.Refresh, contentDescription = "Regenerate access key")
                        }
                    },
                )
            }
            Spacer(Modifier.height(12.dp))
            OutlinedTextField(
                value = expiryHours,
                onValueChange = { expiryHours = it.filter { c -> c.isDigit() } },
                label = { Text("Expiry (hours)") },
                singleLine = true,
                modifier = Modifier.fillMaxWidth(),
            )

            if (error != null) {
                Spacer(Modifier.height(12.dp))
                Text(error.orEmpty(), color = MaterialTheme.colorScheme.error, style = MaterialTheme.typography.bodySmall)
            }

            Spacer(Modifier.height(18.dp))
            Button(
                onClick = {
                    scope.launch {
                        creating = true
                        error = null
                        val hours = expiryHours.toLongOrNull()
                        try {
                            if (password.length < 12) throw IllegalArgumentException("Share password must be at least 12 characters")
                            if (hours == null || hours <= 0) throw IllegalArgumentException("Expiry must be greater than 0 hours")
                            val result = engine.createChannelShare(file.id, folderId, password, hours * 3600L, accessKey = if (strong) accessKey else "")
                            shareLink = result.optString("link")
                            onMessage(if (strong) "Strong E2E share created (link + access key + password)" else "Encrypted channel share created")
                        } catch (e: Exception) {
                            error = e.message ?: "Failed to create share"
                        } finally {
                            creating = false
                        }
                    }
                },
                enabled = !creating,
                modifier = Modifier.fillMaxWidth(),
            ) {
                if (creating) {
                    CircularProgressIndicator(modifier = Modifier.size(18.dp), strokeWidth = 2.dp)
                    Spacer(Modifier.width(8.dp))
                    Text("Creating share…")
                } else {
                    Icon(Icons.Outlined.Link, contentDescription = null, modifier = Modifier.size(18.dp))
                    Spacer(Modifier.width(8.dp))
                    Text("Create share")
                }
            }
            Spacer(Modifier.height(6.dp))
            TextButton(onClick = onDismiss, modifier = Modifier.fillMaxWidth()) {
                Text("Cancel")
            }
        }
    }
}

// ─────────────────────────────────────────────────────────────────────
//  Recipient side: open a shared link
// ─────────────────────────────────────────────────────────────────────

@OptIn(ExperimentalMaterial3Api::class)
@Composable
fun OpenLinkScreen(
    engine: TeleVaultEngine,
    onBack: () -> Unit,
    onMessage: (String) -> Unit,
) {
    val context = LocalContext.current
    val scope = rememberCoroutineScope()
    val clipboard = LocalClipboardManager.current

    var link by remember { mutableStateOf("") }
    var password by remember { mutableStateOf("") }
    var accessKey by remember { mutableStateOf("") }
    var joining by remember { mutableStateOf(false) }
    var joinedFile by remember { mutableStateOf<JSONObject?>(null) }
    var error by remember { mutableStateOf<String?>(null) }
    var assembling by remember { mutableStateOf(false) }
    var progress by remember { mutableStateOf(0f) }
    var targetFile by remember { mutableStateOf<String?>(null) }
    var pendingSavePath by remember { mutableStateOf<String?>(null) }

    val saveLauncher = rememberLauncherForActivityResult(
        ActivityResultContracts.CreateDocument("application/octet-stream"),
    ) { uri ->
        val path = pendingSavePath
        pendingSavePath = null
        if (uri == null || path == null) return@rememberLauncherForActivityResult
        scope.launch {
            runCatching { copyFileToUri(context, path, uri) }
                .onSuccess {
                    File(path).delete()
                    onMessage("Shared file saved")
                }
                .onFailure { e ->
                    File(path).delete()
                    onMessage(e.message ?: "Save failed")
                }
        }
    }

    fun assemble(name: String) {
        val joined = joinedFile ?: return
        scope.launch {
            assembling = true
            progress = 0f
            error = null
            try {
                val blocks = joined.optJSONArray("blocks")
                val blockCount = blocks?.length() ?: 0
                if (blockCount == 0) throw IllegalStateException("Shared file has no blocks")
                val parts = ArrayList<ByteArray>(blockCount)
                for (i in 0 until blockCount) {
                    val block = engine.shareDownloadBlock(link, password, i, accessKey)
                    if (block.isEmpty()) throw IllegalStateException("Block $i came back empty")
                    parts.add(block)
                    progress = (i + 1) / blockCount.toFloat()
                }
                val safeName = name.replace(Regex("[^A-Za-z0-9._-]"), "_")
                val out = File(context.cacheDir, "shared/$safeName")
                out.parentFile?.mkdirs()
                out.outputStream().use { stream ->
                    parts.forEach { stream.write(it) }
                }
                pendingSavePath = out.absolutePath
                targetFile = name
                saveLauncher.launch(name)
            } catch (e: Exception) {
                error = e.message ?: "Failed to receive file"
            } finally {
                assembling = false
            }
        }
    }

    fun pasteLink() {
        val text = clipboard.getText()?.text.orEmpty()
        if (text.isNotBlank() && text.contains("televault://")) {
            link = text.trim()
        }
    }

    fun requiresAccessKey(linkText: String): Boolean =
        Regex("[?&]ak=1([&\\s]|\$").containsMatchIn(linkText)

    Scaffold(
        topBar = {
            TopAppBar(
                title = { Text("Open a shared link") },
                navigationIcon = {
                    IconButton(onClick = onBack) {
                        Icon(Icons.AutoMirrored.Outlined.ArrowBack, contentDescription = "Back")
                    }
                },
            )
        },
    ) { padding ->
        Column(
            modifier = Modifier
                .fillMaxSize()
                .padding(padding)
                .verticalScroll(rememberScrollState())
                .padding(20.dp)
                .imePadding(),
        ) {
            if (joinedFile == null) {
                // ── Enter link + password ──────────────────────────
                Text(
                    "Paste a TeleVault share link and enter the password. Your own Telegram account joins the share channel to receive the file.",
                    style = MaterialTheme.typography.bodyMedium,
                    color = MaterialTheme.colorScheme.onSurfaceVariant,
                )
                Spacer(Modifier.height(16.dp))
                OutlinedTextField(
                    value = link,
                    onValueChange = { link = it },
                    label = { Text("televault://share… link") },
                    supportingText = { Text("Links look like televault://share?rid=…&exp=…&inv=…&mid=…") },
                    modifier = Modifier.fillMaxWidth(),
                    minLines = 2,
                )
                Spacer(Modifier.height(8.dp))
                TextButton(onClick = ::pasteLink) {
                    Icon(Icons.Outlined.ContentCopy, contentDescription = null, modifier = Modifier.size(16.dp))
                    Spacer(Modifier.width(6.dp))
                    Text("Paste from clipboard")
                }
                Spacer(Modifier.height(12.dp))
                OutlinedTextField(
                    value = password,
                    onValueChange = { password = it },
                    label = { Text("Share password") },
                    singleLine = true,
                    modifier = Modifier.fillMaxWidth(),
                )

                if (requiresAccessKey(link)) {
                    Spacer(Modifier.height(12.dp))
                    OutlinedTextField(
                        value = accessKey,
                        onValueChange = { accessKey = it },
                        label = { Text("Access key (SKYH256:…)") },
                        singleLine = true,
                        modifier = Modifier.fillMaxWidth(),
                    )
                }

                if (error != null) {
                    Spacer(Modifier.height(12.dp))
                    Text(error.orEmpty(), color = MaterialTheme.colorScheme.error, style = MaterialTheme.typography.bodySmall)
                }

                Spacer(Modifier.height(20.dp))
                Button(
                    onClick = {
                        val trimmed = link.trim()
                        if (!trimmed.startsWith("televault://share")) {
                            error = "This doesn't look like a channel-share link. Channel-share links start with televault://share?rid=… Make sure the sharer used the \"Channel share\" option."
                            return@Button
                        }
                        if (requiresAccessKey(trimmed) && accessKey.isBlank()) {
                            error = "This share requires the SKYH256 access key"
                            return@Button
                        }
                        scope.launch {
                            joining = true
                            error = null
                            try {
                                val result = engine.joinChannelShare(trimmed, password, accessKey)
                                joinedFile = result.optJSONObject("file")
                                onMessage("Link unlocked")
                            } catch (e: Exception) {
                                error = e.message ?: "Could not open link"
                            } finally {
                                joining = false
                            }
                        }
                    },
                    enabled = !joining && link.isNotBlank() && password.isNotBlank(),
                    modifier = Modifier.fillMaxWidth(),
                ) {
                    if (joining) {
                        CircularProgressIndicator(modifier = Modifier.size(18.dp), strokeWidth = 2.dp)
                        Spacer(Modifier.width(8.dp))
                        Text("Unlocking…")
                    } else {
                        Icon(Icons.Outlined.Key, contentDescription = null, modifier = Modifier.size(18.dp))
                        Spacer(Modifier.width(8.dp))
                        Text("Unlock & join")
                    }
                }
            } else {
                // ── Received file ───────────────────────────────────
                val fileObj = joinedFile
                val name = fileObj?.optString("name") ?: "Shared file"
                val size = fileObj?.optLong("size") ?: 0L
                val blockCount = fileObj?.optJSONArray("blocks")?.length() ?: 0

                Row(verticalAlignment = Alignment.CenterVertically) {
                    Box(
                        modifier = Modifier
                            .size(52.dp)
                            .background(MaterialTheme.colorScheme.primaryContainer, RoundedCornerShape(16.dp)),
                        contentAlignment = Alignment.Center,
                    ) {
                        Icon(Icons.Outlined.Shield, contentDescription = null, tint = MaterialTheme.colorScheme.primary, modifier = Modifier.size(26.dp))
                    }
                    Spacer(Modifier.width(14.dp))
                    Column(Modifier.weight(1f)) {
                        Text(name, style = MaterialTheme.typography.titleMedium, fontWeight = FontWeight.SemiBold)
                        Text(
                            "${formatBytes(size)}  •  $blockCount block${if (blockCount == 1) "" else "s"}",
                            style = MaterialTheme.typography.bodySmall,
                            color = MaterialTheme.colorScheme.onSurfaceVariant,
                        )
                    }
                }

                if (assembling) {
                    Spacer(Modifier.height(20.dp))
                    Text("Decrypting blocks from the channel…", style = MaterialTheme.typography.bodySmall)
                    Spacer(Modifier.height(8.dp))
                    LinearProgressIndicator(progress = { progress }, modifier = Modifier.fillMaxWidth())
                } else {
                    Spacer(Modifier.height(20.dp))
                    Button(onClick = { assemble(name) }, modifier = Modifier.fillMaxWidth()) {
                        Icon(Icons.Outlined.Download, contentDescription = null, modifier = Modifier.size(18.dp))
                        Spacer(Modifier.width(8.dp))
                        Text("Receive file")
                    }
                    Spacer(Modifier.height(8.dp))
                    TextButton(
                        onClick = {
                            joinedFile = null
                            link = ""
                            password = ""
                            accessKey = ""
                            error = null
                        },
                        modifier = Modifier.fillMaxWidth(),
                    ) {
                        Text("Open another link")
                    }
                }

                if (error != null) {
                    Spacer(Modifier.height(12.dp))
                    Text(error.orEmpty(), color = MaterialTheme.colorScheme.error, style = MaterialTheme.typography.bodySmall)
                }
            }
        }
    }
}
