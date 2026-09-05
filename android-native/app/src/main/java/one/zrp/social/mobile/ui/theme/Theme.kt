package one.zrp.social.mobile.ui.theme

import androidx.compose.foundation.isSystemInDarkTheme
import androidx.compose.material3.MaterialTheme
import androidx.compose.material3.darkColorScheme
import androidx.compose.material3.lightColorScheme
import androidx.compose.runtime.Composable

// ZRP ships dark-first (the web app defaults to a black/red dark theme),
// so the dark scheme is the "real" one; light exists for system light
// mode rather than as the primary design target.
private val ZrpDarkColorScheme = darkColorScheme(
    primary = ZrpRed,
    onPrimary = ZrpWhite,
    secondary = ZrpBlue,
    onSecondary = ZrpWhite,
    background = ZrpDeepBlack,
    onBackground = ZrpWhite,
    surface = ZrpCharcoal,
    onSurface = ZrpWhite,
    surfaceVariant = ZrpCharcoal,
    onSurfaceVariant = ZrpSilver,
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
        content = content,
    )
}
