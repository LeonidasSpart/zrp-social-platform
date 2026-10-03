package one.zrp.social.mobile.ui.live

import androidx.compose.foundation.ExperimentalFoundationApi
import androidx.compose.foundation.background
import androidx.compose.foundation.combinedClickable
import androidx.compose.foundation.layout.Arrangement
import androidx.compose.foundation.layout.Box
import androidx.compose.foundation.layout.Column
import androidx.compose.foundation.layout.Row
import androidx.compose.foundation.layout.fillMaxWidth
import androidx.compose.foundation.layout.heightIn
import androidx.compose.foundation.layout.padding
import androidx.compose.foundation.layout.size
import androidx.compose.foundation.lazy.LazyColumn
import androidx.compose.foundation.lazy.items
import androidx.compose.foundation.lazy.rememberLazyListState
import androidx.compose.foundation.shape.RoundedCornerShape
import androidx.compose.foundation.text.KeyboardActions
import androidx.compose.foundation.text.KeyboardOptions
import androidx.compose.material.icons.Icons
import androidx.compose.material.icons.filled.Send
import androidx.compose.material.icons.filled.Check
import androidx.compose.material.icons.filled.Close
import androidx.compose.material.icons.filled.Schedule
import androidx.compose.material3.CircularProgressIndicator
import androidx.compose.material3.DropdownMenu
import androidx.compose.material3.DropdownMenuItem
import androidx.compose.material3.Icon
import androidx.compose.material3.IconButton
import androidx.compose.material3.MaterialTheme
import androidx.compose.material3.OutlinedTextField
import androidx.compose.material3.OutlinedTextFieldDefaults
import androidx.compose.material3.Text
import androidx.compose.material3.TextButton
import androidx.compose.runtime.Composable
import androidx.compose.runtime.LaunchedEffect
import androidx.compose.runtime.getValue
import androidx.compose.runtime.mutableLongStateOf
import androidx.compose.runtime.mutableStateOf
import androidx.compose.runtime.remember
import androidx.compose.runtime.saveable.rememberSaveable
import androidx.compose.runtime.setValue
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.graphics.Color
import androidx.compose.ui.res.stringResource
import androidx.compose.ui.semantics.Role
import androidx.compose.ui.text.font.FontWeight
import androidx.compose.ui.text.input.ImeAction
import androidx.compose.ui.text.style.TextOverflow
import androidx.compose.ui.unit.dp
import kotlinx.coroutines.delay
import one.zrp.social.mobile.R
import one.zrp.social.mobile.network.LiveChatAuthor
import one.zrp.social.mobile.ui.components.Avatar
import one.zrp.social.mobile.ui.theme.IconSize
import one.zrp.social.mobile.ui.theme.Radius
import one.zrp.social.mobile.ui.theme.Spacing
import one.zrp.social.mobile.ui.theme.ZrpRed

private val SLOW_MODE_OPTIONS = listOf(0, 5, 10, 30, 60)

/**
 * The live chat overlay - sits OVER the room (a translucent band on top
 * of Live Video's camera stage, or a bottom panel in Live Audio), never
 * a full-screen takeover. Newest message at the bottom (reverseLayout
 * over a newest-first list); older history pages load as the reader
 * scrolls up.
 *
 * Moderation affordances (delete anyone's message, mute/unmute someone
 * in chat, slow mode) render only for [canModerate] (HOST/MODERATOR) -
 * the server enforces the same rule, this just doesn't offer a control
 * that would be rejected. Anyone may delete their OWN message.
 *
 * [onMedia] switches to light-on-dark styling for legibility over video.
 */
