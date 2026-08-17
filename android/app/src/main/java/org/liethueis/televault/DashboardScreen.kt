package org.liethueis.televault

import android.net.Uri
import android.os.Build
import android.util.Base64
import androidx.activity.compose.rememberLauncherForActivityResult
import androidx.activity.result.contract.ActivityResultContracts
import androidx.compose.foundation.ExperimentalFoundationApi
import androidx.compose.foundation.background
import androidx.compose.foundation.clickable
import androidx.compose.foundation.layout.Arrangement
import androidx.compose.foundation.layout.Box
import androidx.compose.foundation.layout.Column
import androidx.compose.foundation.layout.PaddingValues
import androidx.compose.foundation.layout.Row
import androidx.compose.foundation.layout.Spacer
import androidx.compose.foundation.layout.fillMaxSize
import androidx.compose.foundation.layout.fillMaxWidth
import androidx.compose.foundation.layout.height
import androidx.compose.foundation.layout.imePadding
import androidx.compose.foundation.layout.padding
import androidx.compose.foundation.layout.size
import androidx.compose.foundation.layout.width
import androidx.compose.foundation.lazy.LazyColumn
import androidx.compose.foundation.lazy.grid.GridCells
import androidx.compose.foundation.rememberScrollState
import androidx.compose.foundation.verticalScroll
import androidx.compose.foundation.lazy.grid.LazyVerticalGrid
import androidx.compose.foundation.lazy.grid.items
import androidx.compose.foundation.lazy.items
import androidx.compose.foundation.lazy.rememberLazyListState
import androidx.compose.foundation.shape.RoundedCornerShape
import androidx.compose.material.icons.Icons
import androidx.compose.material.icons.outlined.Add
import androidx.compose.material.icons.outlined.Cloud
import androidx.compose.material.icons.outlined.CloudDone
import androidx.compose.material.icons.outlined.CloudSync
import androidx.compose.material.icons.outlined.Close
import androidx.compose.material.icons.outlined.CreateNewFolder
import androidx.compose.material.icons.outlined.Delete
import androidx.compose.material.icons.outlined.Download
import androidx.compose.material.icons.outlined.DriveFileMove
import androidx.compose.material.icons.outlined.Edit
import androidx.compose.material.icons.outlined.Folder
import androidx.compose.material.icons.outlined.GridView
import androidx.compose.material.icons.outlined.Info
import androidx.compose.material.icons.outlined.HelpOutline
import androidx.compose.material.icons.outlined.Key
import androidx.compose.material.icons.outlined.Link
import androidx.compose.material.icons.outlined.Lock
import androidx.compose.material.icons.outlined.Logout
import androidx.compose.material.icons.outlined.Share
import androidx.compose.material.icons.outlined.Menu
import androidx.compose.material.icons.outlined.MoreVert
import androidx.compose.material.icons.outlined.Search
import androidx.compose.material.icons.outlined.Settings
import androidx.compose.material.icons.outlined.ViewAgenda
import androidx.compose.material.icons.outlined.Visibility
import androidx.compose.material.icons.outlined.WarningAmber
import androidx.compose.material3.Button
import androidx.compose.material3.CircularProgressIndicator
import androidx.compose.material3.DrawerValue
import androidx.compose.material3.ExperimentalMaterial3Api
import androidx.compose.material3.FloatingActionButton
import androidx.compose.material3.HorizontalDivider
import androidx.compose.material3.Icon
import androidx.compose.material3.IconButton
import androidx.compose.material3.MaterialTheme
import androidx.compose.material3.ModalBottomSheet
import androidx.compose.material3.ModalDrawerSheet
import androidx.compose.material3.ModalNavigationDrawer
import androidx.compose.material3.NavigationDrawerItem
import androidx.compose.material3.OutlinedTextField
import androidx.compose.material3.Scaffold
import androidx.compose.material3.Switch
import androidx.compose.material3.Text
import androidx.compose.material3.TextButton
import androidx.compose.material3.TopAppBar
import androidx.compose.material3.TopAppBarDefaults
import androidx.compose.material3.rememberDrawerState
import androidx.compose.material3.rememberModalBottomSheetState
import androidx.compose.runtime.Composable
import androidx.compose.runtime.LaunchedEffect
import androidx.compose.runtime.getValue
import androidx.compose.runtime.mutableStateOf
import androidx.compose.runtime.remember
import androidx.compose.runtime.rememberCoroutineScope
import androidx.compose.runtime.setValue
import androidx.compose.runtime.snapshots.SnapshotStateList
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.graphics.Color
import androidx.compose.ui.platform.LocalContext
import androidx.compose.ui.text.font.FontWeight
import androidx.compose.ui.text.style.TextAlign
import androidx.compose.ui.unit.dp
import kotlinx.coroutines.CoroutineScope
import kotlinx.coroutines.Job
import kotlinx.coroutines.delay
import kotlinx.coroutines.isActive
import kotlinx.coroutines.launch
import java.io.File

// ─────────────────────────────────────────────────────────────────────
//  Transfer tracker (owned by the activity so transfers survive navigation)
// ─────────────────────────────────────────────────────────────────────

class TransferTracker {
    val items: SnapshotStateList<TransferItem> = androidx.compose.runtime.mutableStateListOf()

    fun add(item: TransferItem) {
        // Deterministic download IDs can already exist (a retry of a failed
        // transfer) — replace instead of duplicating.
        val index = items.indexOfFirst { it.transferId == item.transferId }
        if (index >= 0) items[index] = item else items.add(0, item)
    }

    fun update(id: String, transform: (TransferItem) -> TransferItem) {
        val index = items.indexOfFirst { it.transferId == id }
        if (index >= 0) items[index] = transform(items[index])
    }
}

