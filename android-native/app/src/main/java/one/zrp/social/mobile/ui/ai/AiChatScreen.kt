package one.zrp.social.mobile.ui.ai

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
import androidx.compose.material.icons.filled.Add
import androidx.compose.material.icons.filled.ArrowBack
import androidx.compose.material.icons.filled.AutoAwesome
import androidx.compose.material.icons.filled.Person
import androidx.compose.material.icons.filled.Send
import androidx.compose.material3.CircularProgressIndicator
import androidx.compose.material3.HorizontalDivider
import androidx.compose.material3.Icon
import androidx.compose.material3.IconButton
import androidx.compose.material3.MaterialTheme
import androidx.compose.material3.OutlinedTextField
import androidx.compose.material3.Surface
import androidx.compose.material3.Text
import androidx.compose.runtime.Composable
import androidx.compose.runtime.LaunchedEffect
import androidx.compose.runtime.collectAsState
import androidx.compose.runtime.getValue
import androidx.compose.runtime.remember
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.graphics.Color
import androidx.compose.ui.res.stringResource
import androidx.compose.ui.text.style.TextAlign
import androidx.compose.ui.unit.dp
import androidx.lifecycle.viewmodel.compose.viewModel
import one.zrp.social.mobile.R
import one.zrp.social.mobile.data.AiRepository
import one.zrp.social.mobile.ui.theme.Spacing
import one.zrp.social.mobile.ui.theme.ZrpRed

/**
 * ZRP AI - ported from AIChat.tsx/AIPageSubtitle.tsx. See
 * AiChatViewModel's own KDoc for the non-streaming-mode decision (and
 * for why the website's own dead `plan`/`planLabels` computation isn't
 * ported). The website stacks two separate headers - the /ai page's
 * own H1 + AIPageSubtitle (ai.page.subtitle, ai.page.poweredBy) above
 * a bordered chat card with its own compact header (an "ZRP AI" H2 +
 * ai.chat.poweredByDeepseek + ai.chat.remainingToday) - this screen
 * collapses both into one compact top bar (title + ai.page.subtitle)
 * plus one caption row (remainingToday only), matching the established
 * compact-top-bar convention (CreatorScreen, TrustPassportScreen)
 * rather than nesting two headers. Neither ai_chat_powered_by_deepseek
 * nor ai_page_powered_by is rendered here: the underlying AI provider
 * is never named in user-facing UI, and there's no existing generic
 * (provider-free) translated string to fall back to, so both stay real
 * but deliberately unused rather than being deleted outright.
 * ai_chat_err_failed_response is unused for a different reason: it's
 * AIChat.tsx's own fallback for
 * an empty `error.error` field, but every real failure path the route
 * can hit always sets a non-empty error string - dead code on the
 * website too (AiRepository's own generic fallback covers the same,
 * never-actually-reached, network-failure case instead).
 */
