package one.zrp.social.mobile.ui.profile

import androidx.compose.foundation.background
import androidx.compose.foundation.layout.Arrangement
import androidx.compose.foundation.layout.Box
import androidx.compose.foundation.layout.Column
import androidx.compose.foundation.layout.Row
import androidx.compose.foundation.layout.Spacer
import androidx.compose.foundation.layout.fillMaxSize
import androidx.compose.foundation.layout.fillMaxWidth
import androidx.compose.foundation.layout.height
import androidx.compose.foundation.layout.offset
import androidx.compose.foundation.layout.padding
import androidx.compose.foundation.layout.size
import androidx.compose.foundation.layout.width
import androidx.compose.foundation.lazy.LazyColumn
import androidx.compose.foundation.lazy.itemsIndexed
import androidx.compose.foundation.lazy.rememberLazyListState
import androidx.compose.material.ExperimentalMaterialApi
import androidx.compose.material.pullrefresh.PullRefreshIndicator
import androidx.compose.material.pullrefresh.pullRefresh
import androidx.compose.material.pullrefresh.rememberPullRefreshState
import androidx.compose.material.icons.Icons
import androidx.compose.material.icons.filled.MailOutline
import androidx.compose.material3.Button
import androidx.compose.material3.ButtonDefaults
import androidx.compose.material3.CircularProgressIndicator
import androidx.compose.material3.HorizontalDivider
import androidx.compose.material3.Icon
import androidx.compose.material3.IconButton
import androidx.compose.material3.MaterialTheme
import androidx.compose.material3.Text
import androidx.compose.material3.TextButton
import androidx.compose.runtime.Composable
import androidx.compose.runtime.LaunchedEffect
import androidx.compose.runtime.collectAsState
import androidx.compose.runtime.derivedStateOf
import androidx.compose.runtime.getValue
import androidx.compose.runtime.remember
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.layout.ContentScale
import androidx.compose.ui.text.font.FontWeight
import androidx.compose.ui.unit.dp
import androidx.lifecycle.viewmodel.compose.viewModel
import coil.compose.AsyncImage
import one.zrp.social.mobile.data.ProfileRepository
import one.zrp.social.mobile.network.UserProfile
import one.zrp.social.mobile.ui.components.Avatar
import one.zrp.social.mobile.ui.home.PostCard
import one.zrp.social.mobile.ui.theme.Spacing
import one.zrp.social.mobile.ui.theme.ZrpRed
import one.zrp.social.mobile.ui.theme.ZrpWhite
import one.zrp.social.mobile.util.formatCount

/**
 * A single profile screen instance - the signed-in user's own profile
 * when username is null (reached from the bottom-nav tab), or someone
 * else's when a real username is passed (reached by tapping a post's
 * author). Same real backend data either way, no WebView.
 */