@OptIn(ExperimentalMaterial3Api::class, ExperimentalFoundationApi::class)
@Composable
fun DashboardScreen(
    engine: TeleVaultEngine,
    transfers: TransferTracker,
    coroutineScope: CoroutineScope,
    darkTheme: Boolean,
    onToggleTheme: () -> Unit,
    activeFolderId: Long?,
    onActiveFolderChanged: (Long?) -> Unit,
    onOpenFile: (TeleFile, Long?) -> Unit,
    onNavigate: (AppScreen) -> Unit,
    onSessionExpired: () -> Unit,
    onMessage: (String) -> Unit,
) {
    val context = LocalContext.current
    val scope = coroutineScope
    val drawerState = rememberDrawerState(DrawerValue.Closed)

    var folders by remember { mutableStateOf(listOf(TeleFolder(null, "Saved Messages"))) }
    var files by remember { mutableStateOf(emptyList<TeleFile>()) }
    var loading by remember { mutableStateOf(true) }
    var refreshing by remember { mutableStateOf(false) }

    var searchQuery by remember { mutableStateOf("") }
    var searching by remember { mutableStateOf(false) }
    var gridMode by remember { mutableStateOf(true) }

    var selection by remember { mutableStateOf(setOf<Long>()) }
    val selecting = selection.isNotEmpty()

    var showNewFolderDialog by remember { mutableStateOf(false) }
    var folderToDelete by remember { mutableStateOf<TeleFolder?>(null) }
    var showDeleteFolderDialog by remember { mutableStateOf(false) }
    var showMoveDialog by remember { mutableStateOf(false) }
    var showDeleteFilesDialog by remember { mutableStateOf(false) }
    var showLogoutDialog by remember { mutableStateOf(false) }
    var showDetailSheetFor by remember { mutableStateOf<TeleFile?>(null) }
    var showChannelShareFor by remember { mutableStateOf<TeleFile?>(null) }
    var showPasswordDialogFor by remember { mutableStateOf<TeleFile?>(null) }
    var pendingDownload by remember { mutableStateOf<TeleFile?>(null) }
    var pendingPassword by remember { mutableStateOf<String?>(null) }
    var renameTarget by remember { mutableStateOf<TeleFile?>(null) }
    var askBatchPassword by remember { mutableStateOf<List<TeleFile>?>(null) }

    var bandwidth by remember { mutableStateOf<Pair<Long, Long>?>(null) }
    var vaultMismatch by remember { mutableStateOf(false) }

    // ── Data loading ────────────────────────────────────────────────
    suspend fun load(initial: Boolean, fromCache: Boolean = false) {
        // When a cached snapshot was just applied, refresh quietly in the
        // background instead of blanking the screen with a full spinner.
        if (initial && files.isEmpty() && !fromCache) loading = true else refreshing = true
        try {
            val sync = engine.syncAll()
            folders = listOf(TeleFolder(null, "Saved Messages")) + sync.folders
            files = sync.files
            vaultMismatch = sync.vaultMismatch
        } catch (e: Exception) {
            if (e is TeleVaultEngine.SessionExpired) {
                onSessionExpired()
                return
            }
            onMessage(e.message ?: "Failed to load vault")
        }
        loading = false
        refreshing = false
    }

    // True when the local listing snapshot is fresh enough to trust without
    // re-scanning Telegram (matches the Windows behaviour of showing files
    // instantly after navigating back from a preview).
    //
    // 10 minutes (not 60s): the background re-scan downloads + decrypts every
    // manifest on the SAME asyncio loop the stream server uses, so running it
    // often starves video playback. A wide window keeps navigation instant
    // AND keeps the loop free for streaming. Manual refresh is always one tap.
    fun isCacheFresh(cached: SyncResult): Boolean {
        val age = System.currentTimeMillis() / 1000 - cached.updatedAt
        return cached.updatedAt > 0 && age < 600
    }

    fun markTransferFailed(transferId: String, error: String) {
        transfers.update(transferId) { it.copy(status = TransferStatus.FAILED, error = error) }
    }

    /**
     * Starts a transfer: one coroutine runs the Python work, another polls
     * progress every second. Returns the work job (join it for post-work).
     */
    fun trackTransfer(transferId: String, reloadOnDone: Boolean = true, work: suspend () -> Unit): Job {
        val job = scope.launch {
            runCatching { work() }
                .onSuccess {
                    transfers.update(transferId) { it.copy(status = TransferStatus.DONE, percent = 100f) }
                    if (reloadOnDone) load(initial = false)
                }
                .onFailure { e ->
                    if (e is TeleVaultEngine.SessionExpired) {
                        onSessionExpired()
                        return@launch
                    }
                    val cancelled = e.message?.contains("cancelled", ignoreCase = true) == true
                    transfers.update(transferId) {
                        it.copy(
                            status = if (cancelled) TransferStatus.CANCELLED else TransferStatus.FAILED,
                            error = if (cancelled) null else e.message,
                        )
                    }
                }
        }
        scope.launch {
            while (isActive) {
                delay(1000)
                val item = transfers.items.firstOrNull { it.transferId == transferId }
                if (item == null || item.status != TransferStatus.RUNNING) break
                val tp = runCatching { engine.transferProgress(transferId) }.getOrNull() ?: break
                if (tp != null) {
                    transfers.update(transferId) {
                        it.copy(percent = tp.optDouble("percent", 0.0).toFloat())
                    }
                }
            }
        }
        return job
    }

    // ── File pickers ────────────────────────────────────────────────
    val uploadLauncher = rememberLauncherForActivityResult(
        ActivityResultContracts.OpenMultipleDocuments(),
    ) { uris: List<Uri> ->
        uris.forEach { uri ->
            scope.launch {
                val name = context.displayName(uri)
                val transferId = newTransferId()
                transfers.add(TransferItem(transferId, name, TransferKind.UPLOAD))
                onMessage("Uploading $name…")
                try {
                    val path = copyUriToCache(context, uri)
                    val mime = context.contentResolver.getType(uri) ?: "application/octet-stream"
                    val thumbB64 = generateThumbnail(path, mime)?.let {
                        Base64.encodeToString(it, Base64.NO_WRAP)
                    }
                    trackTransfer(transferId) {
                        engine.uploadFile(path, activeFolderId, transferId, thumbnailB64 = thumbB64)
                    }
                } catch (e: Exception) {
                    if (e is TeleVaultEngine.SessionExpired) {
                        onSessionExpired()
                        return@launch
                    }
                    markTransferFailed(transferId, e.message ?: "Upload failed")
                }
            }
        }
    }

    val saveLauncher = rememberLauncherForActivityResult(
        ActivityResultContracts.CreateDocument("application/octet-stream"),
    ) { uri: Uri? ->
        val file = pendingDownload
        val password = pendingPassword
        pendingDownload = null
        pendingPassword = null
        if (uri == null || file == null) return@rememberLauncherForActivityResult
        scope.launch {
            // Deterministic transfer id + cache path: a retry of a failed
            // download reuses the partial .part file and resumes where it stopped.
            val transferId = "dl-${file.id}-${activeFolderId ?: 0}"
            val safeName = file.name.replace(Regex("[^A-Za-z0-9._-]"), "_")
            val cachePath = File(context.cacheDir, "downloads/${file.id}_$safeName").absolutePath
            transfers.add(TransferItem(transferId, file.name, TransferKind.DOWNLOAD))
            onMessage("Downloading ${file.name}…")
            val job = trackTransfer(transferId) {
                engine.downloadFile(file.id, activeFolderId, cachePath, transferId, password)
            }
            job.join()
            val item = transfers.items.firstOrNull { it.transferId == transferId }
            if (item?.status == TransferStatus.DONE) {
                copyFileToUri(context, cachePath, uri)
                File(cachePath).delete()
                onMessage("Downloaded ${file.name}")
            }
        }
    }

    // ── Selection helpers ───────────────────────────────────────────
    fun selectedFiles(): List<TeleFile> = files.filter { it.id in selection }

    fun startRename(file: TeleFile) {
        selection = emptySet()
        renameTarget = file
    }

    fun runBatchDownload(selected: List<TeleFile>, password: String?) {
        scope.launch {
            if (Build.VERSION.SDK_INT < Build.VERSION_CODES.Q) {
                onMessage("Batch save needs Android 10+; use ⋮ → Download for a single file")
                return@launch
            }
            var saved = 0
            var failed = 0
            for (file in selected) {
                // Unique ids/paths per run so overlapping batches never write
                // to the same .part file.
                val transferId = "batch-" + newTransferId()
                val cachePath = File(context.cacheDir, "downloads/batch-$transferId").absolutePath
                transfers.add(TransferItem(transferId, file.name, TransferKind.DOWNLOAD))
                onMessage("Downloading ${file.name}…")
                val job = trackTransfer(transferId, reloadOnDone = false) {
                    engine.downloadFile(file.id, activeFolderId, cachePath, transferId, password)
                }
                job.join()
                val item = transfers.items.firstOrNull { it.transferId == transferId }
                if (item?.status == TransferStatus.DONE) {
                    if (engine.saveToDownloads(file.name, file.mime, cachePath)) saved++ else failed++
                    File(cachePath).delete()
                } else {
                    failed++
                }
            }
            when {
                saved > 0 && failed > 0 -> onMessage("Saved $saved file${if (saved == 1) "" else "s"} — $failed failed")
                saved > 0 -> onMessage("Saved $saved file${if (saved == 1) "" else "s"} to Downloads")
                else -> onMessage("Couldn't save any files")
            }
        }
    }

    fun startBatchDownload() {
        val selected = selectedFiles()
        if (selected.isEmpty()) return
        selection = emptySet()
        if (selected.any { it.passwordProtected }) {
            askBatchPassword = selected
        } else {
            runBatchDownload(selected, null)
        }
    }

    LaunchedEffect(Unit) {
        // Render the last known snapshot instantly. If it was written within
        // the last minute, skip the Telegram re-scan entirely — returning from
        // a video is then instant, exactly like on Windows. Manual refresh is
        // always available from the sync button in the top bar.
        val cached = runCatching { engine.cachedListing() }.getOrNull()
        if (cached != null) {
            folders = listOf(TeleFolder(null, "Saved Messages")) + cached.folders
            files = cached.files
            vaultMismatch = cached.vaultMismatch
            if (isCacheFresh(cached)) {
                loading = false
                return@LaunchedEffect
            }
        }
        load(initial = true, fromCache = cached != null)
    }

    // ── Scaffold ────────────────────────────────────────────────────
    ModalNavigationDrawer(
        drawerState = drawerState,
        drawerContent = {
            ModalDrawerSheet {
                DrawerContent(
                    folders = folders,
                    activeFolderId = activeFolderId,
                    darkTheme = darkTheme,
                    bandwidth = bandwidth,
                    onSelectFolder = {
                        onActiveFolderChanged(it)
                        scope.launch { drawerState.close() }
                    },
                    onCreateFolder = { showNewFolderDialog = true },
                    onDeleteFolder = { folder ->
                        folderToDelete = folder
                        showDeleteFolderDialog = true
                    },
                    onStats = {
                        onNavigate(AppScreen.StorageStats)
                        scope.launch { drawerState.close() }
                    },
                    onOpenLink = {
                        onNavigate(AppScreen.OpenLink)
                        scope.launch { drawerState.close() }
                    },
                    onVault = {
                        onNavigate(AppScreen.VaultRecovery)
                        scope.launch { drawerState.close() }
                    },
                    onAbout = {
                        onNavigate(AppScreen.About)
                        scope.launch { drawerState.close() }
                    },
                    onToggleTheme = {
                        onToggleTheme()
                        scope.launch {
                            bandwidth = runCatching { engine.bandwidth() }.getOrNull()
                                ?.let { it.optLong("up_bytes") to it.optLong("down_bytes") }
                        }
                    },
                    onLogout = { showLogoutDialog = true },
                )
            }
        },
    ) {
        Scaffold(
            topBar = {
                TopAppBar(
                    title = {
                        when {
                            selecting -> Text("${selection.size} selected", fontWeight = FontWeight.SemiBold)
                            searching -> SearchField(
                                query = searchQuery,
                                onQuery = { searchQuery = it },
                                onClose = { searching = false; searchQuery = "" },
                            )
                            else -> Column {
                                Text("TeleVault", fontWeight = FontWeight.Bold)
                                Text(
                                    folders.firstOrNull { it.id == activeFolderId }?.name ?: "Saved Messages",
                                    style = MaterialTheme.typography.labelSmall,
                                    color = MaterialTheme.colorScheme.onSurfaceVariant,
                                )
                            }
                        }
                    },
                    navigationIcon = {
                        when {
                            selecting -> IconButton(onClick = { selection = emptySet() }) {
                                Icon(Icons.Outlined.Close, contentDescription = "Cancel selection")
                            }
                            else -> IconButton(onClick = { scope.launch { drawerState.open() } }) {
                                Icon(Icons.Outlined.Menu, contentDescription = "Menu")
                            }
                        }
                    },
                    actions = {
                        when {
                            selecting -> {
                                if (selection.size == 1) {
                                    val only = files.firstOrNull { it.id in selection }
                                    if (only != null) {
                                        IconButton(onClick = { startRename(only) }) {
                                            Icon(Icons.Outlined.Edit, contentDescription = "Rename")
                                        }
                                    }
                                }
                                IconButton(onClick = { startBatchDownload() }) {
                                    Icon(Icons.Outlined.Download, contentDescription = "Download")
                                }
                                IconButton(onClick = { showMoveDialog = true }) {
                                    Icon(Icons.Outlined.DriveFileMove, contentDescription = "Move")
                                }
                                IconButton(onClick = { showDeleteFilesDialog = true }) {
                                    Icon(Icons.Outlined.Delete, contentDescription = "Delete")
                                }
                                TransferCenterButton(
                                    transfers = transfers.items.toList(),
                                    onClick = { onNavigate(AppScreen.Transfers) },
                                )
                            }
                            else -> {
                                IconButton(onClick = { searching = !searching }) {
                                    Icon(Icons.Outlined.Search, contentDescription = "Search")
                                }
                                IconButton(onClick = { gridMode = !gridMode }) {
                                    Icon(
                                        if (gridMode) Icons.Outlined.ViewAgenda else Icons.Outlined.GridView,
                                        contentDescription = if (gridMode) "List view" else "Grid view",
                                    )
                                }
                                IconButton(onClick = { scope.launch { load(false) } }) {
                                    if (refreshing) {
                                        CircularProgressIndicator(modifier = Modifier.size(20.dp), strokeWidth = 2.dp)
                                    } else {
                                        Icon(Icons.Outlined.CloudSync, contentDescription = "Sync")
                                    }
                                }
                                TransferCenterButton(
                                    transfers = transfers.items.toList(),
                                    onClick = { onNavigate(AppScreen.Transfers) },
                                )
                            }
                        }
                    },
                    colors = TopAppBarDefaults.topAppBarColors(
                        containerColor = MaterialTheme.colorScheme.surface,
                    ),
                )
            },
            floatingActionButton = {
                if (!selecting) {
                    FloatingActionButton(onClick = { uploadLauncher.launch(arrayOf("*/*")) }) {
                        Icon(Icons.Outlined.Add, contentDescription = "Upload")
                    }
                }
            },
            bottomBar = {
                TransferQueuePanel(
                    transfers = transfers.items.toList(),
                    onCancel = { id -> scope.launch { engine.cancelTransfer(id) } },
                )
            },
        ) { padding ->
            Box(
                modifier = Modifier
                    .padding(padding)
                    .fillMaxSize()
                    .imePadding()
                    .background(MaterialTheme.colorScheme.background),
            ) {
                val shown = files.filter {
                    (it.folderId == activeFolderId) &&
                        (searchQuery.isBlank() || it.name.contains(searchQuery, ignoreCase = true))
                }
                when {
                    loading -> Box(Modifier.fillMaxSize(), contentAlignment = Alignment.Center) {
                        CircularProgressIndicator()
                    }
                    vaultMismatch -> VaultMismatchState(
                        onRestore = { onNavigate(AppScreen.VaultRecovery) },
                        onDismiss = { vaultMismatch = false },
                    )
                    files.isEmpty() -> EmptyState(
                        icon = Icons.Outlined.Cloud,
                        title = "Your vault is empty",
                        subtitle = "Tap the + button to upload your first encrypted file.",
                    )
                    shown.isEmpty() -> EmptyState(
                        icon = Icons.Outlined.Search,
                        title = "No files found",
                        subtitle = "Try a different search query or folder.",
                    )
                    gridMode -> LazyVerticalGrid(
                        columns = GridCells.Adaptive(minSize = 110.dp),
                        verticalArrangement = Arrangement.spacedBy(10.dp),
                        horizontalArrangement = Arrangement.spacedBy(10.dp),
                        contentPadding = PaddingValues(12.dp),
                        modifier = Modifier.fillMaxSize(),
                    ) {
                        // Telegram message IDs are only unique within one chat, so
                        // files from different folders can share the same ID. Use a
                        // composite key (folder + message id) to avoid duplicate-key
                        // crashes in the lazy list/grid.
                        items(shown, key = { "${it.folderId}:${it.id}" }) { file ->
                            FileGridItem(
                                file = file,
                                folderId = activeFolderId,
                                engine = engine,
                                selected = file.id in selection,
                                onClick = {
                                    if (selecting) {
                                        selection = toggleSelection(selection, file.id)
                                    } else if (file.isPreviewable) {
                                        onOpenFile(file, activeFolderId)
                                    } else {
                                        showDetailSheetFor = file
                                    }
                                },
                                onLongClick = { selection = toggleSelection(selection, file.id) },
                                onMore = { showDetailSheetFor = file },
                            )
                        }
                    }
                    else -> LazyColumn(
                        verticalArrangement = Arrangement.spacedBy(2.dp),
                        state = rememberLazyListState(),
                        modifier = Modifier.fillMaxSize(),
                    ) {
                        items(shown, key = { "${it.folderId}:${it.id}" }) { file ->
                            FileListItem(
                                file = file,
                                folderId = activeFolderId,
                                engine = engine,
                                selected = file.id in selection,
                                onClick = {
                                    if (selecting) {
                                        selection = toggleSelection(selection, file.id)
                                    } else if (file.isPreviewable) {
                                        onOpenFile(file, activeFolderId)
                                    } else {
                                        showDetailSheetFor = file
                                    }
                                },
                                onLongClick = { selection = toggleSelection(selection, file.id) },
                                onMore = { showDetailSheetFor = file },
                            )
                        }
                    }
                }
            }
        }
    }

    // ── New folder dialog ───────────────────────────────────────────
    if (showNewFolderDialog) {
        NewFolderDialog(
            onConfirm = { name ->
                showNewFolderDialog = false
                scope.launch {
                    try {
                        engine.createFolder(name)
                        load(initial = false)
                        onMessage("Folder created")
                    } catch (e: Exception) {
                        onMessage(e.message ?: "Could not create folder")
                    }
                }
            },
            onDismiss = { showNewFolderDialog = false },
        )
    }

    // ── Delete folder confirm ───────────────────────────────────────
    folderToDelete?.let { folder ->
        if (showDeleteFolderDialog) {
            ConfirmDialog(
                title = "Delete folder?",
                text = "\u201C${folder.name}\u201D and all its files will be permanently deleted from Telegram.",
                onConfirm = {
                    showDeleteFolderDialog = false
                    folderToDelete = null
                    scope.launch {
                        try {
                            engine.deleteFolder(folder.id ?: return@launch)
                            if (activeFolderId == folder.id) onActiveFolderChanged(null)
                            load(initial = false)
                        } catch (e: Exception) {
                            onMessage(e.message ?: "Could not delete folder")
                        }
                    }
                },
                onDismiss = { showDeleteFolderDialog = false },
            )
        }
    }

    // ── Move selected files ─────────────────────────────────────────
    if (showMoveDialog) {
        MoveToFolderDialog(
            folders = folders.filter { it.id != activeFolderId },
            onConfirm = { target ->
                val ids = selection.toList()
                showMoveDialog = false
                scope.launch {
                    try {
                        engine.moveFiles(ids, activeFolderId, target.id)
                        selection = emptySet()
                        load(initial = false)
                        onMessage("Moved ${ids.size} file${if (ids.size == 1) "" else "s"}")
                    } catch (e: Exception) {
                        onMessage(e.message ?: "Move failed")
                    }
                }
            },
            onDismiss = { showMoveDialog = false },
        )
    }

    // ── Delete selected files ───────────────────────────────────────
    if (showDeleteFilesDialog) {
        val ids = selection.toList()
        ConfirmDialog(
            title = "Delete ${ids.size} file${if (ids.size == 1) "" else "s"}?",
            text = "This permanently removes the encrypted files from your Telegram account.",
            onConfirm = {
                showDeleteFilesDialog = false
                scope.launch {
                    try {
                        engine.deleteFiles(ids, activeFolderId)
                        selection = emptySet()
                        load(initial = false)
                    } catch (e: Exception) {
                        onMessage(e.message ?: "Delete failed")
                    }
                }
            },
            onDismiss = { showDeleteFilesDialog = false },
        )
    }

    // ── Logout confirm ──────────────────────────────────────────────
    if (showLogoutDialog) {
        ConfirmDialog(
            title = "Log out?",
            text = "Your local session will be removed. Encrypted files stay on Telegram and can be recovered with your vault backup.",
            confirmLabel = "Log out",
            onConfirm = {
                showLogoutDialog = false
                scope.launch {
                    engine.logout()
                    transfers.items.clear()
                    onSessionExpired()
                }
            },
            onDismiss = { showLogoutDialog = false },
        )
    }

    // ── File detail sheet ───────────────────────────────────────────
    showDetailSheetFor?.let { file ->
        FileDetailSheet(
            file = file,
            onDismiss = { showDetailSheetFor = null },
            onShare = {
                showDetailSheetFor = null
                showChannelShareFor = file
            },
            onDownload = {
                showDetailSheetFor = null
                if (file.passwordProtected) {
                    showPasswordDialogFor = file
                } else {
                    pendingDownload = file
                    pendingPassword = null
                    saveLauncher.launch(file.name)
                }
            },
            onPreview = {
                showDetailSheetFor = null
                onOpenFile(file, activeFolderId)
            },
            onRename = {
                showDetailSheetFor = null
                renameTarget = file
            },
            onDelete = {
                showDetailSheetFor = null
                scope.launch {
                    runCatching { engine.deleteFiles(listOf(file.id), activeFolderId) }
                        .onSuccess { load(initial = false) }
                        .onFailure { e ->
                            if (e is TeleVaultEngine.SessionExpired) onSessionExpired()
                            else onMessage(e.message ?: "Delete failed")
                        }
                }
            },
        )
    }

    // ── Channel share sheet ────────────────────────────────────────
    showChannelShareFor?.let { file ->
        ChannelShareSheet(
            file = file,
            folderId = activeFolderId,
            engine = engine,
            onMessage = onMessage,
            onDismiss = { showChannelShareFor = null },
        )
    }

    // ── Password prompt for protected download ──────────────────────
    showPasswordDialogFor?.let { file ->
        PasswordDialog(
            title = "Unlock ${file.name}",
            onConfirm = { password ->
                showPasswordDialogFor = null
                pendingDownload = file
                pendingPassword = password
                saveLauncher.launch(file.name)
            },
            onDismiss = { showPasswordDialogFor = null },
        )
    }

    // ── Password prompt for batch download ──────────────────────────
    askBatchPassword?.let { selected ->
        PasswordDialog(
            title = "Unlock protected files",
            onConfirm = { password ->
                askBatchPassword = null
                runBatchDownload(selected, password)
            },
            onDismiss = { askBatchPassword = null },
        )
    }

    // ── Rename file ─────────────────────────────────────────────────
    renameTarget?.let { file ->
        RenameDialog(
            initialName = file.name,
            onConfirm = { newName ->
                renameTarget = null
                scope.launch {
                    runCatching { engine.renameFile(file.id, activeFolderId, newName) }
                        .onSuccess {
                            load(initial = false)
                            onMessage("Renamed to $newName")
                        }
                        .onFailure { e ->
                            if (e is TeleVaultEngine.SessionExpired) onSessionExpired()
                            else onMessage(e.message ?: "Rename failed")
                        }
                }
            },
            onDismiss = { renameTarget = null },
        )
    }
}

