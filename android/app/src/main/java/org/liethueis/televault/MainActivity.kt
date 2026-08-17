package org.liethueis.televault

import android.content.Context
import android.os.Bundle
import androidx.activity.ComponentActivity
import androidx.activity.compose.BackHandler
import androidx.activity.compose.setContent
import androidx.activity.enableEdgeToEdge
import androidx.compose.foundation.background
import androidx.compose.foundation.isSystemInDarkTheme
import androidx.compose.foundation.layout.Box
import androidx.compose.foundation.layout.Column
import androidx.compose.foundation.layout.fillMaxSize
import androidx.compose.foundation.layout.padding
import androidx.compose.ui.unit.dp
import androidx.compose.material.icons.Icons
import androidx.compose.material.icons.outlined.Lock
import androidx.compose.material3.CircularProgressIndicator
import androidx.compose.material3.Icon
import androidx.compose.material3.MaterialTheme
import androidx.compose.material3.Scaffold
import androidx.compose.material3.SnackbarHost
import androidx.compose.material3.SnackbarHostState
import androidx.compose.material3.Button
import androidx.compose.material3.Text
import androidx.compose.runtime.Composable
import androidx.compose.runtime.LaunchedEffect
import androidx.compose.runtime.getValue
import androidx.compose.runtime.mutableStateOf
import androidx.compose.runtime.remember
import androidx.compose.runtime.rememberCoroutineScope
import androidx.compose.runtime.setValue
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.platform.LocalContext
import androidx.compose.ui.text.font.FontWeight
import androidx.compose.ui.text.style.TextAlign
import kotlinx.coroutines.CoroutineScope
import kotlinx.coroutines.delay
import kotlinx.coroutines.launch

// ─────────────────────────────────────────────────────────────────────
//  Navigation
// ─────────────────────────────────────────────────────────────────────

sealed class AppScreen {
    data object Dashboard : AppScreen()
    data class Media(val file: TeleFile) : AppScreen()
    data class Image(val file: TeleFile) : AppScreen()
    data class Audio(val file: TeleFile) : AppScreen()
    data object StorageStats : AppScreen()
    data object VaultRecovery : AppScreen()
    data object About : AppScreen()
    data object OpenLink : AppScreen()
    data object Transfers : AppScreen()
}

class MainActivity : ComponentActivity() {
    override fun onCreate(savedInstanceState: Bundle?) {
        super.onCreate(savedInstanceState)
        enableEdgeToEdge()

        setContent {
            val context = LocalContext.current
            val prefs = remember { context.getSharedPreferences("televault", Context.MODE_PRIVATE) }
            val systemDark = isSystemInDarkTheme()
            var darkTheme by remember {
                mutableStateOf(prefs.getBoolean("dark_theme", systemDark))
            }

            TeleVaultTheme(darkTheme = darkTheme) {
                TeleVaultRoot(
                    darkTheme = darkTheme,
                    onToggleTheme = {
                        darkTheme = !darkTheme
                        prefs.edit().putBoolean("dark_theme", darkTheme).apply()
                    },
                )
            }
        }
    }
}

