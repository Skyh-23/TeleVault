package org.liethueis.televault

import androidx.compose.foundation.isSystemInDarkTheme
import androidx.compose.material3.MaterialTheme
import androidx.compose.material3.darkColorScheme
import androidx.compose.material3.lightColorScheme
import androidx.compose.runtime.Composable
import androidx.compose.ui.graphics.Color

// Telegram-inspired palette (https://colors.eva.ua — Telegram light/dark)

private val LightColors = lightColorScheme(
    primary = Color(0xFF3390EC),
    onPrimary = Color(0xFFFFFFFF),
    primaryContainer = Color(0xFFD4ECFF),
    onPrimaryContainer = Color(0xFF0B5394),
    secondary = Color(0xFF5B636A),
    onSecondary = Color(0xFFFFFFFF),
    secondaryContainer = Color(0xFFE3EBF1),
    onSecondaryContainer = Color(0xFF43484E),
    tertiary = Color(0xFF8E6A32),
    onTertiary = Color(0xFFFFFFFF),
    background = Color(0xFFF4F6F9),
    onBackground = Color(0xFF222529),
    surface = Color(0xFFFFFFFF),
    onSurface = Color(0xFF222529),
    surfaceVariant = Color(0xFFEFF2F5),
    onSurfaceVariant = Color(0xFF5A6168),
    surfaceContainerHighest = Color(0xFFE4E9EC),
    outline = Color(0xFFC8CDD2),
    error = Color(0xFFE53935),
    onError = Color(0xFFFFFFFF),
    errorContainer = Color(0xFFFFDAD6),
    onErrorContainer = Color(0xFF93000A),
)

private val DarkColors = darkColorScheme(
    primary = Color(0xFF6AB3F3),
    onPrimary = Color(0xFF0B2A47),
    primaryContainer = Color(0xFF1E4A73),
    onPrimaryContainer = Color(0xFFD4ECFF),
    secondary = Color(0xFF9AA7B2),
    onSecondary = Color(0xFF212830),
    secondaryContainer = Color(0xFF39444E),
    onSecondaryContainer = Color(0xFFD5DEE5),
    tertiary = Color(0xFFD9B97C),
    onTertiary = Color(0xFF3E2F0C),
    background = Color(0xFF17212B),
    onBackground = Color(0xFFE8ECEF),
    surface = Color(0xFF17212B),
    onSurface = Color(0xFFE8ECEF),
    surfaceVariant = Color(0xFF212D3B),
    onSurfaceVariant = Color(0xFF9AA7B2),
    surfaceContainerHighest = Color(0xFF2B3A49),
    outline = Color(0xFF44566A),
    error = Color(0xFFFF6B6B),
    onError = Color(0xFF4B0A0A),
    errorContainer = Color(0xFF6E1E1E),
    onErrorContainer = Color(0xFFFFDAD6),
)

@Composable
fun TeleVaultTheme(darkTheme: Boolean = isSystemInDarkTheme(), content: @Composable () -> Unit) {
    MaterialTheme(
        colorScheme = if (darkTheme) DarkColors else LightColors,
        content = content,
    )
}