@Composable
fun AiChatScreen(onBack: () -> Unit) {
    val viewModel: AiChatViewModel = viewModel(
        factory = remember { AiChatViewModelFactory(AiRepository()) },
    )
    val state by viewModel.state.collectAsState()
    val listState = rememberLazyListState()

    Column(modifier = Modifier.fillMaxSize()) {
        Row(
            modifier = Modifier
                .fillMaxWidth()
                .padding(horizontal = 8.dp, vertical = 4.dp),
            verticalAlignment = Alignment.CenterVertically,
        ) {
            IconButton(onClick = onBack) {
                Icon(Icons.Filled.ArrowBack, contentDescription = stringResource(R.string.nav_back))
            }
            Surface(shape = CircleShape, color = ZrpRed.copy(alpha = 0.1f)) {
                Icon(
                    imageVector = Icons.Filled.AutoAwesome,
                    contentDescription = null,
                    tint = ZrpRed,
                    modifier = Modifier.padding(8.dp).size(20.dp),
                )
            }
            Column(modifier = Modifier.padding(start = Spacing.sm)) {
                Text(text = "ZRP AI", style = MaterialTheme.typography.titleMedium)
                Text(
                    text = stringResource(R.string.ai_page_subtitle),
                    style = MaterialTheme.typography.bodySmall,
                    color = MaterialTheme.colorScheme.onSurfaceVariant,
                )
            }
            Row(modifier = Modifier.weight(1f), horizontalArrangement = Arrangement.End) {
                IconButton(onClick = viewModel::startNewChat) {
                    Icon(Icons.Filled.Add, contentDescription = stringResource(R.string.ai_chat_new_chat))
                }
            }
        }
        // The "Powered by DeepSeek..." caption that used to live here
        // (ai_page_powered_by) is intentionally not rendered - the
        // underlying AI provider is never named in user-facing UI. The
        // string resource itself is left defined (see strings.xml) since
        // it's still real, translated content that may be reused for a
        // future generic caption; only the DeepSeek-branded render is
        // removed. Arrangement.End (was SpaceBetween, which needed two
        // children) keeps the remaining-count text in the same visual
        // spot, at the row's end.
        Row(
            modifier = Modifier.fillMaxWidth().padding(horizontal = 12.dp, vertical = 4.dp),
            horizontalArrangement = Arrangement.End,
        ) {
            state.remaining?.let {
                Text(
                    text = stringResource(R.string.ai_chat_remaining_today, it),
                    style = MaterialTheme.typography.labelSmall,
                    color = MaterialTheme.colorScheme.onSurfaceVariant,
                )
            }
        }
        HorizontalDivider()

        Box(modifier = Modifier.weight(1f).fillMaxWidth()) {
            if (state.messages.isEmpty()) {
                EmptyState(onSuggestionClick = viewModel::onInputChange)
            } else {
                LaunchedEffect(state.messages.size) {
                    listState.animateScrollToItem(state.messages.size - 1)
                }
                LazyColumn(
                    state = listState,
                    modifier = Modifier.fillMaxSize().padding(horizontal = Spacing.md),
                ) {
                    items(state.messages, key = { it.id }) { message ->
                        MessageBubble(message)
                    }
                    if (state.isSending) {
                        item { LoadingBubble() }
                    }
                }
            }
        }

        if (state.error != null) {
            val message = if (state.error == AiChatViewModel.genericErrorSentinel) {
                stringResource(R.string.ai_chat_err_could_not_generate)
            } else {
                state.error
            }
            Text(
                text = message ?: "",
                color = MaterialTheme.colorScheme.error,
                style = MaterialTheme.typography.bodySmall,
                modifier = Modifier.fillMaxWidth().padding(horizontal = Spacing.md, vertical = Spacing.xs),
            )
        }

        Row(
            modifier = Modifier.fillMaxWidth().padding(Spacing.sm),
            verticalAlignment = Alignment.CenterVertically,
        ) {
            OutlinedTextField(
                value = state.input,
                onValueChange = viewModel::onInputChange,
                placeholder = { Text(stringResource(R.string.ai_chat_input_placeholder)) },
                enabled = !state.isSending,
                modifier = Modifier.weight(1f),
            )
            IconButton(
                onClick = viewModel::sendMessage,
                enabled = state.input.isNotBlank() && !state.isSending,
            ) {
                if (state.isSending) {
                    CircularProgressIndicator(modifier = Modifier.size(20.dp), strokeWidth = 2.dp)
                } else {
                    Icon(Icons.Filled.Send, contentDescription = stringResource(R.string.message_send_cd), tint = ZrpRed)
                }
            }
        }
        Text(
            text = stringResource(R.string.ai_chat_charity_footer),
            style = MaterialTheme.typography.bodySmall,
            color = MaterialTheme.colorScheme.onSurfaceVariant,
            textAlign = TextAlign.Center,
            modifier = Modifier.fillMaxWidth().padding(bottom = Spacing.sm),
        )
    }
}

