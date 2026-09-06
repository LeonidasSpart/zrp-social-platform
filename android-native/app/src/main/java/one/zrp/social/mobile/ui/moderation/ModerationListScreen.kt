package one.zrp.social.mobile.ui.moderation

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
import androidx.compose.material.icons.Icons
import androidx.compose.material.icons.filled.ArrowBack
import androidx.compose.material3.Button
import androidx.compose.material3.ButtonDefaults
import androidx.compose.material3.CircularProgressIndicator
import androidx.compose.material3.HorizontalDivider
import androidx.compose.material3.Icon
import androidx.compose.material3.IconButton
import androidx.compose.material3.MaterialTheme
import androidx.compose.material3.Text
import androidx.compose.runtime.Composable
import androidx.compose.runtime.collectAsState
import androidx.compose.runtime.getValue
import androidx.compose.runtime.remember
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.res.stringResource
import androidx.compose.ui.text.style.TextOverflow
import androidx.compose.ui.unit.dp
import androidx.lifecycle.viewmodel.compose.viewModel
import one.zrp.social.mobile.R
import one.zrp.social.mobile.data.ProfileRepository
import one.zrp.social.mobile.ui.components.Avatar
import one.zrp.social.mobile.ui.components.VerifiedBadge
import one.zrp.social.mobile.ui.theme.Spacing
import one.zrp.social.mobile.ui.theme.ZrpRed
import one.zrp.social.mobile.ui.theme.ZrpWhite
import one.zrp.social.mobile.util.formatCount
import one.zrp.social.mobile.util.formatRelativeTime

/**
 * Real blocked or muted users, from the same GET /users/blocked and
 * GET /users/muted endpoints the website's own settings pages use.
 * Reachable both from the signed-in user's own profile header ("More"
 * menu) and from the Settings hub's Privacy & Safety screen - the same
 * screen either way, not duplicated.
 */
@Composable
fun ModerationListScreen(
    mode: ModerationListMode,
    onAuthorClick: (String) -> Unit,
    onBack: () -> Unit,
) {
    val viewModel: ModerationListViewModel = viewModel(
        factory = remember(mode) { ModerationListViewModelFactory(ProfileRepository(), mode) },
    )
    val state by viewModel.state.collectAsState()

    val isBlocked = mode == ModerationListMode.BLOCKED

    Column(modifier = Modifier.fillMaxSize()) {
        Row(
            modifier = Modifier
                .fillMaxWidth()
                .padding(horizontal = 8.dp, vertical = 4.dp),
            verticalAlignment = Alignment.CenterVertically,
        ) {
            IconButton(onClick = onBack) {
                Icon(Icons.Filled.ArrowBack, contentDescription = "Back")
            }
            Text(
                text = stringResource(if (isBlocked) R.string.settings_blocked_users else R.string.settings_muted_users),
                style = MaterialTheme.typography.titleMedium,
                modifier = Modifier.padding(start = 4.dp),
            )
            Spacer(modifier = Modifier.weight(1f))
            Text(
                text = stringResource(
                    if (isBlocked) R.string.moderation_blocked_count else R.string.moderation_muted_count,
                    state.items.size,
                ),
                style = MaterialTheme.typography.bodySmall,
                color = MaterialTheme.colorScheme.onSurfaceVariant,
            )
        }
        // Matches the website's own /settings/blocked and /settings/muted
        // pages, which explain the effect of blocking/muting right under
        // the header - previously missing natively entirely.
        Text(
            text = stringResource(if (isBlocked) R.string.moderation_blocked_explanation else R.string.moderation_muted_explanation),
            style = MaterialTheme.typography.bodySmall,
            color = MaterialTheme.colorScheme.onSurfaceVariant,
            modifier = Modifier.padding(horizontal = Spacing.lg, vertical = Spacing.sm),
        )
        HorizontalDivider()

        when {
            state.isLoading -> {
                Box(modifier = Modifier.fillMaxSize(), contentAlignment = Alignment.Center) {
                    CircularProgressIndicator()
                }
            }
            state.items.isEmpty() -> {
                Box(modifier = Modifier.fillMaxSize(), contentAlignment = Alignment.Center) {
                    val error = state.error
                    if (error != null) {
                        Text(
                            text = error,
                            color = MaterialTheme.colorScheme.error,
                            modifier = Modifier.padding(24.dp),
                        )
                    } else {
                        // Matches the website's own two-line empty state
                        // (blocked/muted.emptyTitle + emptyDesc).
                        Column(horizontalAlignment = Alignment.CenterHorizontally) {
                            Text(
                                text = stringResource(if (isBlocked) R.string.moderation_no_blocked_users else R.string.moderation_no_muted_users),
                                color = MaterialTheme.colorScheme.onSurface,
                                style = MaterialTheme.typography.titleSmall,
                            )
                            Text(
                                text = stringResource(if (isBlocked) R.string.moderation_no_blocked_desc else R.string.moderation_no_muted_desc),
                                color = MaterialTheme.colorScheme.onSurfaceVariant,
                                style = MaterialTheme.typography.bodySmall,
                                modifier = Modifier.padding(top = 4.dp),
                            )
                        }
                    }
                }
            }
            else -> {
                LazyColumn(modifier = Modifier.fillMaxSize()) {
                    items(state.items, key = { it.id }) { item ->
                        ModerationListRow(
                            mode = mode,
                            item = item,
                            isToggling = state.togglingId == item.id,
                            onClick = { onAuthorClick(item.username) },
                            onActionClick = { viewModel.removeFromList(item.id, item.username) },
                        )
                    }
                }
            }
        }
    }
}

