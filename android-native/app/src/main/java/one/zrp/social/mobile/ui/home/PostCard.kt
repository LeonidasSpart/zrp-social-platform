package one.zrp.social.mobile.ui.home

import androidx.compose.foundation.clickable
import androidx.compose.foundation.layout.Arrangement
import androidx.compose.foundation.layout.Column
import androidx.compose.foundation.layout.Row
import androidx.compose.foundation.layout.Spacer
import androidx.compose.foundation.layout.fillMaxWidth
import androidx.compose.foundation.layout.padding
import androidx.compose.foundation.layout.size
import androidx.compose.foundation.layout.width
import androidx.compose.foundation.shape.RoundedCornerShape
import androidx.compose.material.icons.Icons
import androidx.compose.material.icons.filled.ChatBubbleOutline
import androidx.compose.material.icons.filled.Favorite
import androidx.compose.material.icons.filled.FavoriteBorder
import androidx.compose.material.icons.filled.Repeat
import androidx.compose.material3.HorizontalDivider
import androidx.compose.material3.Icon
import androidx.compose.material3.IconButton
import androidx.compose.material3.MaterialTheme
import androidx.compose.material3.Text
import androidx.compose.runtime.Composable
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.draw.clip
import androidx.compose.ui.layout.ContentScale
import androidx.compose.ui.text.font.FontWeight
import androidx.compose.ui.unit.dp
import coil.compose.AsyncImage
import one.zrp.social.mobile.network.Post
import one.zrp.social.mobile.ui.components.Avatar
import one.zrp.social.mobile.ui.theme.ZrpGreen
import one.zrp.social.mobile.ui.theme.ZrpRed
import one.zrp.social.mobile.util.formatCount
import one.zrp.social.mobile.util.formatRelativeTime

/**
 * The native app's own post card - not a copy of any of the website's
 * feed markup, but showing the exact same real fields (author, media,
 * counts, like state) the website's post cards render, from the same
 * backend response.
 */
@Composable
fun PostCard(
    post: Post,
    onLikeClick: (String) -> Unit,
    onCommentClick: (String) -> Unit,
    onRepostClick: (String) -> Unit,
    onClick: (String) -> Unit,
    onAuthorClick: (String) -> Unit,
) {
    Column(
        modifier = Modifier
            .fillMaxWidth()
            .clickable { onClick(post.id) }
            .padding(horizontal = 16.dp, vertical = 12.dp),
    ) {
        Row(verticalAlignment = Alignment.Top) {
            Avatar(
                url = post.author.avatarUrl,
                name = post.author.name ?: post.author.username,
                size = 48.dp,
                modifier = Modifier.clickable { onAuthorClick(post.author.username) },
            )

            Spacer(modifier = Modifier.width(12.dp))

            Column(modifier = Modifier.fillMaxWidth()) {
                Row(
                    verticalAlignment = Alignment.CenterVertically,
                    modifier = Modifier.clickable { onAuthorClick(post.author.username) },
                ) {
                    Text(
                        text = post.author.name ?: post.author.username,
                        style = MaterialTheme.typography.titleSmall,
                        fontWeight = FontWeight.Bold,
                    )
                    Spacer(modifier = Modifier.width(6.dp))
                    Text(
                        text = "@${post.author.username}",
                        style = MaterialTheme.typography.bodySmall,
                        color = MaterialTheme.colorScheme.onSurfaceVariant,
                    )
                    Spacer(modifier = Modifier.width(6.dp))
                    Text(
                        text = "· ${formatRelativeTime(post.createdAt)}",
                        style = MaterialTheme.typography.bodySmall,
                        color = MaterialTheme.colorScheme.onSurfaceVariant,
                    )
                }

                if (post.content.isNotBlank()) {
                    Text(
                        text = post.content,
                        style = MaterialTheme.typography.bodyMedium,
                        modifier = Modifier.padding(top = 4.dp),
                    )
                }

                val previewUrl = post.imageUrl ?: post.imageUrls?.firstOrNull()
                if (previewUrl != null) {
                    AsyncImage(
                        model = previewUrl,
                        contentDescription = null,
                        contentScale = ContentScale.Crop,
                        modifier = Modifier
                            .fillMaxWidth()
                            .padding(top = 8.dp)
                            .clip(RoundedCornerShape(12.dp)),
                    )
                }

                Row(
                    modifier = Modifier
                        .fillMaxWidth()
                        .padding(top = 4.dp),
                    horizontalArrangement = Arrangement.SpaceBetween,
                ) {
                    PostStat(
                        icon = Icons.Filled.ChatBubbleOutline,
                        count = post._count.comments,
                        contentDescription = "Comments",
                        onClick = { onCommentClick(post.id) },
                    )
                    PostStat(
                        icon = Icons.Filled.Repeat,
                        count = post._count.reposts,
                        contentDescription = "Repost",
                        tint = ZrpGreen,
                        active = post.reposted == true,
                        onClick = { onRepostClick(post.id) },
                    )
                    LikeStat(
                        liked = post.liked == true,
                        count = post._count.likes,
                        onClick = { onLikeClick(post.id) },
                    )
                }
            }
        }

        HorizontalDivider(modifier = Modifier.padding(top = 12.dp))
    }
}

// 48dp is Android's own documented minimum accessible touch target
// (see the Accessibility Scanner / Material Design guidelines) - the
// icon glyph itself stays visually compact at 18dp, but IconButton's
// padding fills the rest so a real finger on a real device actually
// lands the tap instead of missing a tiny hitbox.
private val StatTouchTargetSize = 48.dp

// Each stat's accent color only shows once it's actually active (liked/
// reposted) - matching the website's action bar, where comment=blue,
// repost=green and like=red are hover/active accents on top of a
// neutral gray resting state, not permanent icon colors.
@Composable
private fun PostStat(
    icon: androidx.compose.ui.graphics.vector.ImageVector,
    count: Int,
    contentDescription: String,
    onClick: () -> Unit,
    tint: androidx.compose.ui.graphics.Color = MaterialTheme.colorScheme.onSurfaceVariant,
    active: Boolean = false,
) {
    val resolvedTint = if (active) tint else MaterialTheme.colorScheme.onSurfaceVariant
    Row(verticalAlignment = Alignment.CenterVertically) {
        IconButton(onClick = onClick, modifier = Modifier.size(StatTouchTargetSize)) {
            Icon(
                imageVector = icon,
                contentDescription = contentDescription,
                tint = resolvedTint,
                modifier = Modifier.size(18.dp),
            )
        }
        Text(
            text = formatCount(count),
            style = MaterialTheme.typography.bodySmall,
            color = resolvedTint,
        )
    }
}

@Composable
private fun LikeStat(liked: Boolean, count: Int, onClick: () -> Unit) {
    Row(verticalAlignment = Alignment.CenterVertically) {
        IconButton(onClick = onClick, modifier = Modifier.size(StatTouchTargetSize)) {
            Icon(
                imageVector = if (liked) Icons.Filled.Favorite else Icons.Filled.FavoriteBorder,
                contentDescription = if (liked) "Unlike" else "Like",
                tint = if (liked) ZrpRed else MaterialTheme.colorScheme.onSurfaceVariant,
                modifier = Modifier.size(18.dp),
            )
        }
        Text(
            text = formatCount(count),
            style = MaterialTheme.typography.bodySmall,
            color = if (liked) ZrpRed else MaterialTheme.colorScheme.onSurfaceVariant,
        )
    }
}
