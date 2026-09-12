package one.zrp.social.mobile.ui.messages

import androidx.compose.foundation.background
import androidx.compose.foundation.clickable
import androidx.compose.foundation.layout.Arrangement
import androidx.compose.foundation.layout.Box
import androidx.compose.foundation.layout.Column
import androidx.compose.foundation.layout.Row
import androidx.compose.foundation.layout.RowScope
import androidx.compose.foundation.layout.Spacer
import androidx.compose.foundation.layout.fillMaxSize
import androidx.compose.foundation.layout.fillMaxWidth
import androidx.compose.foundation.layout.height
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
import androidx.compose.material.icons.filled.Groups
import androidx.compose.material.icons.filled.GroupAdd
import androidx.compose.material.icons.filled.MoreVert
import androidx.compose.material.icons.filled.Refresh
import androidx.compose.material3.AlertDialog
import androidx.compose.material3.CircularProgressIndicator
import androidx.compose.material3.DropdownMenu
import androidx.compose.material3.DropdownMenuItem
import androidx.compose.material3.HorizontalDivider
import androidx.compose.material3.Icon
import androidx.compose.material3.IconButton
import androidx.compose.material3.MaterialTheme
import androidx.compose.material3.Text
import androidx.compose.material3.TextButton
import androidx.compose.runtime.Composable
import androidx.compose.runtime.collectAsState
import androidx.compose.runtime.getValue
import androidx.compose.runtime.mutableStateOf
import androidx.compose.runtime.remember
import androidx.compose.runtime.setValue
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
import one.zrp.social.mobile.network.GroupConversationSummary
import one.zrp.social.mobile.ui.theme.Spacing
import one.zrp.social.mobile.ui.theme.ZrpRed
import one.zrp.social.mobile.util.formatRelativeTime

/**
 * The Messages tab's conversation list - real 1:1 conversations (the
 * same inbox the website's /messages page shows) merged with real
 * GROUP conversations (GET /conversations), sorted together by actual
 * recency rather than shown as two separate sections.
 *
 * [selectedKey] (a [ConversationListItem.key]) highlights the currently
 * open row - only ever non-null on a tablet's two-pane layout
 * (MessagesHomeScreen), where this list stays on screen next to the
 * open thread instead of being replaced by it; phones never pass this.
 */