private fun toggleSelection(selection: Set<Long>, id: Long): Set<Long> =
    if (id in selection) selection - id else selection + id

// ─────────────────────────────────────────────────────────────────────
//  Drawer
// ─────────────────────────────────────────────────────────────────────

@Composable
private fun DrawerContent(
    folders: List<TeleFolder>,
    activeFolderId: Long?,
    darkTheme: Boolean,
    bandwidth: Pair<Long, Long>?,
    onSelectFolder: (Long?) -> Unit,
    onCreateFolder: () -> Unit,
    onDeleteFolder: (TeleFolder) -> Unit,
    onStats: () -> Unit,
    onOpenLink: () -> Unit,
    onVault: () -> Unit,
    onAbout: () -> Unit,
    onToggleTheme: () -> Unit,
    onLogout: () -> Unit,
) {
    Column(Modifier.fillMaxSize()) {
        Row(
            modifier = Modifier
                .fillMaxWidth()
                .padding(20.dp),
            verticalAlignment = Alignment.CenterVertically,
        ) {
            Box(
                modifier = Modifier
                    .size(44.dp)
                    .background(MaterialTheme.colorScheme.primary, RoundedCornerShape(14.dp)),
                contentAlignment = Alignment.Center,
            ) {
                Icon(Icons.Outlined.Lock, contentDescription = null, tint = MaterialTheme.colorScheme.onPrimary, modifier = Modifier.size(24.dp))
            }
            Spacer(Modifier.width(12.dp))
            Column {
                Text("TeleVault", fontWeight = FontWeight.Bold, style = MaterialTheme.typography.titleLarge)
                Text("Mobile Vault", style = MaterialTheme.typography.labelSmall, color = MaterialTheme.colorScheme.onSurfaceVariant)
            }
        }

        // Scrollable middle — folders and the bandwidth card can grow, so the
        // drawer must scroll when there are many folders.
        Column(
            modifier = Modifier
                .weight(1f)
                .verticalScroll(rememberScrollState()),
        ) {
            Text(
                "FOLDERS",
                style = MaterialTheme.typography.labelSmall,
                color = MaterialTheme.colorScheme.onSurfaceVariant,
                modifier = Modifier.padding(start = 28.dp, top = 8.dp, bottom = 4.dp),
            )

            folders.forEach { folder ->
                val selected = folder.id == activeFolderId
                NavigationDrawerItem(
                    label = { Text(folder.name, maxLines = 1) },
                    selected = selected,
                    icon = { Icon(Icons.Outlined.Folder, contentDescription = null) },
                    onClick = { onSelectFolder(folder.id) },
                    badge = {
                        if (folder.id != null) {
                            IconButton(onClick = { onDeleteFolder(folder) }, modifier = Modifier.size(28.dp)) {
                                Icon(Icons.Outlined.MoreVert, contentDescription = "Folder options", modifier = Modifier.size(18.dp))
                            }
                        }
                    },
                    modifier = Modifier.padding(horizontal = 8.dp),
                )
            }

            NavigationDrawerItem(
                label = { Text("Create folder") },
                selected = false,
                icon = { Icon(Icons.Outlined.CreateNewFolder, contentDescription = null) },
                onClick = onCreateFolder,
                modifier = Modifier.padding(horizontal = 8.dp),
            )

            Row(
                modifier = Modifier
                    .fillMaxWidth()
                    .padding(horizontal = 16.dp, vertical = 8.dp)
                    .background(MaterialTheme.colorScheme.surfaceVariant, RoundedCornerShape(14.dp))
                    .padding(14.dp),
                verticalAlignment = Alignment.CenterVertically,
            ) {
                Icon(Icons.Outlined.CloudDone, contentDescription = null, tint = MaterialTheme.colorScheme.primary)
                Spacer(Modifier.width(12.dp))
                Column {
                    Text("Bandwidth this session", style = MaterialTheme.typography.labelSmall, color = MaterialTheme.colorScheme.onSurfaceVariant)
                    Text(
                        "${formatBytes(bandwidth?.first ?: 0)} up   •   ${formatBytes(bandwidth?.second ?: 0)} down",
                        style = MaterialTheme.typography.bodySmall,
                        fontWeight = FontWeight.Medium,
                    )
                }
            }
        }

        // Pinned bottom actions.
        HorizontalDivider(color = MaterialTheme.colorScheme.outline.copy(alpha = 0.2f))

        Row(
            modifier = Modifier
                .fillMaxWidth()
                .clickable(onClick = onToggleTheme)
                .padding(horizontal = 20.dp, vertical = 12.dp),
            verticalAlignment = Alignment.CenterVertically,
        ) {
            Icon(Icons.Outlined.Settings, contentDescription = null, tint = MaterialTheme.colorScheme.onSurfaceVariant)
            Spacer(Modifier.width(14.dp))
            Text("Dark theme", Modifier.weight(1f))
            Switch(checked = darkTheme, onCheckedChange = { onToggleTheme() })
        }
        DrawerItem(icon = Icons.Outlined.Info, label = "Storage stats", onClick = onStats)
        DrawerItem(icon = Icons.Outlined.Link, label = "Open shared link", onClick = onOpenLink)
        DrawerItem(icon = Icons.Outlined.Key, label = "Vault backup & restore", onClick = onVault)
        DrawerItem(icon = Icons.Outlined.HelpOutline, label = "About TeleVault", onClick = onAbout)
        DrawerItem(icon = Icons.Outlined.Logout, label = "Log out", onClick = onLogout, tint = MaterialTheme.colorScheme.error)
        Text(
            "TeleVault by Liethueis-Foundation",
            style = MaterialTheme.typography.labelSmall,
            color = MaterialTheme.colorScheme.outline,
            textAlign = TextAlign.Center,
            modifier = Modifier
                .fillMaxWidth()
                .padding(horizontal = 16.dp, vertical = 10.dp),
        )
    }
}

