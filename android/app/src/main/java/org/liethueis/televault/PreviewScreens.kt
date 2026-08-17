package org.liethueis.televault

import android.graphics.Bitmap
import android.graphics.BitmapFactory
import android.media.AudioAttributes
import android.media.MediaPlayer
import androidx.compose.foundation.Image
import androidx.compose.foundation.background
import androidx.compose.foundation.gestures.detectTransformGestures
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
import androidx.compose.foundation.verticalScroll
import androidx.compose.material.icons.Icons
import androidx.compose.material.icons.automirrored.outlined.ArrowBack
import androidx.compose.material.icons.outlined.Pause
import androidx.compose.material.icons.outlined.PlayArrow
import androidx.compose.material.icons.outlined.Replay
import androidx.compose.material3.CircularProgressIndicator
import androidx.compose.material3.Icon
import androidx.compose.material3.IconButton
import androidx.compose.material3.MaterialTheme
import androidx.compose.material3.Slider
import androidx.compose.material3.Text
import androidx.compose.material3.TextButton
import androidx.compose.runtime.Composable
import androidx.compose.runtime.DisposableEffect
import androidx.compose.runtime.LaunchedEffect
import androidx.compose.runtime.getValue
import androidx.compose.runtime.mutableFloatStateOf
import androidx.compose.runtime.mutableIntStateOf
import androidx.compose.runtime.key
import androidx.compose.runtime.mutableStateOf
import androidx.compose.runtime.remember
import androidx.compose.runtime.rememberCoroutineScope
import androidx.compose.runtime.setValue
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.graphics.graphicsLayer
import androidx.compose.ui.graphics.asImageBitmap
import androidx.compose.ui.input.pointer.pointerInput
import androidx.compose.ui.layout.ContentScale
import androidx.compose.ui.platform.LocalContext
import androidx.compose.ui.text.font.FontWeight
import androidx.compose.ui.unit.dp
import androidx.compose.ui.viewinterop.AndroidView
import androidx.media3.common.MediaItem
import androidx.media3.common.PlaybackException
import androidx.media3.common.Player
import androidx.media3.exoplayer.ExoPlayer
import androidx.media3.ui.PlayerView
import kotlinx.coroutines.Dispatchers
import kotlinx.coroutines.delay
import kotlinx.coroutines.launch
import kotlinx.coroutines.withContext
import java.net.HttpURLConnection
import java.net.URL

// ─────────────────────────────────────────────────────────────────────
//  Shared preview scaffold
// ─────────────────────────────────────────────────────────────────────

@Composable
fun PreviewTopBar(title: String, subtitle: String, onBack: () -> Unit, action: (@Composable () -> Unit)? = null) {
    Row(
        modifier = Modifier
            .fillMaxWidth()
            .background(MaterialTheme.colorScheme.surface)
            .padding(horizontal = 4.dp, vertical = 8.dp),
        verticalAlignment = Alignment.CenterVertically,
    ) {
        IconButton(onClick = onBack) {
            Icon(Icons.AutoMirrored.Outlined.ArrowBack, contentDescription = "Back")
        }
        Column(Modifier.weight(1f)) {
            Text(title, style = MaterialTheme.typography.titleMedium, fontWeight = FontWeight.SemiBold, maxLines = 1)
            Text(subtitle, style = MaterialTheme.typography.labelSmall, color = MaterialTheme.colorScheme.onSurfaceVariant, maxLines = 1)
        }
        action?.invoke()
    }
}

/** Lazily starts the stream server. Returns (url, failed). */
@Composable
private fun rememberStreamUrl(
    engine: TeleVaultEngine,
    file: TeleFile,
    folderId: Long?,
    attempt: Int,
): Pair<String?, Boolean> {
    var url by remember(file.id) { mutableStateOf<String?>(null) }
    var failed by remember(file.id) { mutableStateOf(false) }
    LaunchedEffect(file.id, attempt) {
        // Reset on every attempt so a previous failure can never stick.
        failed = false
        runCatching {
            val port = engine.streamServerStart()
            engine.streamUrl(port, file, folderId)
        }.onSuccess { url = it }.onFailure { failed = true }
    }
    return url to failed
}

// ─────────────────────────────────────────────────────────────────────
//  Video player
// ─────────────────────────────────────────────────────────────────────

