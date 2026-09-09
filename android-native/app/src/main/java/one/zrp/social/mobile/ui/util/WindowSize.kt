package one.zrp.social.mobile.ui.util

import androidx.compose.material3.windowsizeclass.ExperimentalMaterial3WindowSizeClassApi
import androidx.compose.material3.windowsizeclass.WindowSizeClass
import androidx.compose.material3.windowsizeclass.WindowWidthSizeClass

/**
 * Whether the real current window is wide enough for a tablet-class
 * two-pane (list + detail) layout - Google's own
 * calculateWindowSizeClass(Activity) (see MainActivity), not a fixed dp
 * guess. Medium and Expanded (>= 600dp width - a small tablet in
 * portrait and up) both qualify, matching Material's own adaptive-
 * layout guidance for when a list-detail pattern is appropriate; only
 * Compact (phones, and a phone-sized split-screen window) stays
 * single-pane.
 */
@OptIn(ExperimentalMaterial3WindowSizeClassApi::class)
fun WindowSizeClass.isTwoPane(): Boolean = widthSizeClass != WindowWidthSizeClass.Compact
