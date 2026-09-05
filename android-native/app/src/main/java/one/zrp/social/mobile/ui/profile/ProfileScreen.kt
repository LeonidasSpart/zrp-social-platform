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
import androidx.compose.foundation.layout.padding
import androidx.compose.foundation.layout.size
import androidx.compose.foundation.layout.width
import androidx.compose.foundation.lazy.LazyColumn
import androidx.compose.foundation.lazy.itemsIndexed
import androidx.compose.foundation.lazy.rememberLazyListState
import androidx.compose.foundation.shape.CircleShape
import androidx.compose.material.ExperimentalMaterialApi
import androidx.compose.material.pullrefresh.PullRefreshIndicator
import androidx.compose.material.pullrefresh.pullRefresh
import androidx.compose.material.pullrefresh.rememberPullRefreshState
import androidx.compose.material.icons.Icons
import androidx.compose.material.icons.filled.Person
import androidx.compose.material3.Button
import androidx.compose.material3.ButtonDefaults
import androidx.compose.material3.CircularProgressIndicator
import androidx.compose.material3.HorizontalDivider
import androidx.compose.material3.Icon
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
import androidx.compose.ui.draw.clip
import androidx.compose.ui.layout.ContentScale
import androidx.compose.ui.text.font.FontWeight
import androidx.compose.ui.unit.dp
import androidx.lifecycle.viewmodel.compose.viewModel
import coil.compose.AsyncImage
import one.zrp.social.mobile.data.ProfileRepository
import one.zrp.social.mobile.network.UserProfile
import one.zrp.social.mobile.ui.home.PostCard
import one.zrp.social.mobile.ui.theme.ZrpRed

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
) {
    val viewModel: ProfileViewModel = viewModel(
        factory = ProfileViewModelFactory(ProfileRepository(), username),
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
                        )
                    }

                    itemsIndexed(state.posts, key = { _, post -> post.id }) { _, post ->
                        PostCard(
                            post = post,
                            onLikeClick = { postId -> viewModel.toggleLike(postId) },
                            onClick = { /* Post detail screen lands in a later phase. */ },
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

@Composable
private fun ProfileHeader(
    profile: UserProfile,
    isOwnProfile: Boolean,
    isTogglingFollow: Boolean,
    onFollowClick: () -> Unit,
    onLogoutClick: () -> Unit,
) {
    Column(modifier = Modifier.fillMaxWidth()) {
        if (profile.coverUrl != null) {
            AsyncImage(
                model = profile.coverUrl,
                contentDescription = null,
                contentScale = ContentScale.Crop,
                modifier = Modifier
                    .fillMaxWidth()
                    .height(120.dp),
            )
        } else {
            Box(
                modifier = Modifier
                    .fillMaxWidth()
                    .height(120.dp)
                    .background(MaterialTheme.colorScheme.surfaceVariant),
            )
        }

        Row(
            modifier = Modifier
                .fillMaxWidth()
                .padding(16.dp),
            verticalAlignment = Alignment.Top,
        ) {
            if (profile.avatarUrl != null) {
                AsyncImage(
                    model = profile.avatarUrl,
                    contentDescription = profile.username,
                    contentScale = ContentScale.Crop,
                    modifier = Modifier
                        .size(72.dp)
                        .clip(CircleShape),
                )
            } else {
                Icon(
                    imageVector = Icons.Filled.Person,
                    contentDescription = profile.username,
                    modifier = Modifier.size(72.dp),
                )
            }

            Spacer(modifier = Modifier.width(16.dp))

            Column(modifier = Modifier.weight(1f)) {
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
            }

            if (isOwnProfile) {
                TextButton(onClick = onLogoutClick) {
                    Text("Log out")
                }
            } else {
                Button(
                    onClick = onFollowClick,
                    enabled = !isTogglingFollow,
                    colors = ButtonDefaults.buttonColors(
                        containerColor = if (profile.isFollowing) {
                            MaterialTheme.colorScheme.surfaceVariant
                        } else {
                            ZrpRed
                        },
                    ),
                ) {
                    Text(if (profile.isFollowing) "Following" else "Follow")
                }
            }
        }

        if (!profile.bio.isNullOrBlank()) {
            Text(
                text = profile.bio,
                style = MaterialTheme.typography.bodyMedium,
                modifier = Modifier.padding(horizontal = 16.dp, vertical = 4.dp),
            )
        }

        Row(
            modifier = Modifier
                .fillMaxWidth()
                .padding(horizontal = 16.dp, vertical = 12.dp),
            horizontalArrangement = Arrangement.spacedBy(20.dp),
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
    Row {
        Text(
            text = count.toString(),
            fontWeight = FontWeight.Bold,
            style = MaterialTheme.typography.bodyMedium,
        )
        Spacer(modifier = Modifier.width(4.dp))
        Text(
            text = label,
            style = MaterialTheme.typography.bodyMedium,
            color = MaterialTheme.colorScheme.onSurfaceVariant,
        )
    }
}