@Composable
fun VideoPlayerScreen(engine: TeleVaultEngine, file: TeleFile, folderId: Long?, onBack: () -> Unit) {
    // Re-attempt playback up to 3 times: the local stream server fails fast
    // (503) when the Telegram connection just dropped, and a quick retry lets
    // it recover instead of showing a dead-end error.
    var attempt by remember(file.id) { mutableStateOf(0) }
    val retryScope = rememberCoroutineScope()
    val (url, urlFailed) = rememberStreamUrl(engine, file, folderId, attempt)
    var loading by remember { mutableStateOf(true) }
    var failed by remember { mutableStateOf(false) }

    Column(
        modifier = Modifier
            .fillMaxSize()
            .background(MaterialTheme.colorScheme.background),
    ) {
        PreviewTopBar(title = file.name, subtitle = formatBytes(file.size), onBack = onBack)
        Box(
            modifier = Modifier
                .fillMaxSize()
                .background(MaterialTheme.colorScheme.background),
            contentAlignment = Alignment.Center,
        ) {
            val streamUrl = url
            if (streamUrl != null && !failed) {
                key("exo-$attempt") {
                    AndroidView(
                        factory = { ctx ->
                            PlayerView(ctx).apply {
                                // ExoPlayer (Media3) — the same engine Chrome/YouTube
                                // use. Robust HTTP range streaming, built-in buffering
                                // and retry, and precise error diagnostics.
                                useController = true
                                player = ExoPlayer.Builder(ctx).build().apply {
                                    setMediaItem(MediaItem.fromUri(streamUrl))
                                    playWhenReady = true
                                    addListener(object : Player.Listener {
                                        override fun onPlayerStateChanged(playWhenReady: Boolean, playbackState: Int) {
                                            when (playbackState) {
                                                Player.STATE_BUFFERING -> loading = true
                                                Player.STATE_READY -> {
                                                    loading = false
                                                    failed = false
                                                }
                                                Player.STATE_ENDED -> loading = false
                                            }
                                        }

                                        override fun onPlayerError(error: PlaybackException) {
                                            loading = false
                                            // Throttled mobile links can take 30-80s to pull the
                                            // first 5 MiB block, so stay patient: retry up to 6
                                            // times over ~90s. Once the block lands it's cached,
                                            // so the next retry starts instantly.
                                            if (attempt < 6) {
                                                retryScope.launch {
                                                    delay(3000)
                                                    attempt++
                                                }
                                            } else {
                                                failed = true
                                            }
                                        }
                                    })
                                    prepare()
                                }
                            }
                        },
                        onRelease = { view -> view.player?.release() },
                        modifier = Modifier.fillMaxSize(),
                    )
                }
            } else if (failed || urlFailed) {
                Column(horizontalAlignment = Alignment.CenterHorizontally) {
                    Text("Playback failed", color = MaterialTheme.colorScheme.error)
                    TextButton(onClick = { attempt++ }) { Text("Retry") }
                    TextButton(onClick = onBack) { Text("Back") }
                }
            } else {
                CircularProgressIndicator()
            }
            if (loading && url != null) {
                Box(
                    modifier = Modifier
                        .size(56.dp)
                        .background(MaterialTheme.colorScheme.surface.copy(alpha = 0.8f), androidx.compose.foundation.shape.CircleShape),
                    contentAlignment = Alignment.Center,
                ) {
                    CircularProgressIndicator(modifier = Modifier.size(28.dp), strokeWidth = 3.dp)
                }
            }
        }
    }
}

// ─────────────────────────────────────────────────────────────────────
//  Audio player
// ─────────────────────────────────────────────────────────────────────

