package one.zrp.social.mobile.ui.settings

import androidx.compose.foundation.clickable
import androidx.compose.ui.semantics.Role
import androidx.compose.foundation.layout.Box
import androidx.compose.foundation.layout.Column
import androidx.compose.foundation.layout.Row
import androidx.compose.foundation.layout.fillMaxSize
import androidx.compose.foundation.layout.fillMaxWidth
import androidx.compose.foundation.layout.padding
import androidx.compose.material.icons.Icons
import androidx.compose.material.icons.filled.ArrowBack
import androidx.compose.material.icons.filled.Block
import androidx.compose.material.icons.filled.ChevronRight
import androidx.compose.material.icons.filled.Lock
import androidx.compose.material.icons.filled.NotificationsOff
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
 * The Privacy & Safety category screen - the same public-likes/public-
 * following/private-account toggles as the website's Privacy tab (PUT
 * /api/user/privacy), plus links to Blocked/Muted users, which this
 * native app already has real screens for (ModerationListScreen) -
 * reused here rather than duplicated.
 */
@Composable
fun PrivacySettingsScreen(
    onBack: () -> Unit,
    onOpenBlockedUsers: () -> Unit,
    onOpenMutedUsers: () -> Unit,
) {
    val viewModel: PrivacySettingsViewModel = viewModel(
        factory = remember { PrivacySettingsViewModelFactory(SettingsRepository()) },
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
                text = stringResource(R.string.settings_privacy_safety),
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
            Column(modifier = Modifier.fillMaxSize()) {
                ToggleRow(
                    title = stringResource(R.string.settings_public_likes),
                    subtitle = stringResource(R.string.settings_public_likes_desc),
                    checked = state.publicLikes,
                    enabled = !state.isSaving,
                    onCheckedChange = viewModel::setPublicLikes,
                )
                ToggleRow(
                    title = stringResource(R.string.settings_public_following),
                    subtitle = stringResource(R.string.settings_public_following_desc),
                    checked = state.publicFollowing,
                    enabled = !state.isSaving,
                    onCheckedChange = viewModel::setPublicFollowing,
                )
                ToggleRow(
                    title = stringResource(R.string.settings_private_account),
                    subtitle = stringResource(R.string.settings_private_account_desc),
                    checked = state.isPrivate,
                    enabled = !state.isSaving,
                    icon = Icons.Filled.Lock,
                    onCheckedChange = viewModel::setPrivate,
                )

                if (state.error != null) {
                    Text(
                        text = state.error ?: "",
                        color = MaterialTheme.colorScheme.error,
                        style = MaterialTheme.typography.bodySmall,
                        modifier = Modifier.padding(horizontal = Spacing.lg, vertical = Spacing.sm),
                    )
                }

                HorizontalDivider(modifier = Modifier.padding(vertical = Spacing.sm))

                NavRow(icon = Icons.Filled.NotificationsOff, label = stringResource(R.string.settings_muted_users), onClick = onOpenMutedUsers)
                NavRow(icon = Icons.Filled.Block, label = stringResource(R.string.settings_blocked_users), onClick = onOpenBlockedUsers)
            }
        }
    }
}

@Composable
private fun ToggleRow(
    title: String,
    subtitle: String,
    checked: Boolean,
    enabled: Boolean,
    onCheckedChange: (Boolean) -> Unit,
    icon: androidx.compose.ui.graphics.vector.ImageVector? = null,
) {
    Row(
        modifier = Modifier
            .fillMaxWidth()
            .padding(horizontal = Spacing.lg, vertical = Spacing.md),
        verticalAlignment = Alignment.CenterVertically,
    ) {
        Column(modifier = Modifier.weight(1f)) {
            Row(verticalAlignment = Alignment.CenterVertically) {
                if (icon != null) {
                    Icon(
                        imageVector = icon,
                        contentDescription = null,
                        modifier = Modifier.padding(end = Spacing.xs),
                        tint = MaterialTheme.colorScheme.onSurfaceVariant,
                    )
                }
                Text(text = title, style = MaterialTheme.typography.bodyLarge)
            }
            Text(
                text = subtitle,
                style = MaterialTheme.typography.bodySmall,
                color = MaterialTheme.colorScheme.onSurfaceVariant,
            )
        }
        Switch(checked = checked, onCheckedChange = onCheckedChange, enabled = enabled)
    }
}

@Composable
private fun NavRow(icon: androidx.compose.ui.graphics.vector.ImageVector, label: String, onClick: () -> Unit) {
    Row(
        modifier = Modifier
            .fillMaxWidth()
            .clickable(onClick = onClick, role = Role.Button)
            .padding(horizontal = Spacing.lg, vertical = Spacing.md),
        verticalAlignment = Alignment.CenterVertically,
    ) {
        Icon(
            imageVector = icon,
            contentDescription = null,
            tint = MaterialTheme.colorScheme.onSurfaceVariant,
            modifier = Modifier.padding(end = Spacing.md),
        )
        Text(text = label, style = MaterialTheme.typography.bodyLarge, modifier = Modifier.weight(1f))
        Icon(Icons.Filled.ChevronRight, contentDescription = null, tint = MaterialTheme.colorScheme.onSurfaceVariant)
    }
}
