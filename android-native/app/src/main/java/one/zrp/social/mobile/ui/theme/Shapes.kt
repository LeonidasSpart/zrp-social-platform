package one.zrp.social.mobile.ui.theme

import androidx.compose.foundation.shape.RoundedCornerShape
import androidx.compose.material3.Shapes

/**
 * One shape scale for the whole app - chips/small controls use
 * extraSmall, track art/media/composer fields use medium, sheets and
 * story/album art use large. Reach for MaterialTheme.shapes.* instead
 * of a bespoke RoundedCornerShape(N.dp) so corner radii stay coherent
 * app-wide instead of drifting screen by screen.
 */
val ZrpShapes = Shapes(
    extraSmall = RoundedCornerShape(Radius.sm),
    small = RoundedCornerShape(Radius.sm),
    medium = RoundedCornerShape(Radius.md),
    large = RoundedCornerShape(Radius.lg),
    extraLarge = RoundedCornerShape(Radius.lg),
)
