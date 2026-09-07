package one.zrp.social.mobile.ui.components

import androidx.compose.foundation.layout.size
import androidx.compose.material.icons.Icons
import androidx.compose.material.icons.filled.Newspaper
import androidx.compose.material.icons.filled.Verified
import androidx.compose.material3.Icon
import androidx.compose.runtime.Composable
import androidx.compose.ui.Modifier
import androidx.compose.ui.graphics.Color
import androidx.compose.ui.graphics.vector.ImageVector
import androidx.compose.ui.unit.Dp
import androidx.compose.ui.unit.dp

/**
 * The same real per-account badge the website's VerifiedBadge.tsx
 * renders next to a name - same badgeType values, same real per-type
 * color, same per-type glyph (BadgeCheck for every type except
 * journalist's distinct Newspaper), sourced from the same badgeType
 * field every user-identity response already carries (PostAuthor/
 * UserProfile/SearchUser/MobileUser). Not a native reinterpretation: a
 * badgeType this map doesn't recognize (or null) renders nothing,
 * exactly like the website's own fallback.
 */
private data class BadgeStyle(val color: Color, val label: String, val icon: ImageVector)

// Icons.Filled.Verified is the same seal-with-checkmark-cutout shape as
// web's BadgeCheck glyph (unlike a plain filled circle), already used
// elsewhere in this app (NotificationsScreen's Verified filter tab).
private val BadgeCheckIcon = Icons.Filled.Verified

private val BadgeStyles: Map<String, BadgeStyle> = mapOf(
    "verified" to BadgeStyle(Color(0xFF3B82F6), "Verified account", BadgeCheckIcon),
    "organization" to BadgeStyle(Color(0xFFFFD700), "Verified organization", BadgeCheckIcon),
    "government" to BadgeStyle(Color(0xFF9CA3AF), "Government official", BadgeCheckIcon),
    "team" to BadgeStyle(Color(0xFFEF4444), "ZRP Team", BadgeCheckIcon),
    // The website deliberately gives this one a different glyph
    // (Newspaper, not BadgeCheck) so it's never visually confused with
    // the "team" staff badge despite both leaning on ZRP red - matched
    // here rather than reusing the same seal shape for both.
    "journalist" to BadgeStyle(Color(0xFFFF2D2D), "Verified Journalist", Icons.Filled.Newspaper),
)

@Composable
fun VerifiedBadge(badgeType: String?, size: Dp = 16.dp, modifier: Modifier = Modifier) {
    val style = badgeType?.let { BadgeStyles[it] } ?: return
    Icon(
        imageVector = style.icon,
        contentDescription = style.label,
        tint = style.color,
        modifier = modifier.size(size),
    )
}