@OptIn(ExperimentalMaterialApi::class)
@Composable
fun MessagesScreen(
    onOpenConversation: (partnerId: String, partnerUsername: String) -> Unit,
    onOpenGroup: (conversationId: String) -> Unit,
    onNewGroup: () -> Unit,
    selectedKey: String? = null,
) {
    val viewModel: MessagesViewModel = viewModel(
        factory = remember { MessagesViewModelFactory(MessagesRepository()) },
    )
    val state by viewModel.state.collectAsState()

    val pullRefreshState = rememberPullRefreshState(
        refreshing = state.isRefreshing,
        onRefresh = { viewModel.refresh() },
    )

    // Delete-conversation flow, reachable from the list itself - this is
    // the fix for "deleting a conversation doesn't work on Android": no
    // client here ever called the real delete endpoint before (see
    // MessagesRepository.deleteConversation's own KDoc). One dialog
    // shared across rows, since only one can be open at a time.
    var pendingDeletePartnerId by remember { mutableStateOf<String?>(null) }
    var isDeletingConversation by remember { mutableStateOf(false) }
    var deleteConversationError by remember { mutableStateOf<String?>(null) }
    val fallbackDeleteError = stringResource(R.string.messages_err_delete_conversation)

    Column(modifier = Modifier.fillMaxSize()) {
        Row(
            modifier = Modifier
                .fillMaxWidth()
                .padding(horizontal = Spacing.sm, vertical = Spacing.xs),
            horizontalArrangement = Arrangement.End,
        ) {
            IconButton(onClick = onNewGroup) {
                Icon(Icons.Filled.GroupAdd, contentDescription = stringResource(R.string.messages_new_group_cd))
            }
        }

        Box(
            modifier = Modifier
                .weight(1f)
                .fillMaxWidth()
                .pullRefresh(pullRefreshState),
        ) {
            when {
                state.isLoading -> {
                    Box(modifier = Modifier.fillMaxSize(), contentAlignment = Alignment.Center) {
                        CircularProgressIndicator()
                    }
                }
                state.items.isEmpty() -> {
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
                        items(state.items, key = { it.key }) { item ->
                            when (item) {
                                is ConversationListItem.Direct -> DirectConversationRow(
                                    conversation = item.summary,
                                    isOnline = state.presence[item.summary.partner.id] == true,
                                    isSelected = selectedKey == item.key,
                                    onClick = { onOpenConversation(item.summary.partner.id, item.summary.partner.username) },
                                    onDeleteRequested = {
                                        pendingDeletePartnerId = item.summary.partner.id
                                        deleteConversationError = null
                                    },
                                )
                                is ConversationListItem.Group -> GroupConversationRow(
                                    conversation = item.summary,
                                    isSelected = selectedKey == item.key,
                                    onClick = { onOpenGroup(item.summary.id) },
                                )
                            }
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

    val deletePartnerId = pendingDeletePartnerId
    if (deletePartnerId != null) {
        AlertDialog(
            onDismissRequest = {
                if (!isDeletingConversation) {
                    pendingDeletePartnerId = null
                    deleteConversationError = null
                }
            },
            title = { Text(stringResource(R.string.messages_delete_conversation)) },
            text = {
                Column {
                    Text(stringResource(R.string.messages_delete_conversation_confirm))
                    val err = deleteConversationError
                    if (err != null) {
                        Spacer(modifier = Modifier.height(Spacing.sm))
                        Text(
                            text = err,
                            color = MaterialTheme.colorScheme.error,
                            style = MaterialTheme.typography.bodySmall,
                        )
                    }
                }
            },
            confirmButton = {
                if (isDeletingConversation) {
                    CircularProgressIndicator(modifier = Modifier.size(20.dp))
                } else {
                    TextButton(onClick = {
                        isDeletingConversation = true
                        deleteConversationError = null
                        viewModel.deleteConversation(deletePartnerId) { result ->
                            isDeletingConversation = false
                            result.fold(
                                onSuccess = { pendingDeletePartnerId = null },
                                onFailure = { error -> deleteConversationError = error.message ?: fallbackDeleteError },
                            )
                        }
                    }) {
                        Text(stringResource(R.string.action_delete), color = MaterialTheme.colorScheme.error)
                    }
                }
            },
            dismissButton = {
                TextButton(
                    onClick = {
                        pendingDeletePartnerId = null
                        deleteConversationError = null
                    },
                    enabled = !isDeletingConversation,
                ) {
                    Text(stringResource(R.string.action_cancel))
                }
            },
        )
    }
}

@Composable
private fun SelectableRow(isSelected: Boolean, onClick: () -> Unit, content: @Composable RowScope.() -> Unit) {
    Row(
        modifier = Modifier
            .fillMaxWidth()
            .background(if (isSelected) MaterialTheme.colorScheme.surfaceContainerHigh else Color.Transparent)
            .clickable(onClick = onClick)
            .padding(horizontal = 16.dp, vertical = 12.dp),
        verticalAlignment = Alignment.CenterVertically,
        content = content,
    )
}

@Composable
private fun DirectConversationRow(
    conversation: ConversationSummary,
    isOnline: Boolean,
    isSelected: Boolean,
    onClick: () -> Unit,
    onDeleteRequested: () -> Unit,
) {
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

    SelectableRow(isSelected = isSelected, onClick = onClick) {
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
            UnreadBadge(count = conversation.unreadCount)
        }

        // Reachable directly from the list, not only after opening the
        // thread - the real UX fix this row exists for (see
        // MessagesScreen's own KDoc on the shared confirm dialog above).
        // Always visible rather than gated behind a swipe or long-press:
        // senior-friendly discoverability was an explicit requirement,
        // and an always-visible labeled button works identically with
        // touch, a stylus, or TalkBack.
        var menuOpen by remember { mutableStateOf(false) }
        Box {
            IconButton(onClick = { menuOpen = true }) {
                Icon(
                    imageVector = Icons.Filled.MoreVert,
                    contentDescription = stringResource(R.string.chat_contact_more),
                )
            }
            DropdownMenu(expanded = menuOpen, onDismissRequest = { menuOpen = false }) {
                DropdownMenuItem(
                    text = { Text(stringResource(R.string.messages_delete_conversation)) },
                    onClick = {
                        menuOpen = false
                        onDeleteRequested()
                    },
                )
            }
        }
    }
}

/**
 * A group row's visual identity is deliberately distinct from a 1:1
 * row (spec requirement, and a real UX need - a group is a genuinely
 * different kind of thread): a stacked group glyph instead of a single
 * partner photo when there's no real group avatarUrl, the group's own
 * name instead of a partner's, a member-count chip, and the last
 * message prefixed by whoever actually sent it (never "You:" alone the
 * way a 1:1 row can be, since "You" doesn't disambiguate a group with
 * 3+ possible senders).
 */
@Composable
private fun GroupConversationRow(
    conversation: GroupConversationSummary,
    isSelected: Boolean,
    onClick: () -> Unit,
) {
    val lastMessage = conversation.lastMessage
    val groupName = conversation.name ?: stringResource(R.string.messages_unnamed_group)

    SelectableRow(isSelected = isSelected, onClick = onClick) {
        Box {
            if (conversation.avatarUrl != null) {
                Avatar(url = conversation.avatarUrl, name = groupName, size = 48.dp)
            } else {
                Box(
                    modifier = Modifier
                        .size(48.dp)
                        .clip(CircleShape)
                        .background(MaterialTheme.colorScheme.tertiaryContainer),
                    contentAlignment = Alignment.Center,
                ) {
                    Icon(
                        imageVector = Icons.Filled.Groups,
                        contentDescription = null,
                        tint = MaterialTheme.colorScheme.onTertiaryContainer,
                    )
                }
            }
        }

        Spacer(modifier = Modifier.width(12.dp))

        Column(modifier = Modifier.weight(1f)) {
            Text(
                text = groupName,
                style = MaterialTheme.typography.titleSmall,
                fontWeight = if (conversation.unreadCount > 0) FontWeight.Bold else FontWeight.Normal,
                maxLines = 1,
                overflow = TextOverflow.Ellipsis,
            )
            Row(verticalAlignment = Alignment.CenterVertically) {
                if (lastMessage != null) {
                    val senderName = lastMessage.sender?.name ?: lastMessage.sender?.username
                    val rawPreview = if (lastMessage.content.isBlank() && lastMessage.imageUrl != null) {
                        "Photo"
                    } else {
                        lastMessage.content
                    }
                    val preview = if (senderName != null) "$senderName: $rawPreview" else rawPreview
                    Text(
                        text = preview,
                        style = MaterialTheme.typography.bodySmall,
                        color = MaterialTheme.colorScheme.onSurfaceVariant,
                        maxLines = 1,
                        overflow = TextOverflow.Ellipsis,
                        modifier = Modifier.weight(1f, fill = false),
                    )
                } else {
                    Text(
                        text = stringResource(R.string.messages_group_no_messages_yet),
                        style = MaterialTheme.typography.bodySmall,
                        color = MaterialTheme.colorScheme.onSurfaceVariant,
                        maxLines = 1,
                    )
                }
                Text(
                    text = " · ${stringResource(R.string.messages_group_member_count, conversation.participantCount)}",
                    style = MaterialTheme.typography.labelSmall,
                    color = MaterialTheme.colorScheme.onSurfaceVariant,
                    maxLines = 1,
                )
            }
        }

        Spacer(modifier = Modifier.width(8.dp))

        Column(horizontalAlignment = Alignment.End) {
            if (lastMessage != null) {
                Text(
                    text = formatRelativeTime(lastMessage.createdAt),
                    style = MaterialTheme.typography.labelSmall,
                    color = MaterialTheme.colorScheme.onSurfaceVariant,
                )
            }
            UnreadBadge(count = conversation.unreadCount)
        }
    }
}

@Composable
private fun UnreadBadge(count: Int) {
    if (count > 0) {
        Box(
            modifier = Modifier
                .padding(top = 4.dp)
                .size(20.dp)
                .clip(CircleShape)
                .background(color = ZrpRed),
            contentAlignment = Alignment.Center,
        ) {
            Text(
                text = count.toString(),
                style = MaterialTheme.typography.labelSmall,
                color = Color.White,
            )
        }
    }
}