@Composable
private fun DrawerItem(
    icon: androidx.compose.ui.graphics.vector.ImageVector,
    label: String,
    onClick: () -> Unit,
    tint: Color = MaterialTheme.colorScheme.onSurfaceVariant,
) {
    Row(
        modifier = Modifier
            .fillMaxWidth()
            .clickable(onClick = onClick)
            .padding(horizontal = 20.dp, vertical = 12.dp),
        verticalAlignment = Alignment.CenterVertically,
    ) {
        Icon(icon, contentDescription = null, tint = tint, modifier = Modifier.size(22.dp))
        Spacer(Modifier.width(14.dp))
        Text(label, color = if (tint == MaterialTheme.colorScheme.error) tint else MaterialTheme.colorScheme.onSurface)
    }
}

// ─────────────────────────────────────────────────────────────────────
//  Search field
// ─────────────────────────────────────────────────────────────────────

@Composable
private fun SearchField(query: String, onQuery: (String) -> Unit, onClose: () -> Unit) {
    Row(verticalAlignment = Alignment.CenterVertically) {
        OutlinedTextField(
            value = query,
            onValueChange = onQuery,
            placeholder = { Text("Search files…") },
            singleLine = true,
            modifier = Modifier.weight(1f).height(52.dp),
            shape = RoundedCornerShape(14.dp),
        )
        Spacer(Modifier.width(4.dp))
        IconButton(onClick = onClose) {
            Icon(Icons.Outlined.Close, contentDescription = "Close search")
        }
    }
}

