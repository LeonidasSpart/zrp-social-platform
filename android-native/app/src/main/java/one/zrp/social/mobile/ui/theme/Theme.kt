package one.zrp.social.mobile.ui.theme

import android.app.Activity
import androidx.compose.foundation.isSystemInDarkTheme
import androidx.compose.material3.MaterialTheme
import androidx.compose.material3.darkColorScheme
import androidx.compose.material3.lightColorScheme
import androidx.compose.runtime.Composable
import androidx.compose.runtime.SideEffect
import androidx.compose.ui.graphics.Color
import androidx.compose.ui.platform.LocalView
import androidx.core.view.WindowCompat

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

    // enableEdgeToEdge() in MainActivity.onCreate() only picks the status/
    // navigation bar icon contrast ONCE, from the system's dark/light state
    // at that moment - and MainActivity declares "uiMode" in its own
    // android:configChanges (see its own comment on why: avoiding an
    // Activity recreate for rotation/fold also happens to cover system
    // theme changes), so a system Light/Dark flip while the app is already
    // open does NOT rerun onCreate and does NOT re-run enableEdgeToEdge().
    // Compose itself still recomposes correctly on that same config change
    // (isSystemInDarkTheme() is reactive), so the page content flips theme
    // live while the status bar icons silently stayed stuck on the old
    // mode - invisible-on-invisible is exactly the "status bar broken in
    // one mode" class of bug this pass looked for. Driving the system bar
    // icon appearance from here instead, on every recomposition where the
    // resolved `darkTheme` changes, fixes that AND is what makes a manual
    // Settings override (see MainActivity's ThemePreferenceStore use) take
    // effect immediately without needing its own separate plumbing.
    val view = LocalView.current
    if (!view.isInEditMode) {
        SideEffect {
            val window = (view.context as? Activity)?.window ?: return@SideEffect
            val controller = WindowCompat.getInsetsController(window, view)
            controller.isAppearanceLightStatusBars = !darkTheme
            controller.isAppearanceLightNavigationBars = !darkTheme
        }
    }

    MaterialTheme(
        colorScheme = colorScheme,
        typography = ZrpTypography,
        shapes = ZrpShapes,
        content = content,
    )
}

/**
 * Resolves the manual Light/Dark override from [ThemePreferenceStore]
 * against the live system setting - null (no explicit choice made yet)
 * means "follow the system", exactly matching the website's own
 * ThemeContext.tsx no-saved-preference behaviour.
 */
fun resolveDarkTheme(storedPreference: Boolean?, systemDark: Boolean): Boolean =
    storedPreference ?: systemDark
