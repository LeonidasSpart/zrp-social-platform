package one.zrp.social.mobile.ui.components

import androidx.compose.foundation.layout.size
import androidx.compose.material.icons.Icons
import androidx.compose.material.icons.filled.Verified
import androidx.compose.material3.Icon
import androidx.compose.runtime.Composable
import androidx.compose.ui.Modifier
import androidx.compose.ui.graphics.Color
import androidx.compose.ui.unit.Dp
import androidx.compose.ui.unit.dp

/**
 * The same real per-account badge the website's VerifiedBadge.tsx
 * renders next to a name - same badgeType values, same real per-type
 * color, sourced from the same badgeType field every user-identity
 * response already carries (PostAuthor/UserProfile/SearchUser/
 * MobileUser). Not a native reinterpretation: a badgeType this map
 * doesn't recognize (or null) renders nothing, exactly like the
 * website's own fallback.
 */
private data class BadgeStyle(val color: Color, val label: String)

private val BadgeStyles: Map<String, BadgeStyle> = mapOf(
    "verified" to BadgeStyle(Color(0xFF3B82F6), "Verified account"),
    "organization" to BadgeStyle(Color(0xFFFFD700), "Verified organization"),
    "government" to BadgeStyle(Color(0xFF9CA3AF), "Government official"),
    "team" to BadgeStyle(Color(0xFFEF4444), "ZRP Team"),
    // The website distinguishes this one with a Newspaper glyph instead
    // of the shared checkmark so it's never confused with the "team"
    // staff badge despite both using ZRP red. Native keeps the same
    // checkmark shape (no matching Material "newspaper" glyph carries
    // the same read-at-a-glance clarity at this size) but keeps the
    // color distinction, the one piece that actually still works and
    // matters more than the exact same glyph on a different platform.
    "journalist" to BadgeStyle(Color(0xFFFF2D2D), "Verified Journalist"),
)

@Composable
fun VerifiedBadge(badgeType: String?, size: Dp = 16.dp, modifier: Modifier = Modifier) {
    val style = badgeType?.let { BadgeStyles[it] } ?: return
    // The website's own BadgeCheck glyph (a scalloped-seal outline with
    // a checkmark cut out of it) doesn't have a 1:1 Compose equivalent,
    // but Material's own "Verified" seal - already used elsewhere in
    // this app (NotificationsScreen's Verified filter tab) - is the
    // same seal-with-checkmark-cutout shape, unlike a plain filled
    // circle, so it reads as the same real badge shape rather than a
    // generic checkmark icon.
    Icon(
        imageVector = Icons.Filled.Verified,
        contentDescription = style.label,
        tint = style.color,
        modifier = modifier.size(size),
    )
}
