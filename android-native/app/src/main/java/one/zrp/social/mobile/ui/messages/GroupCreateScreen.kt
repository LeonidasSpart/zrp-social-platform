package one.zrp.social.mobile.ui.messages

import androidx.compose.foundation.layout.Column
import androidx.compose.foundation.layout.Row
import androidx.compose.foundation.layout.fillMaxSize
import androidx.compose.foundation.layout.fillMaxWidth
import androidx.compose.foundation.layout.padding
import androidx.compose.foundation.layout.size
import androidx.compose.foundation.rememberScrollState
import androidx.compose.foundation.verticalScroll
import androidx.compose.material.icons.Icons
import androidx.compose.material.icons.filled.ArrowBack
import androidx.compose.material3.CircularProgressIndicator
import androidx.compose.material3.HorizontalDivider
import androidx.compose.material3.Icon
import androidx.compose.material3.IconButton
import androidx.compose.material3.MaterialTheme
import androidx.compose.material3.OutlinedTextField
import androidx.compose.material3.Text
import androidx.compose.material3.TextButton
import androidx.compose.runtime.Composable
import androidx.compose.runtime.collectAsState
import androidx.compose.runtime.getValue
import androidx.compose.runtime.remember
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.res.stringResource
import androidx.compose.ui.unit.dp
import androidx.lifecycle.viewmodel.compose.viewModel
import one.zrp.social.mobile.R
import one.zrp.social.mobile.data.MessagesRepository
import one.zrp.social.mobile.ui.theme.Spacing
import one.zrp.social.mobile.ui.theme.ZrpRed

/**
 * "New group": a real name, at least [GROUP_MIN_OTHER_PARTICIPANTS]
 * real other members picked via [UserMultiSelectField], then a real
 * POST /api/conversations (GroupCreateViewModel). Lands on the new
 * group's own real thread (GroupConversationScreen) on success.
 */
@Composable
fun GroupCreateScreen(onBack: () -> Unit, onCreated: (conversationId: String) -> Unit) {
    val viewModel: GroupCreateViewModel = viewModel(
        factory = remember { GroupCreateViewModelFactory(MessagesRepository()) },
    )
    val state by viewModel.state.collectAsState()

    Column(modifier = Modifier.fillMaxSize()) {
        Row(
            modifier = Modifier
                .fillMaxWidth()
                .padding(horizontal = Spacing.sm, vertical = Spacing.xs),
            verticalAlignment = Alignment.CenterVertically,
        ) {
            IconButton(onClick = onBack) {
                Icon(Icons.Filled.ArrowBack, contentDescription = stringResource(R.string.chat_back_to_messages))
            }
            Text(
                text = stringResource(R.string.group_create_title),
                style = MaterialTheme.typography.titleMedium,
                modifier = Modifier.weight(1f).padding(start = Spacing.xs),
            )
            if (state.isCreating) {
                CircularProgressIndicator(modifier = Modifier.size(20.dp), strokeWidth = 2.dp)
            } else {
                TextButton(onClick = { viewModel.create(onCreated) }, enabled = viewModel.canCreate()) {
                    Text(stringResource(R.string.group_create_action), color = ZrpRed)
                }
            }
        }
        HorizontalDivider()

        Column(
            modifier = Modifier
                .fillMaxSize()
                .verticalScroll(rememberScrollState())
                .padding(Spacing.lg),
        ) {
            OutlinedTextField(
                value = state.name,
                onValueChange = { viewModel.onNameChange(it) },
                label = { Text(stringResource(R.string.group_name_label)) },
                singleLine = true,
                modifier = Modifier.fillMaxWidth(),
            )

            if (state.error != null) {
                Text(
                    text = state.error ?: "",
                    color = MaterialTheme.colorScheme.error,
                    style = MaterialTheme.typography.bodySmall,
                    modifier = Modifier.padding(top = Spacing.sm),
                )
            }

            Text(
                text = stringResource(R.string.group_members_label),
                style = MaterialTheme.typography.labelLarge,
                color = MaterialTheme.colorScheme.onSurfaceVariant,
                modifier = Modifier.padding(top = Spacing.lg, bottom = Spacing.xs),
            )
            if (state.selectedUsers.size < GROUP_MIN_OTHER_PARTICIPANTS) {
                Text(
                    text = stringResource(R.string.group_members_min_hint, GROUP_MIN_OTHER_PARTICIPANTS),
                    style = MaterialTheme.typography.labelSmall,
                    color = MaterialTheme.colorScheme.onSurfaceVariant,
                    modifier = Modifier.padding(bottom = Spacing.sm),
                )
            }

            UserMultiSelectField(
                selectedUsers = state.selectedUsers,
                onSelectedChange = { viewModel.onSelectedUsersChange(it) },
            )
        }
    }
}
