package one.zrp.social.mobile.ui.home

import androidx.compose.animation.core.Animatable
import androidx.compose.animation.core.Spring
import androidx.compose.animation.core.spring
import androidx.compose.foundation.clickable
import androidx.compose.foundation.layout.Arrangement
import androidx.compose.foundation.layout.Column
import androidx.compose.foundation.layout.Row
import androidx.compose.foundation.layout.Spacer
import androidx.compose.foundation.layout.fillMaxWidth
import androidx.compose.foundation.layout.padding
import androidx.compose.foundation.layout.size
import androidx.compose.foundation.layout.width
import androidx.compose.material.icons.Icons
import androidx.compose.material.icons.filled.Bookmark
import androidx.compose.material.icons.filled.BookmarkBorder
import androidx.compose.material.icons.filled.ChatBubbleOutline
import androidx.compose.material.icons.filled.DeleteOutline
import androidx.compose.material.icons.filled.Favorite
import androidx.compose.material.icons.filled.FavoriteBorder
import androidx.compose.material.icons.filled.Flag
import androidx.compose.material.icons.filled.Repeat
import androidx.compose.material3.HorizontalDivider
import androidx.compose.material3.Icon
import androidx.compose.material3.IconButton
import androidx.compose.material3.MaterialTheme
import androidx.compose.material3.Text
import androidx.compose.runtime.Composable
import androidx.compose.runtime.LaunchedEffect
import androidx.compose.runtime.getValue
import androidx.compose.runtime.mutableStateOf
import androidx.compose.runtime.remember
import androidx.compose.runtime.setValue
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.draw.clip
import androidx.compose.ui.draw.scale
import androidx.compose.ui.layout.ContentScale
import androidx.compose.ui.text.font.FontWeight
import androidx.compose.ui.unit.dp
import coil.compose.AsyncImage
import one.zrp.social.mobile.network.Post
import one.zrp.social.mobile.ui.components.Avatar
import one.zrp.social.mobile.ui.components.VerifiedBadge
import one.zrp.social.mobile.ui.theme.Spacing
import one.zrp.social.mobile.ui.theme.TouchTarget
import one.zrp.social.mobile.ui.theme.IconSize
import one.zrp.social.mobile.ui.theme.ZrpBlue
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
    onBookmarkClick: (String) -> Unit = {},
    onReportClick: (String) -> Unit = {},
    isOwnPost: Boolean = false,
    onDeleteClick: (String) -> Unit = {},
) {
    Column(
        modifier = Modifier
            .fillMaxWidth()
            .clickable { onClick(post.id) }
            .padding(horizontal = Spacing.lg, vertical = Spacing.md),
    ) {
        Row(verticalAlignment = Alignment.Top) {
            Avatar(
                url = post.author.avatarUrl,
                name = post.author.name ?: post.author.username,
                size = 48.dp,
                modifier = Modifier.clickable { onAuthorClick(post.author.username) },
            )

            Spacer(modifier = Modifier.width(Spacing.md))

            Column(modifier = Modifier.fillMaxWidth()) {
                Row(
                    verticalAlignment = Alignment.CenterVertically,
                    modifier = Modifier.fillMaxWidth(),
                ) {
                    Row(
                        verticalAlignment = Alignment.CenterVertically,
                        modifier = Modifier
                            .weight(1f)
                            .clickable { onAuthorClick(post.author.username) },
                    ) {
                        Text(
                            text = post.author.name ?: post.author.username,
                            style = MaterialTheme.typography.titleSmall,
                            fontWeight = FontWeight.Bold,
                            maxLines = 1,
                        )
                        VerifiedBadge(badgeType = post.author.badgeType, modifier = Modifier.padding(start = 3.dp))
                        Spacer(modifier = Modifier.width(6.dp))
                        Text(
                            text = "@${post.author.username}",
                            style = MaterialTheme.typography.bodySmall,
                            color = MaterialTheme.colorScheme.onSurfaceVariant,
                            maxLines = 1,
                        )
                        Spacer(modifier = Modifier.width(6.dp))
                        Text(
                            text = "· ${formatRelativeTime(post.createdAt)}",
                            style = MaterialTheme.typography.bodySmall,
                            color = MaterialTheme.colorScheme.onSurfaceVariant,
                            maxLines = 1,
                        )
                    }

                    // The website shows Edit/Delete for the post's own
                    // author and Report for everyone else - isOwnPost
                    // mirrors that same isAuthor branch. Only ProfileScreen
                    // currently knows per-post ownership cheaply (every
                    // post on a profile page IS that profile's own
                    // author's post); Home/Search/Bookmarks default to
                    // the Report action, matching what the website shows
                    // for a post you don't own.
                    if (isOwnPost) {
                        IconButton(onClick = { onDeleteClick(post.id) }, modifier = Modifier.size(TouchTarget.min)) {
                            Icon(
                                imageVector = Icons.Filled.DeleteOutline,
                                contentDescription = "Delete post",
                                tint = MaterialTheme.colorScheme.onSurfaceVariant,
                                modifier = Modifier.size(IconSize.sm),
                            )
                        }
                    } else {
                        IconButton(onClick = { onReportClick(post.id) }, modifier = Modifier.size(TouchTarget.min)) {
                            Icon(
                                imageVector = Icons.Filled.Flag,
                                contentDescription = "Report post",
                                tint = MaterialTheme.colorScheme.onSurfaceVariant,
                                modifier = Modifier.size(IconSize.sm),
                            )
                        }
                    }
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
                            .padding(top = Spacing.sm)
                            .clip(MaterialTheme.shapes.medium),
                    )
                }

                Row(
                    modifier = Modifier
                        .fillMaxWidth()
                        .padding(top = Spacing.xs),
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
                    BookmarkButton(
                        bookmarked = post.bookmarked == true,
                        onClick = { onBookmarkClick(post.id) },
                    )
                }
            }
        }

        HorizontalDivider(modifier = Modifier.padding(top = Spacing.md))
    }
}

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
        IconButton(onClick = onClick, modifier = Modifier.size(TouchTarget.min)) {
            Icon(
                imageVector = icon,
                contentDescription = contentDescription,
                tint = resolvedTint,
                modifier = Modifier.size(IconSize.sm),
            )
        }
        Text(
            text = formatCount(count),
            style = MaterialTheme.typography.bodySmall,
            color = resolvedTint,
        )
    }
}

