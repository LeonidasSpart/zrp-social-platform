package one.zrp.social.mobile.ui.components

import androidx.compose.foundation.BorderStroke
import androidx.compose.foundation.background
import androidx.compose.foundation.border
import androidx.compose.foundation.layout.Box
import androidx.compose.foundation.layout.size
import androidx.compose.foundation.shape.CircleShape
import androidx.compose.material3.MaterialTheme
import androidx.compose.material3.Text
import androidx.compose.runtime.Composable
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.draw.clip
import androidx.compose.ui.graphics.Color
import androidx.compose.ui.layout.ContentScale
import androidx.compose.ui.text.font.FontWeight
import androidx.compose.ui.unit.Dp
import androidx.compose.ui.unit.dp
import androidx.compose.ui.unit.sp
import coil.compose.AsyncImage

/**
 * A user's avatar - their real photo when set, otherwise the same
 * "colored circle + first initial" placeholder the website falls back
 * to (see PostCard.tsx's getInitial()/avatar markup), rather than a
 * bare icon glyph with no visual weight. Shared across every screen
 * that shows a user (posts, comments, profile, search, messages,
 * notifications) so avatars read consistently app-wide.
 *
 * [ringColor] draws a solid border in that color around the avatar -
 * used only where an avatar overlaps another surface (the profile
 * header's avatar sitting on top of the cover photo) so it reads as
 * "cut out" of what's behind it, matching the ring every reference
 * profile layout uses for the same reason.
 */
@Composable
fun Avatar(
    url: String?,
    name: String,
    size: Dp,
    modifier: Modifier = Modifier,
    ringColor: Color? = null,
    ringWidth: Dp = 3.dp,
) {
    val ringModifier = if (ringColor != null) {
        Modifier.border(BorderStroke(ringWidth, ringColor), CircleShape)
    } else {
        Modifier
    }

    if (url != null) {
        AsyncImage(
            model = url,
            contentDescription = name,
            contentScale = ContentScale.Crop,
            modifier = modifier
                .size(size)
                .clip(CircleShape)
                .then(ringModifier),
        )
    } else {
        Box(
            modifier = modifier
                .size(size)
                .clip(CircleShape)
                .background(MaterialTheme.colorScheme.surfaceVariant)
                .then(ringModifier),
            contentAlignment = Alignment.Center,
        ) {
            Text(
                text = name.trim().firstOrNull()?.uppercaseChar()?.toString() ?: "?",
                color = MaterialTheme.colorScheme.onSurfaceVariant,
                fontWeight = FontWeight.SemiBold,
                fontSize = (size.value / 2.2f).sp,
            )
        }
    }
}
