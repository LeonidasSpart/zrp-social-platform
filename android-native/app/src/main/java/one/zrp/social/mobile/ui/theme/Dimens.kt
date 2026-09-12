package one.zrp.social.mobile.ui.theme

import androidx.compose.ui.unit.dp

/**
 * The native app's own spacing/sizing scale - not derived from the
 * website's CSS (Tailwind's rem-based scale doesn't map 1:1 onto
 * Android dp anyway), but a single deliberate scale so every screen
 * breathes the same way instead of each one picking its own padding
 * numbers. Prefer these over ad-hoc `.dp` literals in new or touched
 * UI code.
 */
object Spacing {
    val xs = 4.dp
    val sm = 8.dp
    val md = 12.dp
    val lg = 16.dp
    val xl = 24.dp
    val xxl = 32.dp
}

/** Corner radii - three sizes cover every card/sheet/chip in the app. */
object Radius {
    val sm = 10.dp
    val md = 16.dp
    val lg = 22.dp
}

/** Icon glyph sizes, independent of the touch target that contains them. */
object IconSize {
    val sm = 18.dp
    val md = 24.dp
    val lg = 32.dp
}

/**
 * 48dp is Android's own documented minimum accessible touch target
 * (Accessibility Scanner / Material guidelines) - every tappable icon
 * control should size its IconButton/clickable area to at least this,
 * independent of how small the glyph inside it looks.
 *
 * `comfortable` (56dp) is not an accessibility minimum - it's the
 * senior-friendly redesign's own target for a primary navigation row
 * (a bottom-bar item, a drawer row, the "+" create action): a target
 * clearly larger than the floor, not just at it.
 */
object TouchTarget {
    val min = 48.dp
    val comfortable = 56.dp
}
