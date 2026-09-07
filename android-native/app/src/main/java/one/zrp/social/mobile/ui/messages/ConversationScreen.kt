package one.zrp.social.mobile.ui.messages

import androidx.compose.foundation.ExperimentalFoundationApi
import androidx.compose.foundation.background
import androidx.compose.foundation.combinedClickable
import androidx.compose.foundation.clickable
import androidx.compose.foundation.layout.Arrangement
import androidx.compose.foundation.layout.Box
import androidx.compose.foundation.layout.Column
import androidx.compose.foundation.layout.Row
import androidx.compose.foundation.layout.Spacer
import androidx.compose.foundation.layout.fillMaxSize
import androidx.compose.foundation.layout.fillMaxWidth
import androidx.compose.foundation.layout.padding
import androidx.compose.foundation.layout.size
import androidx.compose.foundation.layout.width
import androidx.compose.foundation.layout.widthIn
import androidx.compose.foundation.lazy.LazyColumn
import androidx.compose.foundation.lazy.items
import androidx.compose.foundation.lazy.rememberLazyListState
import androidx.compose.foundation.shape.CircleShape
import androidx.compose.foundation.shape.RoundedCornerShape
import androidx.compose.material.icons.Icons
import androidx.compose.material.icons.filled.ArrowBack
import androidx.compose.material.icons.filled.Close
import androidx.compose.material.icons.filled.Send
import androidx.compose.material3.AlertDialog
import androidx.compose.material3.CircularProgressIndicator
import androidx.compose.material3.DropdownMenu
import androidx.compose.material3.DropdownMenuItem
import androidx.compose.material3.HorizontalDivider
import androidx.compose.material3.Icon
import androidx.compose.material3.IconButton
import androidx.compose.material3.MaterialTheme
import androidx.compose.material3.OutlinedTextField
import androidx.compose.material3.Surface
import androidx.compose.material3.Text
import androidx.compose.material3.TextButton
import androidx.compose.runtime.Composable
import androidx.compose.runtime.LaunchedEffect
import androidx.compose.runtime.collectAsState
import androidx.compose.runtime.getValue
import androidx.compose.runtime.mutableStateOf
import androidx.compose.runtime.remember
import androidx.compose.runtime.setValue
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.draw.clip
import androidx.compose.ui.graphics.Color
import androidx.compose.ui.layout.ContentScale
import androidx.compose.ui.res.stringResource
import androidx.compose.ui.unit.dp
import androidx.lifecycle.viewmodel.compose.viewModel
import coil.compose.AsyncImage
import one.zrp.social.mobile.R
import one.zrp.social.mobile.data.MessagesRepository
import one.zrp.social.mobile.network.ChatMessage
import one.zrp.social.mobile.ui.components.AddReactionDialog
import one.zrp.social.mobile.ui.components.EditPostDialog
import one.zrp.social.mobile.ui.theme.Spacing
import one.zrp.social.mobile.ui.theme.ZrpRed
import one.zrp.social.mobile.util.formatRelativeTime

/**
 * A single conversation - real message history and real sending
 * against the same DM endpoints the website uses, plus the same real
 * per-message reply/edit/delete/react actions ChatInterface.tsx
 * exposes. New messages, edits, deletes, reactions, read receipts and
 * typing status all arrive live over the same real Socket.IO
 * connection the website uses (see ConversationViewModel's KDoc).
 */
