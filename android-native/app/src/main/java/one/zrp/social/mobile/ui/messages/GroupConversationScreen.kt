package one.zrp.social.mobile.ui.messages

import androidx.activity.compose.rememberLauncherForActivityResult
import androidx.activity.result.PickVisualMediaRequest
import androidx.activity.result.contract.ActivityResultContracts
import androidx.compose.foundation.background
import androidx.compose.foundation.clickable
import androidx.compose.ui.semantics.Role
import androidx.compose.foundation.combinedClickable
import androidx.compose.foundation.ExperimentalFoundationApi
import androidx.compose.foundation.layout.Arrangement
import androidx.compose.foundation.layout.Box
import androidx.compose.foundation.layout.Column
import androidx.compose.foundation.layout.ExperimentalLayoutApi
import androidx.compose.foundation.layout.Row
import androidx.compose.foundation.layout.Spacer
import androidx.compose.foundation.layout.imePadding
import androidx.compose.foundation.layout.isImeVisible
import androidx.compose.foundation.layout.WindowInsets
import androidx.compose.foundation.layout.fillMaxSize
import androidx.compose.foundation.layout.fillMaxWidth
import androidx.compose.foundation.layout.padding
import androidx.compose.foundation.layout.size
import androidx.compose.foundation.layout.width
import androidx.compose.foundation.layout.widthIn
import androidx.compose.foundation.lazy.LazyColumn
import androidx.compose.foundation.lazy.itemsIndexed
import androidx.compose.foundation.lazy.rememberLazyListState
import androidx.compose.foundation.shape.CircleShape
import androidx.compose.foundation.shape.RoundedCornerShape
import androidx.compose.material.icons.Icons
import androidx.compose.material.icons.filled.ArrowBack
import androidx.compose.material.icons.filled.AttachFile
import androidx.compose.material.icons.filled.Close
import androidx.compose.material.icons.filled.Groups
import androidx.compose.material.icons.filled.Send
import androidx.compose.material3.AlertDialog
import androidx.compose.material3.CircularProgressIndicator
import androidx.compose.material3.DropdownMenu
import androidx.compose.material3.DropdownMenuItem
import androidx.compose.material3.HorizontalDivider
import androidx.compose.material3.Icon
import androidx.compose.material3.IconButton
import androidx.compose.material3.LinearProgressIndicator
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
import androidx.compose.runtime.snapshotFlow
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.draw.clip
import androidx.compose.ui.graphics.Color
import androidx.compose.ui.layout.ContentScale
import androidx.compose.ui.platform.LocalContext
import androidx.compose.ui.res.stringResource
import androidx.compose.ui.semantics.CustomAccessibilityAction
import androidx.compose.ui.semantics.customActions
import androidx.compose.ui.semantics.semantics
import androidx.compose.ui.text.style.TextOverflow
import androidx.compose.ui.unit.dp
import androidx.lifecycle.viewmodel.compose.viewModel
import coil.compose.AsyncImage
import one.zrp.social.mobile.R
import one.zrp.social.mobile.data.MessagesRepository
import one.zrp.social.mobile.network.ChatMessage
import one.zrp.social.mobile.network.ConversationDetail
import one.zrp.social.mobile.network.PostAuthor
import one.zrp.social.mobile.ui.components.AddReactionDialog
import one.zrp.social.mobile.ui.components.Avatar
import one.zrp.social.mobile.ui.components.EditPostDialog
import one.zrp.social.mobile.ui.theme.Spacing
import one.zrp.social.mobile.ui.theme.ZrpRed
import one.zrp.social.mobile.util.TypingIndicator
import one.zrp.social.mobile.util.formatRelativeTime
import one.zrp.social.mobile.util.formatTypingIndicator
import one.zrp.social.mobile.util.queryFileNameAndSize

/**
 * A real GROUP thread: multi-sender message history and real-time push
 * (GroupConversationViewModel), reactions/reply/edit/delete against the
 * exact same per-message REST endpoints 1:1 messaging already calls
 * (they're already group-aware server-side), a composer whose text +
 * image-attachment path mirrors ConversationScreen's own real chatImage
 * upload exactly - voice/video/document attachments stay 1:1-only for
 * this first cut (a deliberate scope cut, not an oversight: group's real
 * POST /conversations/{id}/messages already accepts the same imageUrl
 * field those would need, so wiring them in later is additive, not a
 * redesign).
 */