@OptIn(ExperimentalFoundationApi::class)
@Composable
fun LiveChatPanel(
    state: LiveChatState,
    myUserId: String?,
    hostId: String?,
    canModerate: Boolean,
    onMedia: Boolean,
    onSend: (body: String, onSent: () -> Unit) -> Unit,
    onLoadOlder: () -> Unit,
    onRetryHistory: () -> Unit,
    onDeleteMessage: (String) -> Unit,
    onSetUserChatMuted: (userId: String, muted: Boolean) -> Unit,
    onSetSlowMode: (Int) -> Unit,
    onDismissSendError: () -> Unit,
    onDismissActionError: () -> Unit,
    modifier: Modifier = Modifier,
) {
    val textColor = if (onMedia) Color.White else MaterialTheme.colorScheme.onSurface
    val mutedTextColor = if (onMedia) Color.White.copy(alpha = 0.75f) else MaterialTheme.colorScheme.onSurfaceVariant
    val listState = rememberLazyListState()

    // Keep the newest message in view as long as the reader is already at
    // the bottom (index 0 in reverseLayout); never yank them down while
    // they're reading history.
    val newestId = state.messages.firstOrNull()?.id
    LaunchedEffect(newestId) {
        if (newestId != null && listState.firstVisibleItemIndex <= 1) listState.animateScrollToItem(0)
    }

    Column(modifier = modifier) {
        if (canModerate || state.slowModeSeconds > 0) {
            ChatHeader(
                slowModeSeconds = state.slowModeSeconds,
                canModerate = canModerate,
                textColor = mutedTextColor,
                onSetSlowMode = onSetSlowMode,
            )
        }

        Box(modifier = Modifier.weight(1f).fillMaxWidth()) {
            when {
                !state.historyLoaded && state.historyError != null && state.messages.isEmpty() -> Column(
                    modifier = Modifier.align(Alignment.BottomStart).padding(Spacing.sm),
                ) {
                    Text(stringResource(R.string.live_chat_history_error), color = mutedTextColor, style = MaterialTheme.typography.bodySmall)
                    TextButton(onClick = onRetryHistory) { Text(stringResource(R.string.action_retry), color = if (onMedia) Color.White else ZrpRed) }
                }
                !state.historyLoaded && state.messages.isEmpty() -> CircularProgressIndicator(
                    modifier = Modifier.align(Alignment.BottomStart).padding(Spacing.sm).size(IconSize.sm),
                    strokeWidth = 2.dp,
                    color = mutedTextColor,
                )
                state.messages.isEmpty() -> Text(
                    text = stringResource(R.string.live_chat_empty),
                    color = mutedTextColor,
                    style = MaterialTheme.typography.bodySmall,
                    modifier = Modifier.align(Alignment.BottomStart).padding(Spacing.sm),
                )
                else -> LazyColumn(
                    state = listState,
                    reverseLayout = true,
                    verticalArrangement = Arrangement.spacedBy(Spacing.xs),
                    modifier = Modifier.fillMaxWidth(),
                ) {
                    items(state.messages, key = { it.id }) { message ->
                        ChatRow(
                            message = message,
                            author = state.authors[message.authorId],
                            isMine = message.authorId == myUserId,
                            isHostMessage = message.authorId == hostId,
                            canModerate = canModerate,
                            knownMuted = state.knownChatMute[message.authorId] == true,
                            busy = state.actionBusyMessageId == message.id,
                            onMedia = onMedia,
                            textColor = textColor,
                            mutedTextColor = mutedTextColor,
                            onDelete = { onDeleteMessage(message.id) },
                            onSetMuted = { muted -> onSetUserChatMuted(message.authorId, muted) },
                        )
                    }
                    if (state.nextCursor != null) {
                        item(key = "load-older") {
                            // Composed only once the reader scrolls near the
                            // oldest loaded row - then fetches one more page.
                            LaunchedEffect(state.nextCursor) { onLoadOlder() }
                            Box(modifier = Modifier.fillMaxWidth().padding(Spacing.sm), contentAlignment = Alignment.Center) {
                                CircularProgressIndicator(modifier = Modifier.size(IconSize.sm), strokeWidth = 2.dp, color = mutedTextColor)
                            }
                        }
                    }
                }
            }
        }

        val actionError = liveErrorText(state.actionError)
        if (actionError != null) {
            DismissibleErrorRow(text = actionError, onMedia = onMedia, onDismiss = onDismissActionError)
        }

        ChatComposer(
            state = state,
            onMedia = onMedia,
            textColor = textColor,
            mutedTextColor = mutedTextColor,
            onSend = onSend,
            onDismissSendError = onDismissSendError,
        )
    }
}

@Composable
private fun ChatHeader(slowModeSeconds: Int, canModerate: Boolean, textColor: Color, onSetSlowMode: (Int) -> Unit) {
    var menuOpen by remember { mutableStateOf(false) }
    Row(
        verticalAlignment = Alignment.CenterVertically,
        modifier = Modifier.fillMaxWidth().padding(start = Spacing.sm),
    ) {
        Text(
            text = if (slowModeSeconds > 0) stringResource(R.string.live_chat_slow_mode_status, slowModeSeconds) else stringResource(R.string.live_chat_title),
            color = textColor,
            style = MaterialTheme.typography.labelMedium,
            maxLines = 1,
            overflow = TextOverflow.Ellipsis,
            modifier = Modifier.weight(1f),
        )
        if (canModerate) {
            Box {
                IconButton(onClick = { menuOpen = true }) {
                    Icon(Icons.Filled.Schedule, contentDescription = stringResource(R.string.live_chat_slow_mode_menu), tint = textColor)
                }
                DropdownMenu(expanded = menuOpen, onDismissRequest = { menuOpen = false }) {
                    Text(
                        text = stringResource(R.string.live_chat_slow_mode_menu),
                        style = MaterialTheme.typography.labelLarge,
                        modifier = Modifier.padding(horizontal = Spacing.lg, vertical = Spacing.sm),
                    )
                    SLOW_MODE_OPTIONS.forEach { seconds ->
                        DropdownMenuItem(
                            text = {
                                Text(
                                    if (seconds == 0) stringResource(R.string.live_chat_slow_mode_off) else stringResource(R.string.live_chat_slow_mode_seconds, seconds),
                                )
                            },
                            trailingIcon = if (seconds == slowModeSeconds) {
                                { Icon(Icons.Filled.Check, contentDescription = null) }
                            } else {
                                null
                            },
                            onClick = {
                                menuOpen = false
                                if (seconds != slowModeSeconds) onSetSlowMode(seconds)
                            },
                        )
                    }
                }
            }
        }
    }
}

