package one.zrp.social.mobile.ui.settings

import androidx.compose.foundation.layout.Box
import androidx.compose.foundation.layout.Column
import androidx.compose.foundation.layout.Row
import androidx.compose.foundation.layout.fillMaxSize
import androidx.compose.foundation.layout.fillMaxWidth
import androidx.compose.foundation.layout.padding
import androidx.compose.material.icons.Icons
import androidx.compose.material.icons.filled.ArrowBack
import androidx.compose.material3.CircularProgressIndicator
import androidx.compose.material3.HorizontalDivider
import androidx.compose.material3.Icon
import androidx.compose.material3.IconButton
import androidx.compose.material3.MaterialTheme
import androidx.compose.material3.Switch
import androidx.compose.material3.Text
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
import one.zrp.social.mobile.data.SettingsRepository
import one.zrp.social.mobile.ui.theme.Spacing

/**
 * The "Notifications" settings category - GET/PUT /api/user/email-
 * preferences, the same six toggles EmailPreferences.tsx renders. Each
 * row saves the moment it's flipped (one PUT per toggle, matching web
 * exactly), not batched behind a single Save button.
 */
@Composable
fun NotificationSettingsScreen(onBack: () -> Unit) {
    val viewModel: NotificationSettingsViewModel = viewModel(
        factory = remember { NotificationSettingsViewModelFactory(SettingsRepository()) },
    )
    val state by viewModel.state.collectAsState()

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
            Text(
                text = stringResource(R.string.nav_notifications),
                style = MaterialTheme.typography.titleMedium,
                modifier = Modifier.padding(start = 4.dp),
            )
        }
        HorizontalDivider()

        if (state.isLoading) {
            Box(modifier = Modifier.fillMaxSize(), contentAlignment = Alignment.Center) {
                CircularProgressIndicator()
            }
        } else {
            val prefs = state.preferences
            Column(modifier = Modifier.fillMaxSize()) {
                PreferenceToggleRow(
                    title = stringResource(R.string.settings_notif_mentions),
                    checked = prefs.mentions,
                    enabled = state.savingKey != "mentions",
                    onCheckedChange = viewModel::setMentions,
                )
                PreferenceToggleRow(
                    title = stringResource(R.string.settings_notif_messages),
                    checked = prefs.messages,
                    enabled = state.savingKey != "messages",
                    onCheckedChange = viewModel::setMessages,
                )
                PreferenceToggleRow(
                    title = stringResource(R.string.settings_notif_likes),
                    checked = prefs.likes,
                    enabled = state.savingKey != "likes",
                    onCheckedChange = viewModel::setLikes,
                )
                PreferenceToggleRow(
                    title = stringResource(R.string.settings_notif_comments),
                    checked = prefs.comments,
                    enabled = state.savingKey != "comments",
                    onCheckedChange = viewModel::setComments,
                )
                PreferenceToggleRow(
                    title = stringResource(R.string.settings_notif_follows),
                    checked = prefs.follows,
                    enabled = state.savingKey != "follows",
                    onCheckedChange = viewModel::setFollows,
                )
                PreferenceToggleRow(
                    title = stringResource(R.string.settings_notif_reposts),
                    checked = prefs.reposts,
                    enabled = state.savingKey != "reposts",
                    onCheckedChange = viewModel::setReposts,
                )

                if (state.error != null) {
                    Text(
                        text = state.error ?: "",
                        color = MaterialTheme.colorScheme.error,
                        style = MaterialTheme.typography.bodySmall,
                        modifier = Modifier.padding(horizontal = Spacing.lg, vertical = Spacing.sm),
                    )
                }
            }
        }
    }
}

@Composable
private fun PreferenceToggleRow(
    title: String,
    checked: Boolean,
    enabled: Boolean,
    onCheckedChange: (Boolean) -> Unit,
) {
    Row(
        modifier = Modifier
            .fillMaxWidth()
            .padding(horizontal = Spacing.lg, vertical = Spacing.md),
        verticalAlignment = Alignment.CenterVertically,
    ) {
        Text(text = title, style = MaterialTheme.typography.bodyLarge, modifier = Modifier.weight(1f))
        Switch(checked = checked, onCheckedChange = onCheckedChange, enabled = enabled)
    }
}
