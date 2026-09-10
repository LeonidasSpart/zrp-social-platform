package one.zrp.social.mobile.ui.followlist

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
import androidx.compose.foundation.lazy.itemsIndexed
import androidx.compose.foundation.lazy.rememberLazyListState
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
import androidx.compose.runtime.LaunchedEffect
import androidx.compose.runtime.collectAsState
import androidx.compose.runtime.derivedStateOf
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
import one.zrp.social.mobile.ui.components.BadgeSize
import one.zrp.social.mobile.ui.components.VerifiedBadge
import one.zrp.social.mobile.ui.theme.Spacing
import one.zrp.social.mobile.ui.theme.ZrpRed
import one.zrp.social.mobile.ui.theme.ZrpWhite

/**
 * Real followers or following, from the same GET
 * /users/{username}/followers|following endpoints the website's own
 * pages use - including that page's privacy behaviour (a private
 * account, or a following list its owner hasn't made public, comes
 * back as an empty list from the server itself; there is nothing
 * further to gate natively).
 */
@Composable
fun FollowListScreen(
    username: String,
    mode: FollowListMode,
    onAuthorClick: (String) -> Unit,
    onBack: () -> Unit,
) {
    val viewModel: FollowListViewModel = viewModel(
        factory = remember(username, mode) { FollowListViewModelFactory(ProfileRepository(), username, mode) },
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
                text = stringResource(
                    if (mode == FollowListMode.FOLLOWERS) R.string.followers_title else R.string.following_title,
                ),
                style = MaterialTheme.typography.titleMedium,
                modifier = Modifier.padding(start = 4.dp),
            )
        }
        HorizontalDivider()

        val listState = rememberLazyListState()
        val shouldLoadMore by remember {
            derivedStateOf {
                val lastVisible = listState.layoutInfo.visibleItemsInfo.lastOrNull()?.index ?: 0
                val totalItems = listState.layoutInfo.totalItemsCount
                totalItems > 0 && lastVisible >= totalItems - 3
            }
        }
        LaunchedEffect(shouldLoadMore) {
            if (shouldLoadMore) viewModel.loadMore()
        }

        when {
            state.isLoading -> {
                Box(modifier = Modifier.fillMaxSize(), contentAlignment = Alignment.Center) {
                    CircularProgressIndicator()
                }
            }
            state.users.isEmpty() -> {
                Box(modifier = Modifier.fillMaxSize(), contentAlignment = Alignment.Center) {
                    val emptyText = state.error ?: stringResource(
                        if (mode == FollowListMode.FOLLOWERS) R.string.followers_empty else R.string.following_empty,
                    )
                    Text(
                        text = emptyText,
                        color = if (state.error != null) {
                            MaterialTheme.colorScheme.error
                        } else {
                            MaterialTheme.colorScheme.onSurfaceVariant
                        },
                        modifier = Modifier.padding(24.dp),
                    )
                }
            }
            else -> {
                LazyColumn(state = listState, modifier = Modifier.fillMaxSize()) {
                    itemsIndexed(state.users, key = { _, user -> user.id }) { _, user ->
                        FollowListRow(
                            name = user.name ?: user.username,
                            username = user.username,
                            avatarUrl = user.avatarUrl,
                            badgeType = user.badgeType,
                            isFollowing = user.isFollowing,
                            isOwnRow = user.id == state.ownUserId,
                            isToggling = state.followTogglingId == user.id,
                            onClick = { onAuthorClick(user.username) },
                            onFollowClick = { viewModel.toggleFollow(user.username, user.id) },
                        )
                    }

                    if (state.isLoadingMore) {
                        item {
                            Box(
                                modifier = Modifier
                                    .fillMaxWidth()
                                    .padding(16.dp),
                                contentAlignment = Alignment.Center,
                            ) {
                                CircularProgressIndicator(modifier = Modifier.size(24.dp))
                            }
                        }
                    }
                }
            }
        }
    }
}

@Composable
private fun FollowListRow(
    name: String,
    username: String,
    avatarUrl: String?,
    badgeType: String?,
    isFollowing: Boolean,
    isOwnRow: Boolean,
    isToggling: Boolean,
    onClick: () -> Unit,
    onFollowClick: () -> Unit,
) {
    Row(
        modifier = Modifier
            .fillMaxWidth()
            .clickable(onClick = onClick)
            .padding(horizontal = Spacing.lg, vertical = Spacing.sm),
        verticalAlignment = Alignment.CenterVertically,
    ) {
        Avatar(url = avatarUrl, name = name, size = 44.dp)

        Column(
            modifier = Modifier
                .weight(1f)
                .padding(start = Spacing.sm),
        ) {
            Row(verticalAlignment = Alignment.CenterVertically) {
                Text(
                    text = name,
                    style = MaterialTheme.typography.bodyLarge,
                    maxLines = 1,
                    overflow = TextOverflow.Ellipsis,
                    modifier = Modifier.weight(1f, fill = false),
                )
                VerifiedBadge(badgeType = badgeType, size = BadgeSize.default)
            }
            Text(
                text = "@$username",
                style = MaterialTheme.typography.bodySmall,
                color = MaterialTheme.colorScheme.onSurfaceVariant,
                maxLines = 1,
                overflow = TextOverflow.Ellipsis,
            )
        }

        if (!isOwnRow) {
            Spacer(modifier = Modifier.width(Spacing.sm))
            Button(
                onClick = onFollowClick,
                enabled = !isToggling,
                shape = MaterialTheme.shapes.large,
                colors = ButtonDefaults.buttonColors(
                    containerColor = if (isFollowing) {
                        MaterialTheme.colorScheme.surfaceContainerHigh
                    } else {
                        ZrpRed
                    },
                    contentColor = if (isFollowing) MaterialTheme.colorScheme.onSurface else ZrpWhite,
                ),
            ) {
                if (isToggling) {
                    CircularProgressIndicator(
                        modifier = Modifier.size(16.dp),
                        strokeWidth = 2.dp,
                        color = if (isFollowing) MaterialTheme.colorScheme.onSurface else ZrpWhite,
                    )
                } else {
                    Text(stringResource(if (isFollowing) R.string.action_following else R.string.action_follow))
                }
            }
        }
    }
}