@OptIn(ExperimentalFoundationApi::class)
@Composable
private fun ChatRow(
    message: LiveChatEntry,
    author: LiveChatAuthor?,
    isMine: Boolean,
    isHostMessage: Boolean,
    canModerate: Boolean,
    knownMuted: Boolean,
    busy: Boolean,
    onMedia: Boolean,
    textColor: Color,
    mutedTextColor: Color,
    onDelete: () -> Unit,
    onSetMuted: (Boolean) -> Unit,
) {
    var menuOpen by remember { mutableStateOf(false) }
    val canDelete = isMine || canModerate
    // Never offer to chat-mute yourself or the host.
    val canMute = canModerate && !isMine && !isHostMessage
    val hasActions = canDelete || canMute
    val name = author?.name ?: author?.username ?: stringResource(R.string.live_chat_unknown_author)
    val actionsLabel = stringResource(R.string.chat_message_actions_cd)

    Box {
        Row(
            verticalAlignment = Alignment.Top,
            modifier = Modifier
                .fillMaxWidth()
                .then(
                    if (onMedia) {
                        Modifier.background(Color.Black.copy(alpha = 0.35f), RoundedCornerShape(Radius.sm))
                    } else {
                        Modifier
                    },
                )
                .then(
                    if (hasActions) {
                        Modifier.combinedClickable(
                            role = Role.Button,
                            onClickLabel = actionsLabel,
                            onLongClickLabel = actionsLabel,
                            onClick = { menuOpen = true },
                            onLongClick = { menuOpen = true },
                        )
                    } else {
                        Modifier
                    },
                )
                .padding(horizontal = Spacing.sm, vertical = Spacing.xs),
        ) {
            Avatar(url = author?.avatarUrl, name = name, size = 24.dp)
            Column(modifier = Modifier.weight(1f).padding(start = Spacing.sm)) {
                Row(verticalAlignment = Alignment.CenterVertically) {
                    Text(
                        text = name,
                        color = if (isHostMessage) ZrpRed else mutedTextColor,
                        style = MaterialTheme.typography.labelMedium,
                        fontWeight = FontWeight.Bold,
                        maxLines = 1,
                        overflow = TextOverflow.Ellipsis,
                        modifier = Modifier.weight(1f, fill = false),
                    )
                    if (isHostMessage) {
                        Text(
                            text = stringResource(R.string.live_audio_host_badge),
                            color = ZrpRed,
                            style = MaterialTheme.typography.labelSmall,
                            modifier = Modifier.padding(start = Spacing.xs),
                        )
                    }
                }
                Text(text = message.body, color = textColor, style = MaterialTheme.typography.bodyMedium)
            }
            if (busy) {
                CircularProgressIndicator(modifier = Modifier.padding(start = Spacing.xs).size(14.dp), strokeWidth = 2.dp, color = mutedTextColor)
            }
        }
        DropdownMenu(expanded = menuOpen, onDismissRequest = { menuOpen = false }) {
            if (canDelete) {
                DropdownMenuItem(
                    text = { Text(stringResource(R.string.chat_delete_message), color = ZrpRed) },
                    onClick = {
                        menuOpen = false
                        onDelete()
                    },
                )
            }
            if (canMute) {
                DropdownMenuItem(
                    text = { Text(stringResource(if (knownMuted) R.string.live_chat_unmute_user else R.string.live_chat_mute_user)) },
                    onClick = {
                        menuOpen = false
                        onSetMuted(!knownMuted)
                    },
                )
            }
        }
    }
}