@OptIn(ExperimentalFoundationApi::class, ExperimentalLayoutApi::class)
@Composable
fun GroupConversationScreen(
    conversationId: String,
    currentUserId: String,
    onBack: () -> Unit,
    onOpenInfo: () -> Unit,
    onOpenProfile: (String) -> Unit,
) {
    val viewModel: GroupConversationViewModel = viewModel(
        factory = remember(conversationId) {
            GroupConversationViewModelFactory(MessagesRepository(), conversationId, currentUserId)
        },
    )
    val state by viewModel.state.collectAsState()
    val context = LocalContext.current
    val contentResolver = context.contentResolver

    var deletingMessageId by remember { mutableStateOf<String?>(null) }
    var isDeletingMessage by remember { mutableStateOf(false) }
    var reactingToMessageId by remember { mutableStateOf<String?>(null) }

    val listState = rememberLazyListState()
    var pendingScrollIndex by remember { mutableStateOf<Int?>(null) }

    val imagePickerLauncher = rememberLauncherForActivityResult(
        contract = ActivityResultContracts.PickVisualMedia(),
    ) { uri ->
        if (uri != null) {
            val (name, size) = queryFileNameAndSize(contentResolver, uri)
            val mimeType = contentResolver.getType(uri) ?: "image/jpeg"
            viewModel.onImagePicked(contentResolver, uri, name, mimeType, size)
        }
    }

    if (state.leftConversation) {
        onBack()
        return
    }

    val conversation = state.conversation
    val groupName = conversation?.name ?: stringResource(R.string.messages_unnamed_group)

    Column(modifier = Modifier.fillMaxSize().imePadding()) {
        Row(
            modifier = Modifier
                .fillMaxWidth()
                .padding(horizontal = 8.dp, vertical = 4.dp),
            verticalAlignment = Alignment.CenterVertically,
        ) {
            IconButton(onClick = onBack) {
                Icon(Icons.Filled.ArrowBack, contentDescription = stringResource(R.string.chat_back_to_messages))
            }

            Row(
                modifier = Modifier
                    .weight(1f)
                    .padding(start = 4.dp)
                    .clickable(onClick = onOpenInfo, role = Role.Button),
                verticalAlignment = Alignment.CenterVertically,
            ) {
                if (conversation?.avatarUrl != null) {
                    Avatar(url = conversation.avatarUrl, name = groupName, size = 36.dp)
                } else {
                    Box(
                        modifier = Modifier.size(36.dp).clip(CircleShape).background(MaterialTheme.colorScheme.tertiaryContainer),
                        contentAlignment = Alignment.Center,
                    ) {
                        Icon(
                            Icons.Filled.Groups,
                            contentDescription = null,
                            tint = MaterialTheme.colorScheme.onTertiaryContainer,
                            modifier = Modifier.size(18.dp),
                        )
                    }
                }
                Column(modifier = Modifier.padding(start = Spacing.sm)) {
                    Text(
                        text = groupName,
                        style = MaterialTheme.typography.titleMedium,
                        maxLines = 1,
                        overflow = TextOverflow.Ellipsis,
                    )
                    val typingText = typingIndicatorText(
                        formatTypingIndicator(typingDisplayNames(state.typingUserIds, conversation, currentUserId)),
                    )
                    if (typingText != null) {
                        Text(text = typingText, style = MaterialTheme.typography.labelSmall, color = ZrpRed)
                    } else if (conversation != null) {
                        Text(
                            text = stringResource(R.string.messages_group_member_count, conversation.participants.size),
                            style = MaterialTheme.typography.labelSmall,
                            color = MaterialTheme.colorScheme.onSurfaceVariant,
                        )
                    }
                }
            }
        }
        HorizontalDivider()

        Box(modifier = Modifier.weight(1f).fillMaxWidth()) {
            if (state.isLoading) {
                Box(modifier = Modifier.fillMaxSize(), contentAlignment = Alignment.Center) { CircularProgressIndicator() }
            } else if (state.messages.isEmpty()) {
                Box(modifier = Modifier.fillMaxSize(), contentAlignment = Alignment.Center) {
                    Column(horizontalAlignment = Alignment.CenterHorizontally) {
                        Text(
                            text = stringResource(R.string.chat_no_messages_yet),
                            style = MaterialTheme.typography.titleSmall,
                            color = MaterialTheme.colorScheme.onSurface,
                        )
                        Text(
                            text = stringResource(R.string.group_say_hello, groupName),
                            style = MaterialTheme.typography.bodySmall,
                            color = MaterialTheme.colorScheme.onSurfaceVariant,
                            modifier = Modifier.padding(top = 4.dp),
                        )
                    }
                }
            } else {
                val topOffset = if (state.isLoadingOlderMessages) 1 else 0
                val lastMessageId = state.messages.lastOrNull()?.id
                LaunchedEffect(lastMessageId) {
                    if (state.messages.isNotEmpty()) {
                        listState.animateScrollToItem(state.messages.size - 1 + topOffset)
                    }
                }

                LaunchedEffect(listState) {
                    snapshotFlow { listState.firstVisibleItemIndex }
                        .collect { index -> if (index <= 2) viewModel.loadOlderMessages() }
                }

                val imeVisible = WindowInsets.isImeVisible
                LaunchedEffect(imeVisible) {
                    if (imeVisible && state.messages.isNotEmpty()) {
                        listState.animateScrollToItem(state.messages.size - 1 + topOffset)
                    }
                }

                LazyColumn(state = listState, modifier = Modifier.fillMaxSize().padding(horizontal = 12.dp)) {
                    if (state.isLoadingOlderMessages) {
                        item(key = "loading-older") {
                            Box(modifier = Modifier.fillMaxWidth().padding(vertical = Spacing.sm), contentAlignment = Alignment.Center) {
                                CircularProgressIndicator(modifier = Modifier.size(20.dp), strokeWidth = 2.dp)
                            }
                        }
                    }
                    itemsIndexed(state.messages, key = { _, message -> message.id }) { index, message ->
                        val previousSenderId = state.messages.getOrNull(index - 1)?.senderId
                        val isOwnMessage = viewModel.isOwnMessage(message)
                        val sender = viewModel.senderFor(message)
                        val showSenderHeader = !isOwnMessage && message.senderId != previousSenderId
                        GroupMessageBubble(
                            message = message,
                            sender = sender,
                            isOwnMessage = isOwnMessage,
                            canDelete = viewModel.canDelete(message),
                            showSenderHeader = showSenderHeader,
                            isOnline = sender != null && state.presence[sender.id] == true,
                            onReplyClick = { viewModel.startReply(message) },
                            onEditClick = { viewModel.startEdit(message) },
                            onDeleteClick = { deletingMessageId = message.id },
                            onReactClick = { emoji -> viewModel.toggleReaction(message.id, emoji) },
                            onAddReactionClick = { reactingToMessageId = message.id },
                            onAvatarClick = { sender?.let { onOpenProfile(it.username) } },
                            onReplyPreviewClick = { targetId ->
                                val targetIndex = state.messages.indexOfFirst { it.id == targetId }
                                if (targetIndex >= 0) pendingScrollIndex = targetIndex + topOffset
                            },
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
            val replySender = viewModel.senderFor(replyingTo)
            Row(
                modifier = Modifier.fillMaxWidth().padding(horizontal = 12.dp, vertical = 4.dp),
                verticalAlignment = Alignment.CenterVertically,
            ) {
                Column(modifier = Modifier.weight(1f)) {
                    Text(
                        text = stringResource(
                            R.string.group_replying_to,
                            replySender?.name ?: replySender?.username ?: "…",
                        ),
                        style = MaterialTheme.typography.labelSmall,
                        color = MaterialTheme.colorScheme.onSurfaceVariant,
                    )
                    Text(
                        text = replyingTo.content.ifBlank { if (replyingTo.imageUrl != null) "📷 Image" else "" },
                        style = MaterialTheme.typography.bodySmall,
                        maxLines = 1,
                    )
                }
                IconButton(onClick = { viewModel.cancelReply() }) {
                    Icon(
                        imageVector = Icons.Filled.Close,
                        contentDescription = stringResource(R.string.comment_cancel_reply_cd),
                    )
                }
            }
        }

        if (state.isUploadingAttachment) {
            LinearProgressIndicator(
                progress = { state.attachmentUploadProgress },
                modifier = Modifier.fillMaxWidth().padding(horizontal = 12.dp),
                color = ZrpRed,
            )
        }

        val attachmentError = state.attachmentError
        if (attachmentError != null) {
            Text(
                text = chatAttachmentErrorMessage(attachmentError),
                color = MaterialTheme.colorScheme.error,
                style = MaterialTheme.typography.bodySmall,
                modifier = Modifier.padding(horizontal = 12.dp, vertical = 4.dp),
            )
        }

        Row(
            modifier = Modifier.fillMaxWidth().padding(8.dp),
            verticalAlignment = Alignment.CenterVertically,
        ) {
            IconButton(
                onClick = { imagePickerLauncher.launch(PickVisualMediaRequest(ActivityResultContracts.PickVisualMedia.ImageOnly)) },
                enabled = !state.isUploadingAttachment,
            ) {
                Icon(Icons.Filled.AttachFile, contentDescription = stringResource(R.string.message_attach_image_cd))
            }

            OutlinedTextField(
                value = state.draft,
                onValueChange = { viewModel.onDraftChange(it) },
                placeholder = { Text(stringResource(R.string.group_message_placeholder, groupName)) },
                enabled = !state.isSending,
                modifier = Modifier.weight(1f),
            )

            Spacer(modifier = Modifier.width(8.dp))

            IconButton(onClick = { viewModel.send() }, enabled = !state.isSending && state.draft.isNotBlank()) {
                if (state.isSending) {
                    CircularProgressIndicator(modifier = Modifier.size(20.dp), strokeWidth = 2.dp)
                } else {
                    Icon(Icons.Filled.Send, contentDescription = stringResource(R.string.message_send_cd), tint = ZrpRed)
                }
            }
        }
    }

    val editMessageId = state.editingMessageId
    val editMessageContent = state.messages.find { it.id == editMessageId }?.content
    if (editMessageId != null && editMessageContent != null) {
        EditPostDialog(
            initialContent = editMessageContent,
            isSubmitting = state.isSavingEdit,
            error = state.editError,
            title = stringResource(R.string.message_edit_dialog_title),
            onDismiss = { viewModel.cancelEdit() },
            onSubmit = { content -> viewModel.saveEdit(editMessageId, content) },
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

// The resolved display name for every currently-typing OTHER participant
// (see GroupConversationUiState.typingUserIds' own KDoc), sorted by
// userId for a stable order - a real fallback name (their username) if
// the conversation's own participant list hasn't resolved that userId
// yet, never a blank/invented name.
private fun typingDisplayNames(
    typingUserIds: Set<String>,
    conversation: ConversationDetail?,
    currentUserId: String,
): List<String> {
    if (conversation == null) return emptyList()
    return typingUserIds
        .filter { it != currentUserId }
        .sorted()
        .mapNotNull { userId ->
            conversation.participants.firstOrNull { it.userId == userId }?.user?.let { it.name ?: it.username }
        }
}

@Composable
private fun typingIndicatorText(indicator: TypingIndicator): String? = when (indicator) {
    is TypingIndicator.None -> null
    is TypingIndicator.One -> stringResource(R.string.group_typing_one, indicator.name)
    is TypingIndicator.Two -> stringResource(R.string.group_typing_two, indicator.first, indicator.second)
    is TypingIndicator.Many -> stringResource(R.string.group_typing_many, indicator.first, indicator.second, indicator.othersCount)
}

@Composable
private fun chatAttachmentErrorMessage(error: ChatAttachmentError): String = when (error) {
    is ChatAttachmentError.FileTooLarge -> stringResource(R.string.chat_err_file_too_large).replace("{size}", error.maxMb.toString())
    is ChatAttachmentError.InvalidType -> stringResource(R.string.chat_err_invalid_file_type)
    is ChatAttachmentError.UploadFailed -> stringResource(R.string.chat_err_image_upload_failed) + " " + error.detail
}

private val OwnMessageShape = RoundedCornerShape(topStart = 18.dp, topEnd = 18.dp, bottomStart = 18.dp, bottomEnd = 4.dp)
private val OtherMessageShape = RoundedCornerShape(topStart = 18.dp, topEnd = 18.dp, bottomStart = 4.dp, bottomEnd = 18.dp)

@OptIn(ExperimentalFoundationApi::class)
@Composable
private fun GroupMessageBubble(
    message: ChatMessage,
    sender: PostAuthor?,
    isOwnMessage: Boolean,
    canDelete: Boolean,
    showSenderHeader: Boolean,
    isOnline: Boolean,
    onReplyClick: () -> Unit,
    onEditClick: () -> Unit,
    onDeleteClick: () -> Unit,
    onReactClick: (String) -> Unit,
    onAddReactionClick: () -> Unit,
    onAvatarClick: () -> Unit,
    onReplyPreviewClick: (String) -> Unit,
) {
    var menuOpen by remember { mutableStateOf(false) }
    val actionsLabel = stringResource(R.string.chat_message_actions_cd)
    val senderName = sender?.name ?: sender?.username ?: stringResource(R.string.group_removed_member)

    Row(
        modifier = Modifier.fillMaxWidth().padding(vertical = 3.dp),
        horizontalArrangement = if (isOwnMessage) Arrangement.End else Arrangement.Start,
    ) {
        if (!isOwnMessage) {
            Box(modifier = Modifier.width(36.dp).padding(end = 6.dp)) {
                if (showSenderHeader) {
                    Box(modifier = Modifier.clickable(onClick = onAvatarClick, role = Role.Button)) {
                        Avatar(url = sender?.avatarUrl, name = senderName, size = 32.dp)
                        if (isOnline) {
                            Box(
                                modifier = Modifier
                                    .align(Alignment.BottomEnd)
                                    .size(10.dp)
                                    .clip(CircleShape)
                                    .background(MaterialTheme.colorScheme.surface)
                                    .padding(1.dp)
                                    .clip(CircleShape)
                                    .background(Color(0xFF22C55E)),
                            )
                        }
                    }
                }
            }
        }

        Column(horizontalAlignment = if (isOwnMessage) Alignment.End else Alignment.Start) {
            if (showSenderHeader) {
                Text(
                    text = senderName,
                    style = MaterialTheme.typography.labelSmall,
                    color = MaterialTheme.colorScheme.onSurfaceVariant,
                    modifier = Modifier.padding(start = 4.dp, bottom = 2.dp),
                )
            }

            Box {
                Surface(
                    shape = if (isOwnMessage) OwnMessageShape else OtherMessageShape,
                    color = if (isOwnMessage) ZrpRed else MaterialTheme.colorScheme.surfaceContainerHigh,
                    modifier = Modifier
                        .widthIn(max = 260.dp)
                        .combinedClickable(onClick = {}, onLongClick = { menuOpen = true })
                        .semantics {
                            customActions = listOf(
                                CustomAccessibilityAction(actionsLabel) { menuOpen = true; true },
                            )
                        },
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
                                    text = replyTo.content.ifBlank { if (replyTo.imageUrl != null) "📷 Image" else "" },
                                    style = MaterialTheme.typography.labelSmall,
                                    color = if (isOwnMessage) Color.White.copy(alpha = 0.8f) else MaterialTheme.colorScheme.onSurfaceVariant,
                                    maxLines = 1,
                                )
                            }
                        }

                        if (message.content.isNotBlank()) {
                            Text(text = message.content, color = if (isOwnMessage) Color.White else MaterialTheme.colorScheme.onSurface)
                        }

                        val attachmentUrl = message.imageUrl
                        if (attachmentUrl != null) {
                            AsyncImage(
                                model = attachmentUrl,
                                contentDescription = null,
                                contentScale = ContentScale.Crop,
                                modifier = Modifier.size(160.dp).clip(RoundedCornerShape(8.dp)),
                            )
                        }

                        if (message.reactions.isNotEmpty()) {
                            Row(modifier = Modifier.padding(top = 4.dp)) {
                                message.reactions.groupBy { it.emoji }.forEach { (emoji, users) ->
                                    Surface(
                                        shape = MaterialTheme.shapes.extraLarge,
                                        color = MaterialTheme.colorScheme.background,
                                        modifier = Modifier.padding(end = 4.dp).clickable { onReactClick(emoji) },
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
                                color = if (isOwnMessage) Color.White.copy(alpha = 0.7f) else MaterialTheme.colorScheme.onSurfaceVariant,
                            )
                            if (message.edited) {
                                Text(
                                    text = " · edited",
                                    style = MaterialTheme.typography.labelSmall,
                                    color = if (isOwnMessage) Color.White.copy(alpha = 0.7f) else MaterialTheme.colorScheme.onSurfaceVariant,
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
                    DropdownMenuItem(
                        text = { Text(stringResource(R.string.reaction_react_action)) },
                        onClick = { menuOpen = false; onAddReactionClick() },
                    )
                    if (isOwnMessage) {
                        DropdownMenuItem(
                            text = { Text(stringResource(R.string.action_edit)) },
                            onClick = { menuOpen = false; onEditClick() },
                        )
                    }
                    if (canDelete) {
                        DropdownMenuItem(
                            text = { Text(stringResource(R.string.action_delete)) },
                            onClick = { menuOpen = false; onDeleteClick() },
                        )
                    }
                }
            }
        }
    }
}
