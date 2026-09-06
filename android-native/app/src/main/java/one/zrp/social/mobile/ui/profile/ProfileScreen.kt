package one.zrp.social.mobile.ui.profile

import androidx.compose.foundation.background
import androidx.compose.foundation.clickable
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
import androidx.compose.material.icons.filled.Block
import androidx.compose.material.icons.filled.Bookmark
import androidx.compose.material.icons.filled.MailOutline
import androidx.compose.material.icons.filled.MoreVert
import androidx.compose.material.icons.filled.Notifications
import androidx.compose.material.icons.filled.NotificationsOff
import androidx.compose.material.icons.filled.PushPin
import androidx.compose.material.icons.filled.Settings
import androidx.compose.material3.AlertDialog
import androidx.compose.material3.Button
import androidx.compose.material3.ButtonDefaults
import androidx.compose.material3.CircularProgressIndicator
import androidx.compose.material3.DropdownMenu
import androidx.compose.material3.DropdownMenuItem
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
import androidx.compose.runtime.mutableStateOf
import androidx.compose.runtime.remember
import androidx.compose.runtime.setValue
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.layout.ContentScale
import androidx.compose.ui.res.stringResource
import androidx.compose.ui.text.font.FontWeight
import androidx.compose.ui.unit.dp
import androidx.lifecycle.viewmodel.compose.viewModel
import coil.compose.AsyncImage
import one.zrp.social.mobile.R
import one.zrp.social.mobile.data.ProfileRepository
import one.zrp.social.mobile.network.UserProfile
import one.zrp.social.mobile.ui.components.Avatar
import one.zrp.social.mobile.ui.components.EditPostDialog
import one.zrp.social.mobile.ui.components.ReportDialog
import one.zrp.social.mobile.ui.components.VerifiedBadge
import one.zrp.social.mobile.ui.home.PostCard
import one.zrp.social.mobile.ui.theme.Spacing
import one.zrp.social.mobile.ui.theme.ZrpBlue
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
    onOpenBookmarks: () -> Unit = {},
    onOpenFollowers: (username: String) -> Unit = {},
    onOpenFollowing: (username: String) -> Unit = {},
    onOpenBlockedUsers: () -> Unit = {},
    onOpenMutedUsers: () -> Unit = {},
    onOpenSettings: () -> Unit = {},
    onOpenQuotePost: (postId: String) -> Unit = {},
    onOpenReposts: (postId: String) -> Unit = {},
    onOpenQuotes: (postId: String) -> Unit = {},
    onOpenHashtag: (String) -> Unit = {},
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
                var reportingPostId by remember { mutableStateOf<String?>(null) }
                var isSubmittingReport by remember { mutableStateOf(false) }
                var reportError by remember { mutableStateOf<String?>(null) }
                var deletingPostId by remember { mutableStateOf<String?>(null) }
                var isDeletingPost by remember { mutableStateOf(false) }
                var editingPostId by remember { mutableStateOf<String?>(null) }
                var isSubmittingEdit by remember { mutableStateOf(false) }
                var editError by remember { mutableStateOf<String?>(null) }

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
                            isTogglingBlock = state.isTogglingBlock,
                            isMuted = state.isMuted,
                            isTogglingMute = state.isTogglingMute,
                            onFollowClick = { viewModel.toggleFollow() },
                            onBlockClick = { viewModel.toggleBlock() },
                            onMuteClick = { viewModel.toggleMute() },
                            onLogoutClick = onLogout,
                            onMessageClick = { onMessageClick(profile.id, profile.username) },
                            onBookmarksClick = onOpenBookmarks,
                            onFollowersClick = { onOpenFollowers(profile.username) },
                            onFollowingClick = { onOpenFollowing(profile.username) },
                            onBlockedUsersClick = onOpenBlockedUsers,
                            onMutedUsersClick = onOpenMutedUsers,
                            onSettingsClick = onOpenSettings,
                        )
                    }

                    val pinnedPost = state.pinnedPost
                    if (pinnedPost != null) {
                        item(key = "pinned-${pinnedPost.id}") {
                            Column {
                                Row(
                                    verticalAlignment = Alignment.CenterVertically,
                                    modifier = Modifier.padding(start = Spacing.lg, top = Spacing.sm),
                                ) {
                                    Icon(
                                        imageVector = Icons.Filled.PushPin,
                                        contentDescription = null,
                                        tint = ZrpBlue,
                                        modifier = Modifier.size(14.dp),
                                    )
                                    Text(
                                        text = "Pinned",
                                        style = MaterialTheme.typography.labelMedium,
                                        color = ZrpBlue,
                                        modifier = Modifier.padding(start = Spacing.xs),
                                    )
                                }
                                PostCard(
                                    post = pinnedPost,
                                    onLikeClick = { postId -> viewModel.toggleLike(postId) },
                                    onCommentClick = onOpenComments,
                                    onRepostClick = { postId -> viewModel.toggleRepost(postId) },
                                    onBookmarkClick = { postId -> viewModel.toggleBookmark(postId) },
                                    onReportClick = { postId ->
                                        reportingPostId = postId
                                        reportError = null
                                    },
                                    isOwnPost = state.isOwnProfile,
                                    onDeleteClick = { postId -> deletingPostId = postId },
                                    onEditClick = { postId ->
                                        editingPostId = postId
                                        editError = null
                                    },
                                    onQuoteClick = onOpenQuotePost,
                                    onViewReposts = onOpenReposts,
                                    onViewQuotes = onOpenQuotes,
                                    onClick = onOpenComments,
                                    onAuthorClick = onAuthorClick,
                                    onHashtagClick = onOpenHashtag,
                                    showPinOption = state.isOwnProfile,
                                    isPinned = true,
                                    onPinClick = { postId -> viewModel.togglePin(postId) },
                                )
                                HorizontalDivider()
                            }
                        }
                    }

                    val nonPinnedPosts = if (pinnedPost != null) state.posts.filterNot { it.id == pinnedPost.id } else state.posts
                    itemsIndexed(nonPinnedPosts, key = { _, post -> post.id }) { _, post ->
                        PostCard(
                            post = post,
                            onLikeClick = { postId -> viewModel.toggleLike(postId) },
                            onCommentClick = onOpenComments,
                            onRepostClick = { postId -> viewModel.toggleRepost(postId) },
                            onBookmarkClick = { postId -> viewModel.toggleBookmark(postId) },
                            onReportClick = { postId ->
                                reportingPostId = postId
                                reportError = null
                            },
                            isOwnPost = state.isOwnProfile,
                            onDeleteClick = { postId -> deletingPostId = postId },
                            onEditClick = { postId ->
                                editingPostId = postId
                                editError = null
                            },
                            onQuoteClick = onOpenQuotePost,
                            onViewReposts = onOpenReposts,
                            onViewQuotes = onOpenQuotes,
                            onClick = onOpenComments,
                            onAuthorClick = onAuthorClick,
                            onHashtagClick = onOpenHashtag,
                            showPinOption = state.isOwnProfile,
                            isPinned = false,
                            onPinClick = { postId -> viewModel.togglePin(postId) },
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

                val reportPostId = reportingPostId
                if (reportPostId != null) {
                    ReportDialog(
                        isSubmitting = isSubmittingReport,
                        error = reportError,
                        onDismiss = { reportingPostId = null },
                        onSubmit = { reason, details ->
                            isSubmittingReport = true
                            viewModel.reportPost(reportPostId, reason, details) { result ->
                                isSubmittingReport = false
                                result
                                    .onSuccess { reportingPostId = null }
                                    .onFailure { reportError = it.message }
                            }
                        },
                    )
                }

                val deletePostId = deletingPostId
                if (deletePostId != null) {
                    // English-only on purpose - matches PostCard.tsx's own hardcoded,
                    // untranslated delete-confirmation dialog (see HomeScreen.kt).
                    AlertDialog(
                        onDismissRequest = { if (!isDeletingPost) deletingPostId = null },
                        title = { Text("Delete post?") },
                        text = { Text("This can't be undone.") },
                        confirmButton = {
                            if (isDeletingPost) {
                                CircularProgressIndicator(modifier = Modifier.size(20.dp))
                            } else {
                                TextButton(onClick = {
                                    isDeletingPost = true
                                    viewModel.deletePost(deletePostId) { result ->
                                        isDeletingPost = false
                                        deletingPostId = null
                                        result.onFailure { /* left visible; the row itself still shows the post on failure */ }
                                    }
                                }) {
                                    Text("Delete", color = MaterialTheme.colorScheme.error)
                                }
                            }
                        },
                        dismissButton = {
                            TextButton(onClick = { deletingPostId = null }, enabled = !isDeletingPost) {
                                Text("Cancel")
                            }
                        },
                    )
                }

                val editPostId = editingPostId
                val editPostContent = (state.posts.find { it.id == editPostId } ?: state.pinnedPost?.takeIf { it.id == editPostId })?.content
                if (editPostId != null && editPostContent != null) {
                    EditPostDialog(
                        initialContent = editPostContent,
                        isSubmitting = isSubmittingEdit,
                        error = editError,
                        onDismiss = { editingPostId = null },
                        onSubmit = { content ->
                            isSubmittingEdit = true
                            viewModel.editPost(editPostId, content) { result ->
                                isSubmittingEdit = false
                                result
                                    .onSuccess { editingPostId = null }
                                    .onFailure { editError = it.message }
                            }
                        },
                    )
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
    isTogglingBlock: Boolean,
    isMuted: Boolean,
    isTogglingMute: Boolean,
    onFollowClick: () -> Unit,
    onBlockClick: () -> Unit,
    onMuteClick: () -> Unit,
    onLogoutClick: () -> Unit,
    onMessageClick: () -> Unit,
    onBookmarksClick: () -> Unit,
    onFollowersClick: () -> Unit,
    onFollowingClick: () -> Unit,
    onBlockedUsersClick: () -> Unit,
    onMutedUsersClick: () -> Unit,
    onSettingsClick: () -> Unit,
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
                        IconButton(onClick = onBookmarksClick) {
                            Icon(Icons.Filled.Bookmark, contentDescription = stringResource(R.string.nav_bookmarks))
                        }

                        var moreMenuOpen by remember { mutableStateOf(false) }
                        Box {
                            IconButton(onClick = { moreMenuOpen = true }) {
                                Icon(Icons.Filled.MoreVert, contentDescription = stringResource(R.string.profile_more_actions))
                            }
                            DropdownMenu(expanded = moreMenuOpen, onDismissRequest = { moreMenuOpen = false }) {
                                DropdownMenuItem(
                                    text = { Text(stringResource(R.string.settings_title)) },
                                    leadingIcon = { Icon(Icons.Filled.Settings, contentDescription = null) },
                                    onClick = {
                                        moreMenuOpen = false
                                        onSettingsClick()
                                    },
                                )
                                DropdownMenuItem(
                                    text = { Text(stringResource(R.string.settings_blocked_users)) },
                                    onClick = {
                                        moreMenuOpen = false
                                        onBlockedUsersClick()
                                    },
                                )
                                DropdownMenuItem(
                                    text = { Text(stringResource(R.string.settings_muted_users)) },
                                    onClick = {
                                        moreMenuOpen = false
                                        onMutedUsersClick()
                                    },
                                )
                            }
                        }

                        TextButton(onClick = onLogoutClick) {
                            Text(stringResource(R.string.nav_sign_out))
                        }
                    } else {
                        var moreMenuOpen by remember { mutableStateOf(false) }
                        Box {
                            IconButton(onClick = { moreMenuOpen = true }) {
                                Icon(Icons.Filled.MoreVert, contentDescription = stringResource(R.string.profile_more_actions))
                            }
                            DropdownMenu(expanded = moreMenuOpen, onDismissRequest = { moreMenuOpen = false }) {
                                DropdownMenuItem(
                                    text = { Text(stringResource(if (isMuted) R.string.profile_unmute else R.string.profile_mute)) },
                                    enabled = !isTogglingMute,
                                    leadingIcon = {
                                        Icon(
                                            imageVector = if (isMuted) Icons.Filled.NotificationsOff else Icons.Filled.Notifications,
                                            contentDescription = null,
                                        )
                                    },
                                    onClick = {
                                        moreMenuOpen = false
                                        onMuteClick()
                                    },
                                )
                                DropdownMenuItem(
                                    text = { Text(stringResource(if (profile.isBlocked) R.string.profile_unblock else R.string.profile_block)) },
                                    enabled = !isTogglingBlock,
                                    leadingIcon = { Icon(Icons.Filled.Block, contentDescription = null, tint = ZrpRed) },
                                    onClick = {
                                        moreMenuOpen = false
                                        onBlockClick()
                                    },
                                )
                            }
                        }

                        IconButton(onClick = onMessageClick) {
                            Icon(Icons.Filled.MailOutline, contentDescription = stringResource(R.string.action_message))
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
                            Text(stringResource(if (profile.isFollowing) R.string.action_following else R.string.action_follow))
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

        Column(modifier = Modifier.padding(start = Spacing.lg, end = Spacing.lg, top = Spacing.sm)) {
            Row(verticalAlignment = Alignment.CenterVertically) {
                Text(
                    text = profile.name ?: profile.username,
                    style = MaterialTheme.typography.titleLarge,
                    fontWeight = FontWeight.Bold,
                )
                VerifiedBadge(
                    badgeType = profile.badgeType,
                    size = 20.dp,
                    modifier = Modifier.padding(start = Spacing.xs),
                )
            }
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
            ProfileStat(count = profile._count.posts, label = stringResource(R.string.profile_posts))
            ProfileStat(count = profile._count.followers, label = stringResource(R.string.profile_followers), onClick = onFollowersClick)
            ProfileStat(count = profile._count.following, label = stringResource(R.string.profile_following), onClick = onFollowingClick)
        }

        HorizontalDivider()
    }
}

@Composable
private fun ProfileStat(count: Int, label: String, onClick: (() -> Unit)? = null) {
    Column(
        modifier = if (onClick != null) Modifier.clickable(onClick = onClick) else Modifier,
    ) {
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