@Composable
private fun ChatComposer(
    state: LiveChatState,
    onMedia: Boolean,
    textColor: Color,
    mutedTextColor: Color,
    onSend: (body: String, onSent: () -> Unit) -> Unit,
    onDismissSendError: () -> Unit,
) {
    var draft by rememberSaveable { mutableStateOf("") }
    var now by remember { mutableLongStateOf(System.currentTimeMillis()) }
    LaunchedEffect(state.cooldownUntilMillis) {
        now = System.currentTimeMillis()
        while (now < state.cooldownUntilMillis) {
            delay(250)
            now = System.currentTimeMillis()
        }
    }
    val cooldown = cooldownRemainingSeconds(now, state.cooldownUntilMillis)

    if (state.myChatMuted) {
        Text(
            text = stringResource(R.string.live_chat_muted_notice),
            color = mutedTextColor,
            style = MaterialTheme.typography.bodySmall,
            modifier = Modifier.fillMaxWidth().padding(Spacing.sm),
        )
        return
    }

    // A slow-mode / rate-limit rejection is shown as the countdown on the
    // send button below rather than as a separate error line.
    val sendError = state.sendError?.takeUnless { it.code == "slow_mode" || it.code == "rate_limited" }
    val sendErrorText = liveErrorText(sendError)
    if (sendErrorText != null) {
        DismissibleErrorRow(text = sendErrorText, onMedia = onMedia, onDismiss = onDismissSendError)
    }

    val trimmed = draft.trim()
    val canSend = trimmed.isNotEmpty() && trimmed.length <= LIVE_CHAT_MAX_LENGTH && !state.sending && cooldown == 0
    val submit = {
        if (canSend) onSend(draft, { draft = "" })
    }

    Row(verticalAlignment = Alignment.CenterVertically, modifier = Modifier.fillMaxWidth().padding(top = Spacing.xs)) {
        OutlinedTextField(
            value = draft,
            onValueChange = { if (it.length <= LIVE_CHAT_MAX_LENGTH) draft = it },
            placeholder = { Text(stringResource(R.string.live_chat_placeholder), color = mutedTextColor) },
            maxLines = 3,
            textStyle = MaterialTheme.typography.bodyMedium.copy(color = textColor),
            keyboardOptions = KeyboardOptions(imeAction = ImeAction.Send),
            keyboardActions = KeyboardActions(onSend = { submit() }),
            shape = RoundedCornerShape(Radius.lg),
            colors = if (onMedia) {
                OutlinedTextFieldDefaults.colors(
                    focusedContainerColor = Color.Black.copy(alpha = 0.45f),
                    unfocusedContainerColor = Color.Black.copy(alpha = 0.45f),
                    focusedBorderColor = Color.White.copy(alpha = 0.7f),
                    unfocusedBorderColor = Color.White.copy(alpha = 0.3f),
                    cursorColor = Color.White,
                )
            } else {
                OutlinedTextFieldDefaults.colors()
            },
            supportingText = if (draft.length > LIVE_CHAT_MAX_LENGTH - 50) {
                { Text(stringResource(R.string.live_chat_char_count, draft.length, LIVE_CHAT_MAX_LENGTH), color = mutedTextColor) }
            } else {
                null
            },
            modifier = Modifier.weight(1f).heightIn(min = 48.dp),
        )
        Box(contentAlignment = Alignment.Center, modifier = Modifier.padding(start = Spacing.xs)) {
            when {
                state.sending -> CircularProgressIndicator(modifier = Modifier.size(IconSize.md), strokeWidth = 2.dp, color = if (onMedia) Color.White else ZrpRed)
                cooldown > 0 -> Text(
                    text = stringResource(R.string.live_chat_cooldown, cooldown),
                    color = mutedTextColor,
                    style = MaterialTheme.typography.labelLarge,
                    modifier = Modifier.padding(horizontal = Spacing.sm),
                )
                else -> IconButton(onClick = submit, enabled = canSend) {
                    Icon(
                        Icons.Filled.Send,
                        contentDescription = stringResource(R.string.message_send_cd),
                        tint = if (canSend) ZrpRed else mutedTextColor,
                    )
                }
            }
        }
    }
}

@Composable
internal fun DismissibleErrorRow(text: String, onMedia: Boolean, onDismiss: () -> Unit) {
    Row(
        verticalAlignment = Alignment.CenterVertically,
        modifier = Modifier
            .fillMaxWidth()
            .then(if (onMedia) Modifier.background(Color.Black.copy(alpha = 0.55f), RoundedCornerShape(Radius.sm)) else Modifier)
            .padding(start = Spacing.sm),
    ) {
        Text(
            text = text,
            color = if (onMedia) Color.White else MaterialTheme.colorScheme.error,
            style = MaterialTheme.typography.bodySmall,
            modifier = Modifier.weight(1f),
        )
        IconButton(onClick = onDismiss) {
            Icon(
                Icons.Filled.Close,
                contentDescription = stringResource(R.string.action_cancel),
                modifier = Modifier.size(IconSize.sm),
                tint = if (onMedia) Color.White else MaterialTheme.colorScheme.onSurfaceVariant,
            )
        }
    }
}
