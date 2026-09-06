package one.zrp.social.mobile.ui.notifications

import androidx.compose.foundation.background
import androidx.compose.foundation.clickable
import androidx.compose.foundation.layout.Box
import androidx.compose.foundation.layout.Column
import androidx.compose.foundation.layout.Row
import androidx.compose.foundation.layout.Spacer
import androidx.compose.foundation.layout.fillMaxSize
import androidx.compose.foundation.layout.fillMaxWidth
import androidx.compose.foundation.layout.offset
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
import androidx.compose.material.icons.filled.Verified
import androidx.compose.material3.Button
import androidx.compose.material3.ButtonDefaults
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
import one.zrp.social.mobile.network.PostAuthor
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
 * /notifications page shows - grouped the same way (like/repost/follow
 * collapse into one row), filterable the same way (All/Verified/
 * Follows), routed to the same real destination per type (a post's
 * comments, a profile, or a conversation - not always a profile, which
 * this screen got wrong before), and offering the same real "Follow
 * back" action. No fake activity.
 */
@OptIn(ExperimentalMaterialApi::class)
@Composable
fun NotificationsScreen(
    onAuthorClick: (String) -> Unit,
    onOpenComments: (String) -> Unit = {},
    onOpenMessage: (partnerId: String, partnerUsername: String) -> Unit = { _, _ -> },
) {
    val viewModel: NotificationsViewModel = viewModel(
        factory = remember { NotificationsViewModelFactory(NotificationsRepository()) },
    )
    val state by viewModel.state.collectAsState()

    val pullRefreshState = rememberPullRefreshState(
        refreshing = state.isRefreshing,
        onRefresh = { viewModel.refresh() },
    )

    fun handleClick(g: GroupedNotification) {
        val primary = g.users.firstOrNull() ?: return
        when {
            g.type == "message" -> onOpenMessage(primary.id, primary.username)
            g.type == "follow" || g.type == "follow_request" -> onAuthorClick(primary.username)
            g.postId != null -> onOpenComments(g.postId)
            else -> onAuthorClick(primary.username)
        }
    }

    Column(modifier = Modifier.fillMaxSize()) {
        FilterTabsRow(activeTab = state.activeTab, onTabSelected = { viewModel.setTab(it) })
        HorizontalDivider()

        Box(
            modifier = Modifier
                .weight(1f)
                .fillMaxWidth()
                .pullRefresh(pullRefreshState),
        ) {
            val grouped = state.grouped
            when {
                state.isLoading -> {
                    Box(modifier = Modifier.fillMaxSize(), contentAlignment = Alignment.Center) {
                        CircularProgressIndicator()
                    }
                }
                grouped.isEmpty() -> {
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
                        items(grouped, key = { it.key }) { group ->
                            NotificationRow(
                                group = group,
                                followBackState = group.users.firstOrNull()?.let { state.followBackState[it.id] },
                                onClick = { handleClick(group) },
                                onFollowBackClick = { user -> viewModel.followBack(user.username, user.id) },
                            )
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
}

@Composable
private fun FilterTabsRow(activeTab: NotificationFilterTab, onTabSelected: (NotificationFilterTab) -> Unit) {
    val tabs = listOf(
        NotificationFilterTab.ALL to "All",
        NotificationFilterTab.VERIFIED to "Verified",
        NotificationFilterTab.FOLLOWS to "Follows",
    )
    Row(modifier = Modifier.fillMaxWidth()) {
        tabs.forEach { (tab, label) ->
            val selected = activeTab == tab
            Column(
                modifier = Modifier
                    .weight(1f)
                    .clickable { onTabSelected(tab) }
                    .padding(vertical = Spacing.sm),
                horizontalAlignment = Alignment.CenterHorizontally,
            ) {
                Row(verticalAlignment = Alignment.CenterVertically) {
                    if (tab == NotificationFilterTab.VERIFIED) {
                        Icon(
                            imageVector = Icons.Filled.Verified,
                            contentDescription = null,
                            modifier = Modifier.size(16.dp).padding(end = 4.dp),
                            tint = if (selected) MaterialTheme.colorScheme.onSurface else MaterialTheme.colorScheme.onSurfaceVariant,
                        )
                    }
                    Text(
                        text = label,
                        style = MaterialTheme.typography.labelLarge,
                        fontWeight = if (selected) FontWeight.Bold else FontWeight.Normal,
                        color = if (selected) MaterialTheme.colorScheme.onSurface else MaterialTheme.colorScheme.onSurfaceVariant,
                    )
                }
                if (selected) {
                    Box(
                        modifier = Modifier
                            .padding(top = 4.dp)
                            .size(width = 32.dp, height = 3.dp)
                            .clip(MaterialTheme.shapes.small)
                            .background(ZrpRed),
                    )
                }
            }
        }
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
private fun NotificationRow(
    group: GroupedNotification,
    followBackState: FollowBackState?,
    onClick: () -> Unit,
    onFollowBackClick: (PostAuthor) -> Unit,
) {
    val primaryUser = group.users.firstOrNull()
    val others = group.users.size - 1
    val badge = badgeFor(group.type)

    Row(
        modifier = Modifier
            .fillMaxWidth()
            .clickable(onClick = onClick)
            .background(
                if (!group.read) {
                    ZrpRed.copy(alpha = 0.06f)
                } else {
                    MaterialTheme.colorScheme.surface
                },
            )
            .padding(horizontal = Spacing.lg, vertical = Spacing.md),
        verticalAlignment = Alignment.Top,
    ) {
        if (group.users.size == 1) {
            Box {
                Avatar(
                    url = primaryUser?.avatarUrl,
                    name = primaryUser?.name ?: primaryUser?.username ?: "?",
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
        } else {
            Box(modifier = Modifier.width(40.dp)) {
                group.users.take(3).forEachIndexed { index, user ->
                    Avatar(
                        url = user.avatarUrl,
                        name = user.name ?: user.username,
                        size = 32.dp,
                        modifier = Modifier.offset(x = (index * 10).dp),
                    )
                }
            }
        }

        Spacer(modifier = Modifier.width(Spacing.md))

        Column(modifier = Modifier.weight(1f)) {
            Row(verticalAlignment = Alignment.CenterVertically) {
                Text(
                    text = primaryUser?.name ?: primaryUser?.username ?: "Someone",
                    style = MaterialTheme.typography.bodyMedium,
                    fontWeight = FontWeight.SemiBold,
                )
                VerifiedBadge(
                    badgeType = primaryUser?.badgeType,
                    size = 14.dp,
                    modifier = Modifier.padding(start = 3.dp, end = 3.dp),
                )
                Text(
                    text = describeNotificationSuffix(group.type, others),
                    style = MaterialTheme.typography.bodyMedium,
                )
            }

            val postContent = group.postContent
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
                text = formatRelativeTime(group.latestCreatedAt),
                style = MaterialTheme.typography.labelSmall,
                color = MaterialTheme.colorScheme.onSurfaceVariant,
                modifier = Modifier.padding(top = 2.dp),
            )

            if (group.type == "follow" && others == 0 && primaryUser != null) {
                Button(
                    onClick = { onFollowBackClick(primaryUser) },
                    enabled = followBackState == null,
                    contentPadding = androidx.compose.foundation.layout.PaddingValues(horizontal = Spacing.md, vertical = 4.dp),
                    colors = ButtonDefaults.buttonColors(
                        containerColor = if (followBackState == FollowBackState.DONE) {
                            MaterialTheme.colorScheme.surfaceContainerHigh
                        } else {
                            ZrpRed
                        },
                        contentColor = if (followBackState == FollowBackState.DONE) {
                            MaterialTheme.colorScheme.onSurface
                        } else {
                            ZrpWhite
                        },
                    ),
                    modifier = Modifier.padding(top = Spacing.xs),
                ) {
                    if (followBackState == FollowBackState.LOADING) {
                        CircularProgressIndicator(modifier = Modifier.size(14.dp), strokeWidth = 2.dp, color = ZrpWhite)
                    } else {
                        Text(
                            text = if (followBackState == FollowBackState.DONE) "Following" else "Follow back",
                            style = MaterialTheme.typography.labelMedium,
                        )
                    }
                }
            }
        }

        if (!group.read) {
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
// the sentence. `others` mirrors the website's own pluralized suffix
// for grouped rows ("and N others liked your post").
private fun describeNotificationSuffix(type: String, others: Int): String {
    val plural = others > 0
    val prefix = if (plural) "and $others other${if (others > 1) "s" else ""} " else ""
    val suffix = when (type) {
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
        else -> "· ${type.replace('_', ' ').replaceFirstChar { it.uppercase() }}"
    }
    return "$prefix$suffix"
}