// ─────────────────────────────────────────────────────────────────────
//  Dialogs
// ─────────────────────────────────────────────────────────────────────

@Composable
private fun RenameDialog(initialName: String, onConfirm: (String) -> Unit, onDismiss: () -> Unit) {
    var name by remember { mutableStateOf(initialName) }
    androidx.compose.material3.AlertDialog(
        onDismissRequest = onDismiss,
        title = { Text("Rename file") },
        text = {
            OutlinedTextField(
                value = name,
                onValueChange = { name = it.take(128) },
                label = { Text("New name") },
                singleLine = true,
            )
        },
        confirmButton = {
            TextButton(
                enabled = name.isNotBlank() && name != initialName,
                onClick = {
                    onDismiss()
                    onConfirm(name)
                },
            ) { Text("Rename") }
        },
        dismissButton = {
            TextButton(onClick = onDismiss) { Text("Cancel") }
        },
    )
}

@Composable
private fun NewFolderDialog(onConfirm: (String) -> Unit, onDismiss: () -> Unit) {
    var name by remember { mutableStateOf("") }
    androidx.compose.material3.AlertDialog(
        onDismissRequest = onDismiss,
        title = { Text("New folder") },
        text = {
            OutlinedTextField(
                value = name,
                onValueChange = { name = it.take(30) },
                label = { Text("Folder name") },
                singleLine = true,
            )
        },
        confirmButton = {
            TextButton(enabled = name.isNotBlank(), onClick = {
                onDismiss()
                onConfirm(name)
            }) { Text("Create") }
        },
        dismissButton = {
            TextButton(onClick = onDismiss) { Text("Cancel") }
        },
    )
}