@Composable
private fun ModerationListRow(
    mode: ModerationListMode,
    item: ModerationListItem,
    isToggling: Boolean,
    onClick: () -> Unit,
    onActionClick: () -> Unit,
) {
    Row(
        modifier = Modifier
            .fillMaxWidth()
            .clickable(onClick = onClick)
            .padding(horizontal = Spacing.lg, vertical = Spacing.sm),
        verticalAlignment = Alignment.CenterVertically,
    ) {
        Avatar(url = item.avatarUrl, name = item.name ?: item.username, size = 44.dp)

        Column(
            modifier = Modifier
                .weight(1f)
                .padding(start = Spacing.sm),
        ) {
            Row(verticalAlignment = Alignment.CenterVertically) {
                Text(
                    text = item.name ?: item.username,
                    style = MaterialTheme.typography.bodyLarge,
                    maxLines = 1,
                    overflow = TextOverflow.Ellipsis,
                )
                VerifiedBadge(badgeType = item.badgeType, size = 16.dp, modifier = Modifier.padding(start = Spacing.xs))
            }
            Text(
                text = "@${item.username}",
                style = MaterialTheme.typography.bodySmall,
                color = MaterialTheme.colorScheme.onSurfaceVariant,
                maxLines = 1,
                overflow = TextOverflow.Ellipsis,
            )
            // The two halves each use their own real translated copy
            // (blocked/muted.followers, blocked/muted.blockedOn/mutedOn)
            // joined with " · ", same as the "N followers" + relative-time
            // shape the website itself uses elsewhere for this kind of row.
            Text(
                text = stringResource(R.string.moderation_followers_count, formatCount(item.followerCount)) +
                    " · " +
                    stringResource(
                        if (mode == ModerationListMode.BLOCKED) R.string.moderation_blocked_on else R.string.moderation_muted_on,
                        formatRelativeTime(item.actionDate),
                    ),
                style = MaterialTheme.typography.bodySmall,
                color = MaterialTheme.colorScheme.onSurfaceVariant,
                maxLines = 1,
                overflow = TextOverflow.Ellipsis,
            )
        }

        Spacer(modifier = Modifier.width(Spacing.sm))

        Button(
            onClick = onActionClick,
            enabled = !isToggling,
            shape = MaterialTheme.shapes.large,
            colors = ButtonDefaults.buttonColors(containerColor = ZrpRed, contentColor = ZrpWhite),
        ) {
            if (isToggling) {
                CircularProgressIndicator(modifier = Modifier.size(16.dp), strokeWidth = 2.dp, color = ZrpWhite)
            } else {
                Text(stringResource(if (mode == ModerationListMode.BLOCKED) R.string.profile_unblock else R.string.profile_unmute))
            }
        }
    }
}
