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
import androidx.compose.material.icons.Icons
import androidx.compose.material.icons.filled.Person
import androidx.compose.material.pullrefresh.PullRefreshIndicator
import androidx.compose.material.pullrefresh.pullRefresh
import androidx.compose.material.pullrefresh.rememberPullRefreshState
import androidx.compose.material3.CircularProgressIndicator
import androidx.compose.material3.HorizontalDivider
import androidx.compose.material3.Icon
import androidx.compose.material3.MaterialTheme
import androidx.compose.material3.Text
import androidx.compose.runtime.Composable
import androidx.compose.runtime.collectAsState
import androidx.compose.runtime.getValue
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.draw.clip
import androidx.compose.ui.layout.ContentScale
import androidx.compose.ui.unit.dp
import androidx.lifecycle.viewmodel.compose.viewModel
import coil.compose.AsyncImage
import one.zrp.social.mobile.data.NotificationsRepository
import one.zrp.social.mobile.network.AppNotification
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
        factory = NotificationsViewModelFactory(NotificationsRepository()),
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

@Composable
private fun NotificationRow(notification: AppNotification, onAuthorClick: (String) -> Unit) {
    val fromUser = notification.fromUser

    Row(
        modifier = Modifier
            .fillMaxWidth()
            .clickable(enabled = fromUser != null) {
                fromUser?.let { onAuthorClick(it.username) }
            }
            .background(
                if (!notification.read) {
                    MaterialTheme.colorScheme.surfaceVariant
                } else {
                    MaterialTheme.colorScheme.surface
                },
            )
            .padding(horizontal = 16.dp, vertical = 12.dp),
        verticalAlignment = Alignment.Top,
    ) {
        if (fromUser?.avatarUrl != null) {
            AsyncImage(
                model = fromUser.avatarUrl,
                contentDescription = fromUser.username,
                contentScale = ContentScale.Crop,
                modifier = Modifier
                    .size(40.dp)
                    .clip(CircleShape),
            )
        } else {
            Icon(
                imageVector = Icons.Filled.Person,
                contentDescription = null,
                modifier = Modifier.size(40.dp),
            )
        }

        Spacer(modifier = Modifier.width(12.dp))

        Column(modifier = Modifier.weight(1f)) {
            Text(
                text = describeNotification(notification),
                style = MaterialTheme.typography.bodyMedium,
            )

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
    }
}

private fun describeNotification(notification: AppNotification): String {
    val name = notification.fromUser?.name ?: notification.fromUser?.username ?: "Someone"
    return when (notification.type) {
        "like" -> "$name liked your post"
        "comment" -> "$name commented on your post"
        "follow" -> "$name started following you"
        "repost" -> "$name reposted your post"
        "mention" -> "$name mentioned you"
        "message" -> "$name sent you a message"
        "follow_request" -> "$name requested to follow you"
        // Other real notification types exist server-side (support
        // tickets, ZRP PLAY duels, Marketplace/Opportunity/Help listing
        // reviews) for features this native app hasn't built screens
        // for yet - a humanized fallback keeps them visible and honest
        // rather than hidden or misrepresented as one of the types above.
        else -> "$name · ${notification.type.replace('_', ' ').replaceFirstChar { it.uppercase() }}"
    }
}
