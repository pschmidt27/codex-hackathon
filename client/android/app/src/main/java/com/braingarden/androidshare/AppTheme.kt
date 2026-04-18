package com.braingarden.androidshare

import androidx.compose.foundation.isSystemInDarkTheme
import androidx.compose.material3.MaterialTheme
import androidx.compose.material3.darkColorScheme
import androidx.compose.material3.lightColorScheme
import androidx.compose.runtime.Composable
import androidx.compose.ui.graphics.Color

private val LightColorScheme = lightColorScheme(
    primary = Color(0xFF0F6B6F),
    onPrimary = Color(0xFFFFFFFF),
    primaryContainer = Color(0xFFB9ECE6),
    onPrimaryContainer = Color(0xFF002021),
    secondary = Color(0xFF4D6358),
    onSecondary = Color(0xFFFFFFFF),
    secondaryContainer = Color(0xFFCFE9D8),
    onSecondaryContainer = Color(0xFF0A1F16),
    tertiary = Color(0xFFD49B2A),
    onTertiary = Color(0xFF2C1700),
    tertiaryContainer = Color(0xFFFFDEA7),
    onTertiaryContainer = Color(0xFF432C00),
    background = Color(0xFFFFFFFF),
    onBackground = Color(0xFF161D1B),
    surface = Color(0xFFFFFFFF),
    onSurface = Color(0xFF161D1B),
    surfaceVariant = Color(0xFFE6EEEA),
    onSurfaceVariant = Color(0xFF3F4A46),
    outline = Color(0xFF6F7A75),
)

private val DarkColorScheme = darkColorScheme(
    primary = Color(0xFF8FD0CA),
    onPrimary = Color(0xFF003739),
    primaryContainer = Color(0xFF005055),
    onPrimaryContainer = Color(0xFFB9ECE6),
    secondary = Color(0xFFB4CDC0),
    onSecondary = Color(0xFF20352B),
    secondaryContainer = Color(0xFF364B41),
    onSecondaryContainer = Color(0xFFCFE9D8),
    tertiary = Color(0xFFF3C25F),
    onTertiary = Color(0xFF412C00),
    tertiaryContainer = Color(0xFF5D4300),
    onTertiaryContainer = Color(0xFFFFDEA7),
    background = Color(0xFF0E1513),
    onBackground = Color(0xFFDEE4E0),
    surface = Color(0xFF0E1513),
    onSurface = Color(0xFFDEE4E0),
    surfaceVariant = Color(0xFF3F4A46),
    onSurfaceVariant = Color(0xFFBFC9C4),
    outline = Color(0xFF89938E),
)

@Composable
fun BrainGardenTheme(
    darkTheme: Boolean = isSystemInDarkTheme(),
    content: @Composable () -> Unit,
) {
    MaterialTheme(
        colorScheme = if (darkTheme) DarkColorScheme else LightColorScheme,
        content = content,
    )
}
