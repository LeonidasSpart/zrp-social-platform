package one.zrp.social.mobile.ui.messages

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
import androidx.compose.material.icons.filled.ChatBubbleOutline
import androidx.compose.material.icons.filled.CloudOff
import androidx.compose.material.icons.filled.Refresh
import androidx.compose.material3.CircularProgressIndicator
import androidx.compose.material3.HorizontalDivider
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
import androidx.compose.ui.res.stringResource
import androidx.compose.ui.text.font.FontWeight
import androidx.compose.ui.text.style.TextOverflow
import androidx.compose.ui.unit.dp
import androidx.lifecycle.viewmodel.compose.viewModel
import one.zrp.social.mobile.R
import one.zrp.social.mobile.ui.components.Avatar
import one.zrp.social.mobile.ui.components.VerifiedBadge
import one.zrp.social.mobile.ui.components.ZrpEmptyState
import one.zrp.social.mobile.ui.components.EmptyStateAction
import one.zrp.social.mobile.data.MessagesRepository
import one.zrp.social.mobile.network.ConversationSummary
import one.zrp.social.mobile.ui.theme.ZrpRed
import one.zrp.social.mobile.util.formatRelativeTime

/**
 * The Messages tab's conversation list - the same real inbox the
 * website's /messages page shows (one row per partner, their most
 * recent message, unread count).
 */
@OptIn(ExperimentalMaterialApi::class)
@Composable
fun MessagesScreen(onOpenConversation: (partnerId: String, partnerUsername: String) -> Unit) {
    val viewModel: MessagesViewModel = viewModel(
        factory = remember { MessagesViewModelFactory(MessagesRepository()) },
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
            state.conversations.isEmpty() -> {
                // "No conversations yet" and "loading them failed" were the
                // same centred sentence, distinguishable only by its colour
                // and with no way to retry the failure. They are different
                // situations and now say so, through the same shared empty
                // state the rest of the app uses.
                Box(modifier = Modifier.fillMaxSize(), contentAlignment = Alignment.Center) {
                    val loadError = state.error
                    if (loadError != null) {
                        ZrpEmptyState(
                            icon = Icons.Filled.CloudOff,
                            title = loadError,
                            primaryAction = EmptyStateAction(
                                label = stringResource(R.string.feed_retry),
                                icon = Icons.Filled.Refresh,
                                onClick = { viewModel.refresh() },
                            ),
                        )
                    } else {
                        ZrpEmptyState(
                            icon = Icons.Filled.ChatBubbleOutline,
                            title = stringResource(R.string.messages_no_messages_yet),
                        )
                    }
                }
            }
            else -> {
                LazyColumn(modifier = Modifier.fillMaxSize()) {
                    items(state.conversations, key = { it.partner.id }) { conversation ->
                        ConversationRow(
                            conversation = conversation,
                            isOnline = state.presence[conversation.partner.id] == true,
                            onClick = { onOpenConversation(conversation.partner.id, conversation.partner.username) },
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

@Composable
private fun ConversationRow(conversation: ConversationSummary, isOnline: Boolean, onClick: () -> Unit) {
    val partner = conversation.partner
    val lastMessage = conversation.lastMessage
    // "Photo" stays English-only on purpose - it's a native-only fallback with
    // no real web equivalent to translate from: /messages/page.tsx's own
    // getLastMessagePreview() only checks lastMsg.content.trim() and shows a
    // blank preview for an image sent with no caption, no image indicator at all.
    val rawPreview = if (lastMessage.content.isBlank() && lastMessage.imageUrl != null) {
        "Photo"
    } else {
        lastMessage.content
    }
    // The real, translated "You: {msg}" prefix from getLastMessagePreview() -
    // shown when the last message in the conversation was sent by the viewer.
    val isOwnLastMessage = lastMessage.senderId != partner.id
    val preview = if (isOwnLastMessage) {
        stringResource(R.string.messages_you, rawPreview)
    } else {
        rawPreview
    }

    Row(
        modifier = Modifier
            .fillMaxWidth()
            .clickable(onClick = onClick)
            .padding(horizontal = 16.dp, vertical = 12.dp),
        verticalAlignment = Alignment.CenterVertically,
    ) {
        Box {
            Avatar(url = partner.avatarUrl, name = partner.name ?: partner.username, size = 48.dp)
            // Real presence (server.js's own userStatus Map via
            // "user-status"/"get-status" - see MessagesViewModel's own
            // KDoc), not a decorative element - only ever rendered once
            // isOnline is true, so no dot at all is the honest "no
            // answer yet or offline" state, matching this row's own
            // absence-means-unknown contract.
            if (isOnline) {
                Box(
                    modifier = Modifier
                        .align(Alignment.BottomEnd)
                        .size(14.dp)
                        .clip(CircleShape)
                        .background(MaterialTheme.colorScheme.surface)
                        .padding(2.dp)
                        .clip(CircleShape)
                        .background(Color(0xFF22C55E)),
                )
            }
        }

        Spacer(modifier = Modifier.width(12.dp))

        Column(modifier = Modifier.weight(1f)) {
            Row(verticalAlignment = Alignment.CenterVertically) {
                Text(
                    text = partner.name ?: partner.username,
                    style = MaterialTheme.typography.titleSmall,
                    fontWeight = if (conversation.unreadCount > 0) FontWeight.Bold else FontWeight.Normal,
                    maxLines = 1,
                    overflow = TextOverflow.Ellipsis,
                    modifier = Modifier.weight(1f, fill = false),
                )
                VerifiedBadge(badgeType = partner.badgeType)
            }
            Text(
                text = preview,
                style = MaterialTheme.typography.bodySmall,
                color = MaterialTheme.colorScheme.onSurfaceVariant,
                maxLines = 1,
            )
        }

        Spacer(modifier = Modifier.width(8.dp))

        Column(horizontalAlignment = Alignment.End) {
            Text(
                text = formatRelativeTime(lastMessage.createdAt),
                style = MaterialTheme.typography.labelSmall,
                color = MaterialTheme.colorScheme.onSurfaceVariant,
            )
            if (conversation.unreadCount > 0) {
                Box(
                    modifier = Modifier
                        .padding(top = 4.dp)
                        .size(20.dp)
                        .clip(CircleShape)
                        .background(color = ZrpRed),
                    contentAlignment = Alignment.Center,
                ) {
                    Text(
                        text = conversation.unreadCount.toString(),
                        style = MaterialTheme.typography.labelSmall,
                        color = Color.White,
                    )
                }
            }
        }
    }
}