@Composable
private fun TeleVaultRoot(darkTheme: Boolean, onToggleTheme: () -> Unit) {
    val context = LocalContext.current
    val scope = rememberCoroutineScope()
    val snackbarHostState = remember { SnackbarHostState() }
    val engine = remember { TeleVaultEngine(context) }
    val transfers = remember { TransferTracker() }

    var connecting by remember { mutableStateOf(true) }
    var authenticated by remember { mutableStateOf(false) }
    var screen by remember { mutableStateOf<AppScreen>(AppScreen.Dashboard) }
    var activeFolderId by remember { mutableStateOf<Long?>(null) }
    // Set when the startup probe exhausted its retries on a *network* error.
    // Shows a Retry screen instead of the login wizard, so a transient network
    // failure never forces a re-auth.
    var connectFailed by remember { mutableStateOf(false) }
    var connectAttempt by remember { mutableStateOf(0) }

    fun showMessage(message: String) {
        scope.launch {
            snackbarHostState.showSnackbar(message)
        }
    }

    fun goBackToDashboard() {
        screen = AppScreen.Dashboard
    }

    fun openFile(file: TeleFile, folderId: Long?) {
        screen = when {
            file.isVideo -> AppScreen.Media(file)
            file.isImage -> AppScreen.Image(file)
            file.isAudio -> AppScreen.Audio(file)
            else -> AppScreen.Dashboard
        }
    }

    // Initial connection probe. A transient network error must NOT send the
    // user to the login wizard — retry a few times, then show a Retry screen.
    // Only a SESSION_EXPIRED error falls through to re-auth.
    LaunchedEffect(connectAttempt) {
        connecting = true
        connectFailed = false
        var attempts = 0
        var sessionExpired = false
        while (attempts < 3) {
            val result = runCatching { engine.connect() }
            if (result.isSuccess) {
                authenticated = true
                connecting = false
                return@LaunchedEffect
            }
            if (result.exceptionOrNull() is TeleVaultEngine.SessionExpired) {
                sessionExpired = true
                break
            }
            attempts++
            if (attempts < 3) delay(2500)
        }
        connecting = false
        if (!sessionExpired) connectFailed = true
    }

    // System back pops to the dashboard; on the dashboard the default
    // behavior (exit the app) is left untouched.
    BackHandler(enabled = screen != AppScreen.Dashboard) {
        goBackToDashboard()
    }

    Scaffold(
        snackbarHost = { SnackbarHost(snackbarHostState) },
    ) { padding ->
        Box(
            modifier = Modifier
                .fillMaxSize()
                .padding(padding),
        ) {
            when {
                connecting -> SplashScreen()
                !authenticated && connectFailed -> ConnectionFailedScreen(
                    onRetry = { connectAttempt++ },
                )
                !authenticated -> AuthScreen(
                    engine = engine,
                    onConnected = {
                        authenticated = true
                        screen = AppScreen.Dashboard
                        showMessage("Connected")
                    },
                    onMessage = { showMessage(it) },
                )
                else -> when (val current = screen) {
                    is AppScreen.Media -> VideoPlayerScreen(
                        engine = engine,
                        file = current.file,
                        folderId = activeFolderId,
                        onBack = ::goBackToDashboard,
                    )
                    is AppScreen.Image -> ImageViewerScreen(
                        engine = engine,
                        file = current.file,
                        folderId = activeFolderId,
                        onBack = ::goBackToDashboard,
                    )
                    is AppScreen.Audio -> AudioPlayerScreen(
                        engine = engine,
                        file = current.file,
                        folderId = activeFolderId,
                        onBack = ::goBackToDashboard,
                    )
                    AppScreen.StorageStats -> StorageStatsScreen(
                        engine = engine,
                        onBack = ::goBackToDashboard,
                        onMessage = { showMessage(it) },
                    )
                    AppScreen.VaultRecovery -> VaultRecoveryScreen(
                        engine = engine,
                        onBack = ::goBackToDashboard,
                        onMessage = { showMessage(it) },
                    )
                    AppScreen.About -> AboutScreen(onBack = ::goBackToDashboard)
                    AppScreen.OpenLink -> OpenLinkScreen(
                        engine = engine,
                        onBack = ::goBackToDashboard,
                        onMessage = { showMessage(it) },
                    )
                    AppScreen.Transfers -> TransferCenterScreen(
                        transfers = transfers,
                        onCancel = { id -> scope.launch { engine.cancelTransfer(id) } },
                        onBack = ::goBackToDashboard,
                    )
                    AppScreen.Dashboard -> DashboardScreen(
                        engine = engine,
                        transfers = transfers,
                        coroutineScope = scope,
                        darkTheme = darkTheme,
                        onToggleTheme = onToggleTheme,
                        activeFolderId = activeFolderId,
                        onActiveFolderChanged = { activeFolderId = it },
                        onOpenFile = { file, folderId -> openFile(file, folderId) },
                        onNavigate = { screen = it },
                        onSessionExpired = {
                            authenticated = false
                            connectFailed = false
                            screen = AppScreen.Dashboard
                        },
                        onMessage = { showMessage(it) },
                    )
                }
            }
        }
    }
}

@Composable
private fun SplashScreen() {
    Box(
        modifier = Modifier
            .fillMaxSize()
            .background(MaterialTheme.colorScheme.background),
        contentAlignment = Alignment.Center,
    ) {
        Column(horizontalAlignment = Alignment.CenterHorizontally) {
            Box(
                modifier = Modifier
                    .background(MaterialTheme.colorScheme.primary, androidx.compose.foundation.shape.RoundedCornerShape(22.dp))
                    .padding(20.dp),
            ) {
                Icon(Icons.Outlined.Lock, contentDescription = null, tint = MaterialTheme.colorScheme.onPrimary)
            }
            Text(
                "TeleVault",
                style = MaterialTheme.typography.headlineMedium,
                fontWeight = FontWeight.ExtraBold,
                modifier = Modifier.padding(top = 16.dp),
            )
            Text(
                "by Liethueis-Foundation",
                style = MaterialTheme.typography.labelMedium,
                color = MaterialTheme.colorScheme.onSurfaceVariant,
                modifier = Modifier.padding(top = 4.dp),
            )
            CircularProgressIndicator(
                modifier = Modifier.padding(top = 20.dp),
                strokeWidth = 2.5.dp,
            )
        }
    }
}

@Composable
private fun ConnectionFailedScreen(onRetry: () -> Unit) {
    Box(
        modifier = Modifier
            .fillMaxSize()
            .background(MaterialTheme.colorScheme.background)
            .padding(28.dp),
        contentAlignment = Alignment.Center,
    ) {
        Column(horizontalAlignment = Alignment.CenterHorizontally) {
            Box(
                modifier = Modifier
                    .background(MaterialTheme.colorScheme.primaryContainer, androidx.compose.foundation.shape.RoundedCornerShape(22.dp))
                    .padding(20.dp),
            ) {
                Icon(
                    Icons.Outlined.Lock,
                    contentDescription = null,
                    tint = MaterialTheme.colorScheme.primary,
                )
            }
            Text(
                "Can't reach Telegram",
                style = MaterialTheme.typography.headlineSmall,
                fontWeight = FontWeight.ExtraBold,
                modifier = Modifier.padding(top = 16.dp),
            )
            Text(
                "Your session is intact — we just couldn't connect. Check your internet connection and try again.",
                style = MaterialTheme.typography.bodyMedium,
                color = MaterialTheme.colorScheme.onSurfaceVariant,
                textAlign = TextAlign.Center,
                modifier = Modifier.padding(top = 8.dp),
            )
            Button(
                onClick = onRetry,
                modifier = Modifier.padding(top = 20.dp),
            ) {
                Text("Retry")
            }
        }
    }
}