@OptIn(ExperimentalMaterialApi::class)
@Composable
fun ProfileScreen(
    username: String?,
    onLogout: () -> Unit,
    onAuthorClick: (String) -> Unit,
    onMessageClick: (partnerId: String, partnerUsername: String) -> Unit,
    onOpenComments: (postId: String) -> Unit,
) {
    val viewModel: ProfileViewModel = viewModel(
        factory = remember(username) { ProfileViewModelFactory(ProfileRepository(), username) },
    )
    val state by viewModel.state.collectAsState()

    val pullRefreshState = rememberPullRefreshState(
        refreshing = state.isRefreshingPosts,
        onRefresh = { viewModel.refreshPosts() },
    )

    Box(
        modifier = Modifier
            .fillMaxSize()
            .pullRefresh(pullRefreshState),
    ) {
        val profile = state.profile

        when {
            state.isLoadingProfile -> {
                Box(modifier = Modifier.fillMaxSize(), contentAlignment = Alignment.Center) {
                    CircularProgressIndicator()
                }
            }
            profile == null -> {
                Box(modifier = Modifier.fillMaxSize(), contentAlignment = Alignment.Center) {
                    Text(
                        text = state.error ?: "Couldn't load this profile.",
                        color = MaterialTheme.colorScheme.error,
                        modifier = Modifier.padding(24.dp),
                    )
                }
            }
            else -> {
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

                LazyColumn(state = listState, modifier = Modifier.fillMaxSize()) {
                    item {
                        ProfileHeader(
                            profile = profile,
                            isOwnProfile = state.isOwnProfile,
                            isTogglingFollow = state.isTogglingFollow,
                            onFollowClick = { viewModel.toggleFollow() },
                            onLogoutClick = onLogout,
                            onMessageClick = { onMessageClick(profile.id, profile.username) },
                        )
                    }

                    itemsIndexed(state.posts, key = { _, post -> post.id }) { _, post ->
                        PostCard(
                            post = post,
                            onLikeClick = { postId -> viewModel.toggleLike(postId) },
                            onCommentClick = onOpenComments,
                            onRepostClick = { postId -> viewModel.toggleRepost(postId) },
                            onClick = onOpenComments,
                            onAuthorClick = onAuthorClick,
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

        PullRefreshIndicator(
            refreshing = state.isRefreshingPosts,
            state = pullRefreshState,
            modifier = Modifier.align(Alignment.TopCenter),
        )
    }
}

private val CoverHeight = 128.dp
private val HeaderAvatarSize = 88.dp

// The avatar deliberately overlaps the bottom edge of the cover photo,
// the one detail that reads as "designed profile" rather than "a list
// of fields" in every reference social app (Twitter, LinkedIn,
// Instagram all use it) - a ring in the page's own background color
// makes it look cut out of the cover rather than merely placed near it.
@Composable
private fun ProfileHeader(
    profile: UserProfile,
    isOwnProfile: Boolean,
    isTogglingFollow: Boolean,
    onFollowClick: () -> Unit,
    onLogoutClick: () -> Unit,
    onMessageClick: () -> Unit,
) {
    Column(modifier = Modifier.fillMaxWidth()) {
        Box(modifier = Modifier.fillMaxWidth()) {
            // Cover photo and the action-button row both live in this
            // inner Column, which reserves HeaderAvatarSize/2 of empty
            // space below the cover for the avatar to overlap into.
            // The Avatar itself is a separate, later sibling of the
            // outer Box - later siblings paint on top - so it's never
            // covered by the button row underneath it.
            Column(modifier = Modifier.fillMaxWidth()) {
                if (profile.coverUrl != null) {
                    AsyncImage(
                        model = profile.coverUrl,
                        contentDescription = null,
                        contentScale = ContentScale.Crop,
                        modifier = Modifier
                            .fillMaxWidth()
                            .height(CoverHeight),
                    )
                } else {
                    Box(
                        modifier = Modifier
                            .fillMaxWidth()
                            .height(CoverHeight)
                            .background(MaterialTheme.colorScheme.surfaceContainerHigh),
                    )
                }

                Row(
                    modifier = Modifier
                        .fillMaxWidth()
                        .padding(top = HeaderAvatarSize / 2 + Spacing.xs, end = Spacing.lg),
                    horizontalArrangement = Arrangement.End,
                    verticalAlignment = Alignment.CenterVertically,
                ) {
                    if (isOwnProfile) {
                        TextButton(onClick = onLogoutClick) {
                            Text("Log out")
                        }
                    } else {
                        IconButton(onClick = onMessageClick) {
                            Icon(Icons.Filled.MailOutline, contentDescription = "Message")
                        }

                        Spacer(modifier = Modifier.width(Spacing.xs))

                        Button(
                            onClick = onFollowClick,
                            enabled = !isTogglingFollow,
                            shape = MaterialTheme.shapes.large,
                            colors = ButtonDefaults.buttonColors(
                                containerColor = if (profile.isFollowing) {
                                    MaterialTheme.colorScheme.surfaceContainerHigh
                                } else {
                                    ZrpRed
                                },
                                contentColor = if (profile.isFollowing) {
                                    MaterialTheme.colorScheme.onSurface
                                } else {
                                    ZrpWhite
                                },
                            ),
                        ) {
                            Text(if (profile.isFollowing) "Following" else "Follow")
                        }
                    }
                }
            }

            Avatar(
                url = profile.avatarUrl,
                name = profile.name ?: profile.username,
                size = HeaderAvatarSize,
                ringColor = MaterialTheme.colorScheme.background,
                ringWidth = 4.dp,
                modifier = Modifier
                    .padding(start = Spacing.lg)
                    .offset(y = CoverHeight - HeaderAvatarSize / 2)
                    .align(Alignment.TopStart),
            )
        }

        Column(modifier = Modifier.padding(horizontal = Spacing.lg, top = Spacing.sm)) {
            Text(
                text = profile.name ?: profile.username,
                style = MaterialTheme.typography.titleLarge,
                fontWeight = FontWeight.Bold,
            )
            Text(
                text = "@${profile.username}",
                style = MaterialTheme.typography.bodyMedium,
                color = MaterialTheme.colorScheme.onSurfaceVariant,
            )

            if (!profile.bio.isNullOrBlank()) {
                Text(
                    text = profile.bio,
                    style = MaterialTheme.typography.bodyMedium,
                    modifier = Modifier.padding(top = Spacing.xs),
                )
            }
        }

        Row(
            modifier = Modifier
                .fillMaxWidth()
                .padding(horizontal = Spacing.lg, vertical = Spacing.md),
            horizontalArrangement = Arrangement.spacedBy(Spacing.xl),
        ) {
            ProfileStat(count = profile._count.posts, label = "Posts")
            ProfileStat(count = profile._count.followers, label = "Followers")
            ProfileStat(count = profile._count.following, label = "Following")
        }

        HorizontalDivider()
    }
}

@Composable
private fun ProfileStat(count: Int, label: String) {
    Column {
        Text(
            text = formatCount(count),
            fontWeight = FontWeight.Bold,
            style = MaterialTheme.typography.titleMedium,
        )
        Text(
            text = label,
            style = MaterialTheme.typography.bodySmall,
            color = MaterialTheme.colorScheme.onSurfaceVariant,
        )
    }
}
