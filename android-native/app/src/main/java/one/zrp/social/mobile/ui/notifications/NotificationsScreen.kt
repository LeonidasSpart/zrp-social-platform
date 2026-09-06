package one.zrp.social.mobile.ui.notifications

import androidx.compose.foundation.background
import androidx.compose.foundation.clickable
import androidx.compose.foundation.layout.Box
import androidx.compose.foundation.layout.Column
import androidx.compose.foundation.layout.Row
import androidx.compose.foundation.layout.Spacer
import androidx.compose.foundation.layout.fillMaxSize
import androidx.compose.foundation.layout.fillMaxWidth
import androidx.compose.foundation.layout.padding
import androidx.compose.foundation.layout.size
import androidx.compose.foundation.layout.width
import androidx.compose.foundation.lazy.LazyColumn
import androidx.compose.foundation.lazy.items
import androidx.compose.foundation.shape.CircleShape
import androidx.compose.material.ExperimentalMaterialApi
import androidx.compose.material.pullrefresh.PullRefreshIndicator
import androidx.compose.material.pullrefresh.pullRefresh
import androidx.compose.material.pullrefresh.rememberPullRefreshState
import androidx.compose.material.icons.Icons
import androidx.compose.material.icons.filled.AlternateEmail
import androidx.compose.material.icons.filled.ChatBubbleOutline
import androidx.compose.material.icons.filled.Favorite
import androidx.compose.material.icons.filled.MailOutline
import androidx.compose.material.icons.filled.Notifications
import androidx.compose.material.icons.filled.PersonAdd
import androidx.compose.material.icons.filled.Repeat
import androidx.compose.material3.CircularProgressIndicator
import androidx.compose.material3.HorizontalDivider
import androidx.compose.material3.Icon
import androidx.compose.material3.MaterialTheme
import androidx.compose.material3.Text
import androidx.compose.runtime.Composable
import androidx.compose.runtime.collectAsState
import androidx.compose.runtime.getValue
import androidx.compose.runtime.remember
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.draw.clip
import androidx.compose.ui.graphics.Color
import androidx.compose.ui.graphics.vector.ImageVector
import androidx.compose.ui.text.font.FontWeight
import androidx.compose.ui.unit.dp
import androidx.lifecycle.viewmodel.compose.viewModel
import one.zrp.social.mobile.data.NotificationsRepository
import one.zrp.social.mobile.network.AppNotification
import one.zrp.social.mobile.ui.components.Avatar
import one.zrp.social.mobile.ui.components.VerifiedBadge
import one.zrp.social.mobile.ui.theme.Spacing
import one.zrp.social.mobile.ui.theme.ZrpBlue
import one.zrp.social.mobile.ui.theme.ZrpGreen
import one.zrp.social.mobile.ui.theme.ZrpRed
import one.zrp.social.mobile.ui.theme.ZrpWhite
import one.zrp.social.mobile.util.formatRelativeTime

/**
 * The Notifications tab: the same real list the website's
 * /notifications page shows, marked read the same way (opening the
 * list clears the unread state). No fake activity.
 */
@OptIn(ExperimentalMaterialApi::class)
@Composable
fun NotificationsScreen(onAuthorClick: (String) -> Unit) {
    val viewModel: NotificationsViewModel = viewModel(
        factory = remember { NotificationsViewModelFactory(NotificationsRepository()) },
    )
    val state by viewModel.state.collectAsState()

    val pullRefreshState = rememberPullRefreshState(
        refreshing = state.isRefreshing,
        onRefresh = { viewModel.refresh() },
    )

    Box(
        modifier = Modifier
            .fillMaxSize()
            .pullRefresh(pullRefreshState),
    ) {
        when {
            state.isLoading -> {
                Box(modifier = Modifier.fillMaxSize(), contentAlignment = Alignment.Center) {
                    CircularProgressIndicator()
                }
            }
            state.notifications.isEmpty() -> {
                Box(modifier = Modifier.fillMaxSize(), contentAlignment = Alignment.Center) {
                    Text(
                        text = state.error ?: "No notifications yet.",
                        color = if (state.error != null) {
                            MaterialTheme.colorScheme.error
                        } else {
                            MaterialTheme.colorScheme.onSurfaceVariant
                        },
                        modifier = Modifier.padding(24.dp),
                    )
                }
            }
            else -> {
                LazyColumn(modifier = Modifier.fillMaxSize()) {
                    items(state.notifications, key = { it.id }) { notification ->
                        NotificationRow(notification = notification, onAuthorClick = onAuthorClick)
                        HorizontalDivider()
                    }
                }
            }
        }

        PullRefreshIndicator(
            refreshing = state.isRefreshing,
            state = pullRefreshState,
            modifier = Modifier.align(Alignment.TopCenter),
        )
    }
}

private data class NotificationBadge(val icon: ImageVector, val tint: Color)