@Composable
private fun MoveToFolderDialog(
    folders: List<TeleFolder>,
    onConfirm: (TeleFolder) -> Unit,
    onDismiss: () -> Unit,
) {
    androidx.compose.material3.AlertDialog(
        onDismissRequest = onDismiss,
        title = { Text("Move to folder") },
        text = {
            Column(Modifier.fillMaxWidth()) {
                folders.forEach { folder ->
                    Row(
                        modifier = Modifier
                            .fillMaxWidth()
                            .clickable {
                                onDismiss()
                                onConfirm(folder)
                            }
                            .padding(vertical = 12.dp),
                        verticalAlignment = Alignment.CenterVertically,
                    ) {
                        Icon(Icons.Outlined.Folder, contentDescription = null, tint = MaterialTheme.colorScheme.primary)
                        Spacer(Modifier.width(12.dp))
                        Text(folder.name)
                    }
                }
                if (folders.isEmpty()) {
                    Text(
                        "No other folders. Create one first from the menu.",
                        style = MaterialTheme.typography.bodySmall,
                        color = MaterialTheme.colorScheme.onSurfaceVariant,
                    )
                }
            }
        },
        confirmButton = {},
        dismissButton = {
            TextButton(onClick = onDismiss) { Text("Cancel") }
        },
    )
}

