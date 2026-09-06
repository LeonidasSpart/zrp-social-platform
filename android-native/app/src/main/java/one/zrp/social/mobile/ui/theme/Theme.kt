package one.zrp.social.mobile.ui.theme

import androidx.compose.foundation.isSystemInDarkTheme
import androidx.compose.material3.MaterialTheme
import androidx.compose.material3.darkColorScheme
import androidx.compose.material3.lightColorScheme
import androidx.compose.runtime.Composable
import androidx.compose.ui.graphics.Color

// ZRP ships dark-first (the web app defaults to a black/red dark theme),
// so the dark scheme is the "real" one; light exists for system light
// mode rather than as the primary design target. Surface levels form a
// deliberate elevation ramp (each a little lighter than the last, the
// Android dark-theme convention) so a card, a sheet, and the page
// behind them read as distinct depths instead of one flat black - see
// the ZrpSurface... and ZrpOutline... constants in Color.kt.
private val ZrpDarkColorScheme = darkColorScheme(
    primary = ZrpRed,
    onPrimary = ZrpWhite,
    secondary = ZrpBlue,
    onSecondary = ZrpWhite,
    background = ZrpSurfaceDim,
    onBackground = ZrpWhite,
    surface = ZrpSurfaceDim,
    onSurface = ZrpWhite,
    surfaceVariant = ZrpSurfaceHigh,
    onSurfaceVariant = ZrpSilver,
    surfaceContainerLowest = ZrpSurfaceDim,
    surfaceContainerLow = ZrpSurfaceLow,
    surfaceContainer = ZrpSurfaceContainer,
    surfaceContainerHigh = ZrpSurfaceHigh,
    surfaceContainerHighest = ZrpSurfaceHighest,
    surfaceDim = ZrpSurfaceDim,
    surfaceBright = ZrpSurfaceHighest,
    outline = ZrpOutline,
    outlineVariant = ZrpOutlineFaint,
    error = ZrpDarkRed,
)

private val ZrpLightColorScheme = lightColorScheme(
    primary = ZrpRed,
    onPrimary = ZrpWhite,
    secondary = ZrpBlueDark,
    onSecondary = ZrpWhite,
    background = ZrpWhite,
    onBackground = ZrpCharcoal,
    surface = ZrpWhite,
    onSurface = ZrpCharcoal,
    surfaceVariant = ZrpLightSurfaceHigh,
    onSurfaceVariant = Color(0xFF6B7280),
    surfaceContainerLowest = ZrpWhite,
    surfaceContainerLow = ZrpLightSurfaceContainer,
    surfaceContainer = ZrpLightSurfaceContainer,
    surfaceContainerHigh = ZrpLightSurfaceHigh,
    surfaceContainerHighest = ZrpLightOutline,
    outline = ZrpLightOutline,
    outlineVariant = ZrpLightSurfaceHigh,
    error = ZrpDarkRed,
)

@Composable
fun ZrpSocialTheme(
    darkTheme: Boolean = isSystemInDarkTheme(),
    content: @Composable () -> Unit,
) {
    val colorScheme = if (darkTheme) ZrpDarkColorScheme else ZrpLightColorScheme

    MaterialTheme(
        colorScheme = colorScheme,
        typography = ZrpTypography,
        shapes = ZrpShapes,
        content = content,
    )
}