@Composable
fun ConversationScreen(
    partnerId: String,
    partnerUsername: String,
    onBack: () -> Unit,
    onOpenProfile: () -> Unit,
) {
    val viewModel: ConversationViewModel = viewModel(
        factory = remember(partnerId) { ConversationViewModelFactory(MessagesRepository(), partnerId) },
    )
    val state by viewModel.state.collectAsState()

    var deletingMessageId by remember { mutableStateOf<String?>(null) }
    var isDeletingMessage by remember { mutableStateOf(false) }
    var reactingToMessageId by remember { mutableStateOf<String?>(null) }

    val listState = rememberLazyListState()
    var pendingScrollIndex by remember { mutableStateOf<Int?>(null) }

    Column(modifier = Modifier.fillMaxSize()) {
        Row(
            modifier = Modifier
                .fillMaxWidth()
                .padding(horizontal = 8.dp, vertical = 4.dp),
            verticalAlignment = Alignment.CenterVertically,
        ) {
            IconButton(onClick = onBack) {
                Icon(Icons.Filled.ArrowBack, contentDescription = stringResource(R.string.chat_back_to_messages))
            }
            Column(
                modifier = Modifier
                    .padding(start = 4.dp)
                    // Matches ChatInterface.tsx's own header button - web
                    // opens a ChatContactDrawer with call buttons/shared
                    // media/a "View Profile" link; this app has none of
                    // that yet, so the header goes straight to the real
                    // profile instead of a drawer this app doesn't have.
                    .clickable(onClick = onOpenProfile),
            ) {
                Text(
                    text = "@$partnerUsername",
                    style = MaterialTheme.typography.titleMedium,
                )
                // Matches ChatInterface.tsx's own header status row - a
                // "Typing..." indicator (from the real "user-typing" socket
                // event) takes priority over the live/offline connection
                // dot, exactly like web's own receiverTyping-vs-socketConnected
                // conditional.
                if (state.partnerTyping) {
                    Text(
                        text = stringResource(R.string.chat_typing),
                        style = MaterialTheme.typography.labelSmall,
                        color = ZrpRed,
                    )
                } else {
                    Row(verticalAlignment = Alignment.CenterVertically) {
                        Box(
                            modifier = Modifier
                                .size(6.dp)
                                .clip(CircleShape)
                                .background(if (state.socketConnected) Color(0xFF22C55E) else Color(0xFFEF4444)),
                        )
                        Text(
                            text = stringResource(if (state.socketConnected) R.string.chat_live else R.string.chat_offline),
                            style = MaterialTheme.typography.labelSmall,
                            color = MaterialTheme.colorScheme.onSurfaceVariant,
                            modifier = Modifier.padding(start = 4.dp),
                        )
                    }
                }
            }
        }
        HorizontalDivider()

        Box(
            modifier = Modifier
                .weight(1f)
                .fillMaxWidth(),
        ) {
            if (state.isLoading) {
                Box(modifier = Modifier.fillMaxSize(), contentAlignment = Alignment.Center) {
                    CircularProgressIndicator()
                }
            } else if (state.messages.isEmpty()) {
                // Matches ChatInterface.tsx's own empty-conversation state
                // (chat.noMessagesYet + chat.sayHello) rather than the
                // blank scroll view this screen showed before.
                Box(modifier = Modifier.fillMaxSize(), contentAlignment = Alignment.Center) {
                    Column(horizontalAlignment = Alignment.CenterHorizontally) {
                        Text(
                            text = stringResource(R.string.chat_no_messages_yet),
                            style = MaterialTheme.typography.titleSmall,
                            color = MaterialTheme.colorScheme.onSurface,
                        )
                        Text(
                            text = stringResource(R.string.chat_say_hello, partnerUsername),
                            style = MaterialTheme.typography.bodySmall,
                            color = MaterialTheme.colorScheme.onSurfaceVariant,
                            modifier = Modifier.padding(top = 4.dp),
                        )
                    }
                }
            } else {
                LaunchedEffect(state.messages.size) {
                    if (state.messages.isNotEmpty()) {
                        listState.animateScrollToItem(state.messages.size - 1)
                    }
                }

                LazyColumn(
                    state = listState,
                    modifier = Modifier
                        .fillMaxSize()
                        .padding(horizontal = 12.dp),
                ) {
                    items(state.messages, key = { it.id }) { message ->
                        MessageBubble(
                            message = message,
                            isOwnMessage = message.senderId != partnerId,
                            onReplyClick = { viewModel.startReply(message) },
                            onEditClick = { viewModel.startEdit(message) },
                            onDeleteClick = { deletingMessageId = message.id },
                            onReactClick = { emoji -> viewModel.toggleReaction(message.id, emoji) },
                            onAddReactionClick = { reactingToMessageId = message.id },
                            onReplyPreviewClick = { targetId ->
                                val index = state.messages.indexOfFirst { it.id == targetId }
                                if (index >= 0) pendingScrollIndex = index
                            },
                            ownReaction = message.reactions.firstOrNull { it.user.id != partnerId }?.emoji,
                        )
                    }
                }

                LaunchedEffect(pendingScrollIndex) {
                    pendingScrollIndex?.let { index ->
                        listState.animateScrollToItem(index)
                        pendingScrollIndex = null
                    }
                }
            }
        }

        if (state.error != null) {
            Text(
                text = state.error ?: "",
                color = MaterialTheme.colorScheme.error,
                style = MaterialTheme.typography.bodySmall,
                modifier = Modifier.padding(horizontal = 12.dp, vertical = 4.dp),
            )
        }

        val replyingTo = state.replyingTo
        if (replyingTo != null) {
            Row(
                modifier = Modifier
                    .fillMaxWidth()
                    .padding(horizontal = 12.dp, vertical = 4.dp),
                verticalAlignment = Alignment.CenterVertically,
            ) {
                Column(modifier = Modifier.weight(1f)) {
                    Text(
                        text = "Replying to ${if (replyingTo.senderId == partnerId) "@$partnerUsername" else "yourself"}",
                        style = MaterialTheme.typography.labelSmall,
                        color = MaterialTheme.colorScheme.onSurfaceVariant,
                    )
                    Text(
                        // "📷 Image" stays English-only on purpose - matches
                        // ChatInterface.tsx's own hardcoded, untranslated reply-preview
                        // fallback for an image sent with no caption.
                        text = replyingTo.content.ifBlank { if (replyingTo.imageUrl != null) "📷 Image" else "" },
                        style = MaterialTheme.typography.bodySmall,
                        maxLines = 1,
                    )
                }
                IconButton(onClick = { viewModel.cancelReply() }) {
                    // "Cancel reply" stays English-only on purpose - matches
                    // ChatInterface.tsx's own hardcoded, untranslated aria-label.
                    Icon(Icons.Filled.Close, contentDescription = "Cancel reply")
                }
            }
        }

        Row(
            modifier = Modifier
                .fillMaxWidth()
                .padding(8.dp),
            verticalAlignment = Alignment.CenterVertically,
        ) {
            OutlinedTextField(
                value = state.draft,
                onValueChange = { viewModel.onDraftChange(it) },
                placeholder = { Text(stringResource(R.string.chat_message_placeholder, partnerUsername)) },
                enabled = !state.isSending,
                modifier = Modifier.weight(1f),
            )

            Spacer(modifier = Modifier.width(8.dp))

            IconButton(
                onClick = { viewModel.send() },
                enabled = state.draft.isNotBlank() && !state.isSending,
            ) {
                if (state.isSending) {
                    CircularProgressIndicator(modifier = Modifier.size(20.dp), strokeWidth = 2.dp)
                } else {
                    // "Send message" stays English-only on purpose - matches
                    // ChatInterface.tsx's own hardcoded, untranslated aria-label
                    // (aria-label="Send message" on its send button).
                    Icon(
                        imageVector = Icons.Filled.Send,
                        contentDescription = "Send message",
                        tint = ZrpRed,
                    )
                }
            }
        }
    }

    val editMessageId = state.editingMessageId
    val editMessageContent = state.messages.find { it.id == editMessageId }?.content
    if (editMessageId != null && editMessageContent != null) {
        // "Edit message" stays English-only on purpose - ChatInterface.tsx has no
        // equivalent dialog title at all, since web edits a message inline (an
        // in-place textarea replacing the bubble) rather than through a modal.
        EditPostDialog(
            initialContent = editMessageContent,
            isSubmitting = state.isSavingEdit,
            error = state.editError,
            title = "Edit message",
            onDismiss = { viewModel.cancelEdit() },
            onSubmit = { content -> viewModel.saveEdit(editMessageId, content) { } },
        )
    }

    val deleteMessageId = deletingMessageId
    if (deleteMessageId != null) {
        AlertDialog(
            onDismissRequest = { if (!isDeletingMessage) deletingMessageId = null },
            title = { Text(stringResource(R.string.chat_delete_message)) },
            text = { Text(stringResource(R.string.chat_delete_message_confirm)) },
            confirmButton = {
                if (isDeletingMessage) {
                    CircularProgressIndicator(modifier = Modifier.size(20.dp))
                } else {
                    TextButton(onClick = {
                        isDeletingMessage = true
                        viewModel.deleteMessage(deleteMessageId) { result ->
                            isDeletingMessage = false
                            deletingMessageId = null
                            result.onFailure { /* left visible; the row itself still shows the message on failure */ }
                        }
                    }) {
                        Text(stringResource(R.string.action_delete), color = MaterialTheme.colorScheme.error)
                    }
                }
            },
            dismissButton = {
                TextButton(onClick = { deletingMessageId = null }, enabled = !isDeletingMessage) {
                    Text(stringResource(R.string.action_cancel))
                }
            },
        )
    }

    val reactingMessageId = reactingToMessageId
    if (reactingMessageId != null) {
        AddReactionDialog(
            onDismiss = { reactingToMessageId = null },
            onSubmit = { emoji ->
                viewModel.toggleReaction(reactingMessageId, emoji)
                reactingToMessageId = null
            },
        )
    }
}