@OptIn(ExperimentalMaterial3Api::class)
@Composable
private fun FileDetailSheet(
    file: TeleFile,
    onDismiss: () -> Unit,
    onDownload: () -> Unit,
    onPreview: () -> Unit,
    onRename: () -> Unit,
    onDelete: () -> Unit,
    onShare: () -> Unit,
) {
    val sheetState = rememberModalBottomSheetState(skipPartiallyExpanded = true)
    ModalBottomSheet(onDismissRequest = onDismiss, sheetState = sheetState) {
        Column(Modifier.fillMaxWidth().padding(bottom = 28.dp)) {
            Row(
                modifier = Modifier.fillMaxWidth().padding(horizontal = 20.dp),
                verticalAlignment = Alignment.CenterVertically,
            ) {
                FileTypeIcon(file, size = 56)
                Spacer(Modifier.width(14.dp))
                Column(Modifier.weight(1f)) {
                    Text(file.name, style = MaterialTheme.typography.titleMedium, fontWeight = FontWeight.SemiBold)
                    Spacer(Modifier.height(2.dp))
                    Text(
                        "${formatBytes(file.size)}  •  ${if (file.passwordProtected) "Password protected" else typeStyleFor(file).label}",
                        style = MaterialTheme.typography.bodySmall,
                        color = MaterialTheme.colorScheme.onSurfaceVariant,
                    )
                }
            }
            Spacer(Modifier.height(18.dp))
            if (file.isPreviewable) {
                SheetAction(icon = Icons.Outlined.Visibility, label = "Preview", onClick = onPreview)
            }
            SheetAction(icon = Icons.Outlined.Share, label = "E2E channel share", onClick = onShare)
            SheetAction(icon = Icons.Outlined.Edit, label = "Rename", onClick = onRename)
            SheetAction(icon = Icons.Outlined.Download, label = "Download", onClick = onDownload)
            SheetAction(icon = Icons.Outlined.Delete, label = "Delete", onClick = onDelete, tint = MaterialTheme.colorScheme.error)
        }
    }
}