// The one moment on this screen worth a deliberate flourish: liking a
// post pops the heart briefly past full size before it settles, the
// same "felt" acknowledgement every reference feed app gives this
// specific action. Keyed off an actual liked:false -> true transition
// (not the raw value) so a post that was already liked before this
// card even entered composition - e.g. scrolling back up the feed -
// never re-triggers it on mount.
@Composable
private fun LikeStat(liked: Boolean, count: Int, onClick: () -> Unit) {
    var wasLiked by remember { mutableStateOf(liked) }
    val scale = remember { Animatable(1f) }

    LaunchedEffect(liked) {
        if (liked && !wasLiked) {
            scale.snapTo(0.7f)
            scale.animateTo(1f, spring(dampingRatio = Spring.DampingRatioMediumBouncy, stiffness = Spring.StiffnessLow))
        }
        wasLiked = liked
    }

    Row(verticalAlignment = Alignment.CenterVertically) {
        IconButton(onClick = onClick, modifier = Modifier.size(TouchTarget.min)) {
            Icon(
                imageVector = if (liked) Icons.Filled.Favorite else Icons.Filled.FavoriteBorder,
                contentDescription = if (liked) "Unlike" else "Like",
                tint = if (liked) ZrpRed else MaterialTheme.colorScheme.onSurfaceVariant,
                modifier = Modifier
                    .size(IconSize.sm)
                    .scale(scale.value),
            )
        }
        Text(
            text = formatCount(count),
            style = MaterialTheme.typography.bodySmall,
            color = if (liked) ZrpRed else MaterialTheme.colorScheme.onSurfaceVariant,
        )
    }
}

// No count shown, matching the website's own bookmark control (a
// plain toggle icon, never a bookmark tally next to a post).
@Composable
private fun BookmarkButton(bookmarked: Boolean, onClick: () -> Unit) {
    IconButton(onClick = onClick, modifier = Modifier.size(TouchTarget.min)) {
        Icon(
            imageVector = if (bookmarked) Icons.Filled.Bookmark else Icons.Filled.BookmarkBorder,
            contentDescription = if (bookmarked) "Remove bookmark" else "Bookmark",
            tint = if (bookmarked) ZrpBlue else MaterialTheme.colorScheme.onSurfaceVariant,
            modifier = Modifier.size(IconSize.sm),
        )
    }
}