// The corner nearest the sender's own side of the screen stays sharp -
// the same "tail" convention every reference chat app uses so a glance
// tells you which side sent a bubble even before reading its color.
private val OwnMessageShape = RoundedCornerShape(topStart = 18.dp, topEnd = 18.dp, bottomStart = 18.dp, bottomEnd = 4.dp)
private val OtherMessageShape = RoundedCornerShape(topStart = 18.dp, topEnd = 18.dp, bottomStart = 4.dp, bottomEnd = 18.dp)

@OptIn(ExperimentalFoundationApi::class)
@Composable
private fun MessageBubble(
    message: ChatMessage,
    isOwnMessage: Boolean,
    ownReaction: String?,
    onReplyClick: () -> Unit,
    onEditClick: () -> Unit,
    onDeleteClick: () -> Unit,
    onReactClick: (String) -> Unit,
    onAddReactionClick: () -> Unit,
    onReplyPreviewClick: (String) -> Unit,
) {
    var menuOpen by remember { mutableStateOf(false) }

    Row(
        modifier = Modifier
            .fillMaxWidth()
            .padding(vertical = 3.dp),
        horizontalArrangement = if (isOwnMessage) Arrangement.End else Arrangement.Start,
    ) {
        Box {
            Surface(
                shape = if (isOwnMessage) OwnMessageShape else OtherMessageShape,
                color = if (isOwnMessage) ZrpRed else MaterialTheme.colorScheme.surfaceContainerHigh,
                modifier = Modifier
                    .widthIn(max = 280.dp)
                    .combinedClickable(onClick = {}, onLongClick = { menuOpen = true }),
            ) {
                Column(modifier = Modifier.padding(horizontal = Spacing.md, vertical = Spacing.sm)) {
                    val replyTo = message.replyTo
                    if (replyTo != null) {
                        Column(
                            modifier = Modifier
                                .fillMaxWidth()
                                .clickable { onReplyPreviewClick(replyTo.id) }
                                .padding(bottom = 6.dp, top = 2.dp)
                                .padding(start = 6.dp),
                        ) {
                            Text(
                                // "📷 Image" stays English-only on purpose - matches
                                // ChatInterface.tsx's own hardcoded, untranslated
                                // reply-reference fallback.
                                text = replyTo.content.ifBlank { if (replyTo.imageUrl != null) "📷 Image" else "" },
                                style = MaterialTheme.typography.labelSmall,
                                color = if (isOwnMessage) Color.White.copy(alpha = 0.8f) else MaterialTheme.colorScheme.onSurfaceVariant,
                                maxLines = 1,
                            )
                        }
                    }

                    if (message.content.isNotBlank()) {
                        Text(
                            text = message.content,
                            color = if (isOwnMessage) Color.White else MaterialTheme.colorScheme.onSurface,
                        )
                    }

                    if (message.imageUrl != null) {
                        AsyncImage(
                            model = message.imageUrl,
                            contentDescription = null,
                            contentScale = ContentScale.Crop,
                            modifier = Modifier
                                .size(160.dp)
                                .clip(RoundedCornerShape(8.dp)),
                        )
                    }

                    if (message.reactions.isNotEmpty()) {
                        Row(modifier = Modifier.padding(top = 4.dp)) {
                            message.reactions.groupBy { it.emoji }.forEach { (emoji, users) ->
                                val isOwn = emoji == ownReaction
                                Surface(
                                    shape = MaterialTheme.shapes.extraLarge,
                                    color = if (isOwn) ZrpRed.copy(alpha = 0.15f) else MaterialTheme.colorScheme.background,
                                    modifier = Modifier
                                        .padding(end = 4.dp)
                                        .clickable { onReactClick(emoji) },
                                ) {
                                    Row(
                                        verticalAlignment = Alignment.CenterVertically,
                                        modifier = Modifier.padding(horizontal = 6.dp, vertical = 2.dp),
                                    ) {
                                        Text(text = emoji, style = MaterialTheme.typography.labelMedium)
                                        if (users.size > 1) {
                                            Text(
                                                text = users.size.toString(),
                                                style = MaterialTheme.typography.labelSmall,
                                                modifier = Modifier.padding(start = 2.dp),
                                            )
                                        }
                                    }
                                }
                            }
                        }
                    }

                    Row(verticalAlignment = Alignment.CenterVertically, modifier = Modifier.padding(top = 4.dp)) {
                        Text(
                            text = formatRelativeTime(message.createdAt),
                            style = MaterialTheme.typography.labelSmall,
                            color = if (isOwnMessage) {
                                Color.White.copy(alpha = 0.7f)
                            } else {
                                MaterialTheme.colorScheme.onSurfaceVariant
                            },
                        )
                        if (message.edited) {
                            Text(
                                text = " · edited",
                                style = MaterialTheme.typography.labelSmall,
                                color = if (isOwnMessage) {
                                    Color.White.copy(alpha = 0.7f)
                                } else {
                                    MaterialTheme.colorScheme.onSurfaceVariant
                                },
                            )
                        }
                        if (isOwnMessage && message.read) {
                            Text(
                                text = " ✓✓",
                                style = MaterialTheme.typography.labelSmall,
                                color = Color.White,
                            )
                        }
                    }
                }
            }

            DropdownMenu(expanded = menuOpen, onDismissRequest = { menuOpen = false }) {
                DropdownMenuItem(
                    text = { Text(stringResource(R.string.action_reply)) },
                    onClick = { menuOpen = false; onReplyClick() },
                )
                // "React" has no web equivalent to translate from - ChatInterface.tsx's
                // own reaction-picker trigger is an icon-only button with a hardcoded,
                // untranslated aria-label ("React"), so this matches real web behavior
                // rather than being a native-only gap.
                DropdownMenuItem(text = { Text("React") }, onClick = { menuOpen = false; onAddReactionClick() })
                if (isOwnMessage) {
                    DropdownMenuItem(
                        text = { Text(stringResource(R.string.action_edit)) },
                        onClick = { menuOpen = false; onEditClick() },
                    )
                }
                DropdownMenuItem(
                    text = { Text(stringResource(R.string.action_delete)) },
                    onClick = { menuOpen = false; onDeleteClick() },
                )
            }
        }
    }
}
