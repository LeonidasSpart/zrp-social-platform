package one.zrp.social.mobile.ui.messages

import androidx.compose.foundation.background
import androidx.compose.foundation.layout.Box
import androidx.compose.foundation.layout.Row
import androidx.compose.foundation.layout.fillMaxHeight
import androidx.compose.foundation.layout.fillMaxSize
import androidx.compose.foundation.layout.fillMaxWidth
import androidx.compose.foundation.layout.width
import androidx.compose.material.icons.Icons
import androidx.compose.material.icons.filled.ChatBubbleOutline
import androidx.compose.material3.MaterialTheme
import androidx.compose.runtime.Composable
import androidx.compose.runtime.getValue
import androidx.compose.runtime.mutableStateOf
import androidx.compose.runtime.remember
import androidx.compose.runtime.setValue
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.res.stringResource
import androidx.compose.ui.unit.dp
import one.zrp.social.mobile.R
import one.zrp.social.mobile.ui.components.ZrpEmptyState

/**
 * Which thread this two-pane Messages tab currently has open in its
 * detail pane - plain `remember` (not `rememberSaveable`: this app has
 * no existing precedent of a custom Saver for a sealed class, and
 * inventing one just for this selection is more risk than the payoff of
 * surviving a config change/process death) - a rotation or a process
 * restart returns to the real empty-detail state, never a fabricated
 * "still selected" one.
 */
private sealed class SelectedThread {
    data class Direct(val partnerId: String, val partnerUsername: String) : SelectedThread()
    data class Group(val conversationId: String) : SelectedThread()
}

/**
 * Tablet/large-screen two-pane messaging (spec part B): the real
 * conversation list (MessagesScreen, 1:1 + GROUP merged) on the left and
 * the real active thread (ConversationScreen or GroupConversationScreen)
 * on the right, in ONE screen - selecting a row updates local state here
 * instead of pushing a new nav-graph destination, so both panes stay on
 * screen together. Phones never reach this composable at all
 * (ZrpNavHost only renders it once windowSizeClass.isTwoPane() is true -
 * see its own KDoc) - they keep the existing full-screen list-then-
 * thread push navigation, unchanged.
 *
 * A manual Row split, not `ListDetailPaneScaffold`/androidx.compose.
 * material3.adaptive - that's a separate artifact this app doesn't
 * otherwise depend on, and this codebase has no other adaptive-layout
 * library precedent to justify pulling one in for a single screen; a
 * plain Row keyed off the real WindowSizeClass already flowing down
 * from MainActivity fits this app's existing plain-Compose style.
 */
@Composable
fun MessagesHomeScreen(
    currentUserId: String,
    onOpenProfile: (String) -> Unit,
    onOpenGroupInfo: (conversationId: String) -> Unit,
    onNewGroup: () -> Unit,
) {
    var selected by remember { mutableStateOf<SelectedThread?>(null) }

    Row(modifier = Modifier.fillMaxSize()) {
        Box(modifier = Modifier.weight(0.38f).fillMaxHeight()) {
            MessagesScreen(
                onOpenConversation = { partnerId, username -> selected = SelectedThread.Direct(partnerId, username) },
                onOpenGroup = { conversationId -> selected = SelectedThread.Group(conversationId) },
                onNewGroup = onNewGroup,
                selectedKey = when (val current = selected) {
                    is SelectedThread.Direct -> "direct:${current.partnerId}"
                    is SelectedThread.Group -> "group:${current.conversationId}"
                    null -> null
                },
            )
        }

        Box(
            modifier = Modifier
                .width(1.dp)
                .fillMaxHeight()
                .background(MaterialTheme.colorScheme.outlineVariant),
        )

        Box(modifier = Modifier.weight(0.62f).fillMaxHeight()) {
            when (val current = selected) {
                is SelectedThread.Direct -> ConversationScreen(
                    partnerId = current.partnerId,
                    partnerUsername = current.partnerUsername,
                    onBack = { selected = null },
                    onOpenProfile = { onOpenProfile(current.partnerUsername) },
                )
                is SelectedThread.Group -> GroupConversationScreen(
                    conversationId = current.conversationId,
                    currentUserId = currentUserId,
                    onBack = { selected = null },
                    onOpenInfo = { onOpenGroupInfo(current.conversationId) },
                    onOpenProfile = onOpenProfile,
                )
                null -> Box(modifier = Modifier.fillMaxSize(), contentAlignment = Alignment.Center) {
                    ZrpEmptyState(
                        icon = Icons.Filled.ChatBubbleOutline,
                        title = stringResource(R.string.messages_select_conversation),
                    )
                }
            }
        }
    }
}