@Composable
private fun EmptyState(onSuggestionClick: (String) -> Unit) {
    Column(
        modifier = Modifier.fillMaxSize().padding(Spacing.lg),
        horizontalAlignment = Alignment.CenterHorizontally,
        verticalArrangement = Arrangement.Center,
    ) {
        Icon(
            imageVector = Icons.Filled.AutoAwesome,
            contentDescription = null,
            tint = MaterialTheme.colorScheme.outline,
            modifier = Modifier.size(48.dp),
        )
        Text(
            text = stringResource(R.string.ai_chat_ask_anything),
            style = MaterialTheme.typography.titleSmall,
            modifier = Modifier.padding(top = Spacing.md),
        )
        Text(
            text = stringResource(R.string.ai_chat_get_help_chat),
            style = MaterialTheme.typography.bodySmall,
            color = MaterialTheme.colorScheme.onSurfaceVariant,
            textAlign = TextAlign.Center,
            modifier = Modifier.padding(top = 4.dp),
        )
        Row(
            horizontalArrangement = Arrangement.spacedBy(Spacing.sm),
            modifier = Modifier.padding(top = Spacing.md),
        ) {
            SuggestionChip(stringResource(R.string.ai_chat_suggestion_what_is_zrp), "What is ZRP Social?", onSuggestionClick)
            SuggestionChip(stringResource(R.string.ai_chat_suggestion_write_charity), "Write a post about charity", onSuggestionClick)
        }
        Row(modifier = Modifier.padding(top = Spacing.sm)) {
            SuggestionChip(stringResource(R.string.ai_chat_suggestion_35_charity), "How does the 35% charity work?", onSuggestionClick)
        }
    }
}

@Composable
private fun SuggestionChip(label: String, prompt: String, onClick: (String) -> Unit) {
    Surface(
        onClick = { onClick(prompt) },
        shape = RoundedCornerShape(50),
        color = MaterialTheme.colorScheme.surfaceVariant,
    ) {
        Text(
            text = label,
            style = MaterialTheme.typography.labelMedium,
            modifier = Modifier.padding(horizontal = 12.dp, vertical = 6.dp),
        )
    }
}

@Composable
private fun MessageBubble(message: AiChatMessageUi) {
    val isUser = message.role == "user"
    Row(
        modifier = Modifier.fillMaxWidth().padding(vertical = 6.dp),
        horizontalArrangement = if (isUser) Arrangement.End else Arrangement.Start,
    ) {
        if (!isUser) {
            AvatarIcon(isUser = false)
            Spacer(modifier = Modifier.width(Spacing.sm))
        }
        Surface(
            shape = RoundedCornerShape(12.dp),
            color = if (isUser) ZrpRed else MaterialTheme.colorScheme.surfaceVariant,
            modifier = Modifier.widthIn(max = 280.dp),
        ) {
            Text(
                text = message.content,
                color = if (isUser) Color.White else MaterialTheme.colorScheme.onSurface,
                style = MaterialTheme.typography.bodyMedium,
                modifier = Modifier.padding(horizontal = 12.dp, vertical = 8.dp),
            )
        }
        if (isUser) {
            Spacer(modifier = Modifier.width(Spacing.sm))
            AvatarIcon(isUser = true)
        }
    }
}

@Composable
private fun LoadingBubble() {
    Row(modifier = Modifier.fillMaxWidth().padding(vertical = 6.dp), horizontalArrangement = Arrangement.Start) {
        AvatarIcon(isUser = false)
        Spacer(modifier = Modifier.width(Spacing.sm))
        Surface(shape = RoundedCornerShape(12.dp), color = MaterialTheme.colorScheme.surfaceVariant) {
            CircularProgressIndicator(modifier = Modifier.padding(12.dp).size(16.dp), strokeWidth = 2.dp)
        }
    }
}

@Composable
private fun AvatarIcon(isUser: Boolean) {
    Surface(
        shape = CircleShape,
        color = if (isUser) ZrpRed else MaterialTheme.colorScheme.surfaceVariant,
    ) {
        Icon(
            imageVector = if (isUser) Icons.Filled.Person else Icons.Filled.AutoAwesome,
            contentDescription = null,
            tint = if (isUser) Color.White else MaterialTheme.colorScheme.onSurfaceVariant,
            modifier = Modifier.padding(6.dp).size(16.dp),
        )
    }
}