// A small colored icon on the avatar's corner - the one detail that
// lets a user tell a like from a follow from a repost at a glance,
// scanning a long list, instead of reading every row's sentence.
private fun badgeFor(type: String): NotificationBadge = when (type) {
    "like" -> NotificationBadge(Icons.Filled.Favorite, ZrpRed)
    "comment" -> NotificationBadge(Icons.Filled.ChatBubbleOutline, ZrpBlue)
    "repost" -> NotificationBadge(Icons.Filled.Repeat, ZrpGreen)
    "follow", "follow_request" -> NotificationBadge(Icons.Filled.PersonAdd, ZrpRed)
    "mention" -> NotificationBadge(Icons.Filled.AlternateEmail, ZrpBlue)
    "message" -> NotificationBadge(Icons.Filled.MailOutline, ZrpBlue)
    else -> NotificationBadge(Icons.Filled.Notifications, ZrpBlue)
}

@Composable
private fun NotificationRow(notification: AppNotification, onAuthorClick: (String) -> Unit) {
    val fromUser = notification.fromUser
    val badge = badgeFor(notification.type)

    Row(
        modifier = Modifier
            .fillMaxWidth()
            .clickable(enabled = fromUser != null) {
                fromUser?.let { onAuthorClick(it.username) }
            }
            .background(
                if (!notification.read) {
                    ZrpRed.copy(alpha = 0.06f)
                } else {
                    MaterialTheme.colorScheme.surface
                },
            )
            .padding(horizontal = Spacing.lg, vertical = Spacing.md),
        verticalAlignment = Alignment.Top,
    ) {
        Box {
            Avatar(
                url = fromUser?.avatarUrl,
                name = fromUser?.name ?: fromUser?.username ?: "?",
                size = 40.dp,
            )
            Box(
                modifier = Modifier
                    .align(Alignment.BottomEnd)
                    .size(18.dp)
                    .clip(CircleShape)
                    .background(MaterialTheme.colorScheme.background)
                    .padding(2.dp)
                    .clip(CircleShape)
                    .background(badge.tint),
                contentAlignment = Alignment.Center,
            ) {
                Icon(
                    imageVector = badge.icon,
                    contentDescription = null,
                    tint = ZrpWhite,
                    modifier = Modifier.size(10.dp),
                )
            }
        }

        Spacer(modifier = Modifier.width(Spacing.md))

        Column(modifier = Modifier.weight(1f)) {
            Row(verticalAlignment = Alignment.CenterVertically) {
                Text(
                    text = fromUser?.name ?: fromUser?.username ?: "Someone",
                    style = MaterialTheme.typography.bodyMedium,
                    fontWeight = FontWeight.SemiBold,
                )
                VerifiedBadge(
                    badgeType = fromUser?.badgeType,
                    size = 14.dp,
                    modifier = Modifier.padding(start = 3.dp, end = 3.dp),
                )
                Text(
                    text = describeNotificationSuffix(notification),
                    style = MaterialTheme.typography.bodyMedium,
                )
            }

            val postContent = notification.post?.content
            if (!postContent.isNullOrBlank()) {
                Text(
                    text = postContent,
                    style = MaterialTheme.typography.bodySmall,
                    color = MaterialTheme.colorScheme.onSurfaceVariant,
                    maxLines = 2,
                    modifier = Modifier.padding(top = 2.dp),
                )
            }

            Text(
                text = formatRelativeTime(notification.createdAt),
                style = MaterialTheme.typography.labelSmall,
                color = MaterialTheme.colorScheme.onSurfaceVariant,
                modifier = Modifier.padding(top = 2.dp),
            )
        }

        if (!notification.read) {
            Box(
                modifier = Modifier
                    .padding(top = 4.dp)
                    .size(8.dp)
                    .clip(CircleShape)
                    .background(ZrpRed),
            )
        }
    }
}

// Split into (actor name, rest of sentence) rather than one flat
// string so the actor's real badgeType can render right after their
// name - matching the website's notifications page, which bolds the
// name and places VerifiedBadge directly after it, before the rest of
// the sentence.
private fun describeNotificationSuffix(notification: AppNotification): String {
    return when (notification.type) {
        "like" -> "liked your post"
        "comment" -> "commented on your post"
        "follow" -> "started following you"
        "repost" -> "reposted your post"
        "mention" -> "mentioned you"
        "message" -> "sent you a message"
        "follow_request" -> "requested to follow you"
        // Other real notification types exist server-side (support
        // tickets, ZRP PLAY duels, Marketplace/Opportunity/Help listing
        // reviews) for features this native app hasn't built screens
        // for yet - a humanized fallback keeps them visible and honest
        // rather than hidden or misrepresented as one of the types above.
        else -> "· ${notification.type.replace('_', ' ').replaceFirstChar { it.uppercase() }}"
    }
}