@Composable
fun AudioPlayerScreen(engine: TeleVaultEngine, file: TeleFile, folderId: Long?, onBack: () -> Unit) {
    var attempt by remember(file.id) { mutableStateOf(0) }
    val (url, urlFailed) = rememberStreamUrl(engine, file, folderId, attempt)

    var player by remember { mutableStateOf<MediaPlayer?>(null) }
    var playing by remember { mutableStateOf(false) }
    var durationMs by remember { mutableIntStateOf(0) }
    var positionMs by remember { mutableIntStateOf(0) }
    var loading by remember { mutableStateOf(false) }
    var failed by remember { mutableStateOf(false) }

    DisposableEffect(Unit) {
        onDispose {
            player?.release()
            player = null
        }
    }

    LaunchedEffect(url) {
        val streamUrl = url
        if (streamUrl == null) {
            if (urlFailed) failed = true
            return@LaunchedEffect
        }
        player?.release()
        failed = false
        loading = true
        val mp = MediaPlayer()
        player = mp
        try {
            mp.setAudioAttributes(
                AudioAttributes.Builder()
                    .setUsage(AudioAttributes.USAGE_MEDIA)
                    .setContentType(AudioAttributes.CONTENT_TYPE_MUSIC)
                    .build(),
            )
            mp.setDataSource(streamUrl)
            mp.setOnPreparedListener {
                loading = false
                durationMs = it.duration.coerceAtLeast(0)
                it.start()
                playing = true
            }
            mp.setOnCompletionListener {
                playing = false
                positionMs = durationMs
            }
            mp.setOnErrorListener { _, _, _ ->
                loading = false
                failed = true
                true
            }
            mp.prepareAsync()
        } catch (e: Exception) {
            loading = false
            failed = true
        }
    }

    // Position ticker.
    LaunchedEffect(playing) {
        while (playing) {
            positionMs = player?.currentPosition ?: 0
            delay(500)
        }
    }

    Column(
        modifier = Modifier
            .fillMaxSize()
            .background(MaterialTheme.colorScheme.background),
    ) {
        PreviewTopBar(title = file.name, subtitle = formatBytes(file.size), onBack = onBack)
        Box(
            modifier = Modifier
                .fillMaxSize()
                .padding(24.dp),
            contentAlignment = Alignment.Center,
        ) {
            if (failed) {
                Text("Playback failed", color = MaterialTheme.colorScheme.error)
            } else {
                Column(horizontalAlignment = Alignment.CenterHorizontally, modifier = Modifier.fillMaxWidth()) {
                    // Album-art style placeholder
                    Box(
                        modifier = Modifier
                            .size(220.dp)
                            .background(MaterialTheme.colorScheme.primaryContainer, androidx.compose.foundation.shape.RoundedCornerShape(36.dp)),
                        contentAlignment = Alignment.Center,
                    ) {
                        Icon(
                            Icons.Outlined.PlayArrow,
                            contentDescription = null,
                            tint = MaterialTheme.colorScheme.primary,
                            modifier = Modifier.size(88.dp),
                        )
                    }
                    Spacer(Modifier.height(28.dp))
                    Text(file.name, style = MaterialTheme.typography.titleMedium, fontWeight = FontWeight.SemiBold, maxLines = 2)
                    Spacer(Modifier.height(4.dp))
                    Text(
                        if (loading) "Buffering…" else formatTime(positionMs),
                        style = MaterialTheme.typography.bodySmall,
                        color = MaterialTheme.colorScheme.onSurfaceVariant,
                    )
                    Spacer(Modifier.height(12.dp))
                    Slider(
                        value = positionMs.toFloat().coerceIn(0f, durationMs.toFloat().coerceAtLeast(1f)),
                        onValueChange = {
                            positionMs = it.toInt()
                            player?.seekTo(it.toInt())
                        },
                        valueRange = 0f..durationMs.toFloat().coerceAtLeast(1f),
                        modifier = Modifier.fillMaxWidth(),
                    )
                    Row(
                        modifier = Modifier.fillMaxWidth(),
                        horizontalArrangement = Arrangement.SpaceBetween,
                    ) {
                        Text(formatTime(positionMs), style = MaterialTheme.typography.labelSmall, color = MaterialTheme.colorScheme.onSurfaceVariant)
                        Text(formatTime(durationMs), style = MaterialTheme.typography.labelSmall, color = MaterialTheme.colorScheme.onSurfaceVariant)
                    }
                    Spacer(Modifier.height(20.dp))
                    Row(verticalAlignment = Alignment.CenterVertically) {
                        IconButton(onClick = {
                            player?.seekTo(0)
                            positionMs = 0
                        }) {
                            Icon(Icons.Outlined.Replay, contentDescription = "Restart", modifier = Modifier.size(28.dp))
                        }
                        Spacer(Modifier.width(20.dp))
                        IconButton(
                            onClick = {
                                val mp = player ?: return@IconButton
                                if (mp.isPlaying) {
                                    mp.pause()
                                    playing = false
                                } else {
                                    if (positionMs >= durationMs && durationMs > 0) {
                                        mp.seekTo(0)
                                        positionMs = 0
                                    }
                                    mp.start()
                                    playing = true
                                }
                            },
                            enabled = !loading && !failed,
                            modifier = Modifier
                                .size(72.dp)
                                .background(MaterialTheme.colorScheme.primary, androidx.compose.foundation.shape.CircleShape),
                        ) {
                            Icon(
                                if (playing) Icons.Outlined.Pause else Icons.Outlined.PlayArrow,
                                contentDescription = if (playing) "Pause" else "Play",
                                tint = MaterialTheme.colorScheme.onPrimary,
                                modifier = Modifier.size(36.dp),
                            )
                        }
                        Spacer(Modifier.width(20.dp))
                        IconButton(onClick = { /* repeat */ }) {
                            Icon(Icons.Outlined.Replay, contentDescription = "Restart", modifier = Modifier.size(28.dp))
                        }
                    }
                }
            }
        }
    }
}