@Composable
private fun SheetAction(
    icon: androidx.compose.ui.graphics.vector.ImageVector,
    label: String,
    onClick: () -> Unit,
    tint: Color = MaterialTheme.colorScheme.onSurface,
) {
    Row(
        modifier = Modifier
            .fillMaxWidth()
            .clickable(onClick = onClick)
            .padding(horizontal = 24.dp, vertical = 14.dp),
        verticalAlignment = Alignment.CenterVertically,
    ) {
        Icon(icon, contentDescription = null, tint = tint, modifier = Modifier.size(22.dp))
        Spacer(Modifier.width(16.dp))
        Text(label, color = tint, style = MaterialTheme.typography.bodyLarge)
    }
}

// ─────────────────────────────────────────────────────────────────────
//  Vault key mismatch state
//
//  Shown when the account contains encrypted manifests, but none could be
//  decrypted with this device's vault key (e.g. files uploaded from the
//  laptop). Guides the user to restore their backup instead of leaving them
//  staring at a misleading empty vault.
// ─────────────────────────────────────────────────────────────────────

@Composable
private fun VaultMismatchState(onRestore: () -> Unit, onDismiss: () -> Unit) {
    Column(
        modifier = Modifier
            .fillMaxSize()
            .padding(horizontal = 28.dp),
        horizontalAlignment = Alignment.CenterHorizontally,
        verticalArrangement = Arrangement.Center,
    ) {
        Box(
            modifier = Modifier
                .size(64.dp)
                .background(MaterialTheme.colorScheme.tertiaryContainer, RoundedCornerShape(20.dp)),
            contentAlignment = Alignment.Center,
        ) {
            Icon(
                Icons.Outlined.WarningAmber,
                contentDescription = null,
                tint = MaterialTheme.colorScheme.tertiary,
                modifier = Modifier.size(32.dp),
            )
        }
        Spacer(Modifier.height(16.dp))
        Text(
            "Vault key mismatch",
            style = MaterialTheme.typography.titleLarge,
            fontWeight = FontWeight.Bold,
        )
        Spacer(Modifier.height(8.dp))
        Text(
            "This account contains encrypted files, but they were created with " +
                "a different vault key on another device (like your laptop). " +
                "Restore your vault backup to unlock them here.",
            style = MaterialTheme.typography.bodyMedium,
            color = MaterialTheme.colorScheme.onSurfaceVariant,
            textAlign = TextAlign.Center,
        )
        Spacer(Modifier.height(20.dp))
        Button(onClick = onRestore, modifier = Modifier.fillMaxWidth()) {
            Text("Restore vault backup")
        }
        Spacer(Modifier.height(6.dp))
        TextButton(onClick = onDismiss) {
            Text("Browse anyway")
        }
    }
}