private fun formatTime(ms: Int): String {
    val totalSeconds = ms / 1000
    val minutes = totalSeconds / 60
    val seconds = totalSeconds % 60
    return String.format("%d:%02d", minutes, seconds)
}

// ─────────────────────────────────────────────────────────────────────
//  Image viewer (pinch-zoom, streams from the local server)
// ─────────────────────────────────────────────────────────────────────

@Composable
fun ImageViewerScreen(engine: TeleVaultEngine, file: TeleFile, folderId: Long?, onBack: () -> Unit) {
    val (url, urlFailed) = rememberStreamUrl(engine, file, folderId, 0)
    var bitmap by remember(file.id) { mutableStateOf<Bitmap?>(null) }
    var failed by remember { mutableStateOf(false) }

    var scale by remember { mutableFloatStateOf(1f) }
    var offsetX by remember { mutableFloatStateOf(0f) }
    var offsetY by remember { mutableFloatStateOf(0f) }

    LaunchedEffect(url) {
        val streamUrl = url
        if (streamUrl == null) {
            if (urlFailed) failed = true
            return@LaunchedEffect
        }
        bitmap = withContext(Dispatchers.IO) {
            runCatching { decodeImageSampled(streamUrl) }.getOrNull()
        }
        if (bitmap == null) failed = true
    }

    Column(
        modifier = Modifier
            .fillMaxSize()
            .background(MaterialTheme.colorScheme.background),
    ) {
        PreviewTopBar(title = file.name, subtitle = "${formatBytes(file.size)}  •  tap to zoom", onBack = onBack)
        Box(
            modifier = Modifier
                .fillMaxSize()
                .background(MaterialTheme.colorScheme.background),
            contentAlignment = Alignment.Center,
        ) {
            val bmp = bitmap
            when {
                bmp != null -> Image(
                    bitmap = bmp.asImageBitmap(),
                    contentDescription = file.name,
                    contentScale = ContentScale.Fit,
                    modifier = Modifier
                        .fillMaxSize()
                        .graphicsLayer(
                            scaleX = scale,
                            scaleY = scale,
                            translationX = offsetX,
                            translationY = offsetY,
                        )
                        .pointerInput(Unit) {
                            detectTransformGestures { _, pan, zoom, _ ->
                                val newScale = (scale * zoom).coerceIn(1f, 6f)
                                // Scale offsets proportionally to keep the zoom centered.
                                offsetX = offsetX * (newScale / scale) + pan.x
                                offsetY = offsetY * (newScale / scale) + pan.y
                                scale = newScale
                            }
                        },
                )
                failed || urlFailed -> Column(horizontalAlignment = Alignment.CenterHorizontally) {
                    Text("Could not load image", color = MaterialTheme.colorScheme.error)
                    TextButton(onClick = onBack) { Text("Back") }
                }
                else -> CircularProgressIndicator()
            }
        }
    }
}

private fun decodeImageSampled(url: String): Bitmap {
    // Fetch once, decode with bounds-aware sampling to cap memory use.
    val connection: HttpURLConnection = URL(url).openConnection() as HttpURLConnection
    connection.connectTimeout = 20_000
    connection.readTimeout = 20_000
    connection.instanceFollowRedirects = true
    connection.connect()
    val bytes = connection.inputStream.use { it.readBytes() }
    connection.disconnect()

    val bounds = BitmapFactory.Options().apply { inJustDecodeBounds = true }
    BitmapFactory.decodeByteArray(bytes, 0, bytes.size, bounds)

    var sampleSize = 1
    while (bounds.outWidth / (sampleSize * 2) >= 2048 || bounds.outHeight / (sampleSize * 2) >= 2048) {
        sampleSize *= 2
    }
    val options = BitmapFactory.Options().apply { inSampleSize = sampleSize }
    return BitmapFactory.decodeByteArray(bytes, 0, bytes.size, options)
        ?: error("Unsupported image format")
}
