package one.zrp.social.mobile.ui.profile

import android.content.Intent
import android.net.Uri
import androidx.activity.compose.rememberLauncherForActivityResult
import androidx.activity.result.PickVisualMediaRequest
import androidx.activity.result.contract.ActivityResultContracts
import androidx.compose.foundation.background
import androidx.compose.foundation.clickable
import androidx.compose.foundation.horizontalScroll
import androidx.compose.foundation.rememberScrollState
import androidx.compose.foundation.layout.Arrangement
import androidx.compose.foundation.layout.Box
import androidx.compose.foundation.layout.Column
import androidx.compose.foundation.layout.PaddingValues
import androidx.compose.foundation.layout.Row
import androidx.compose.foundation.layout.Spacer
import androidx.compose.foundation.layout.aspectRatio
import androidx.compose.foundation.layout.fillMaxSize
import androidx.compose.foundation.layout.fillMaxWidth
import androidx.compose.foundation.layout.height
import androidx.compose.foundation.layout.heightIn
import androidx.compose.foundation.layout.offset
import androidx.compose.foundation.layout.padding
import androidx.compose.foundation.layout.size
import androidx.compose.foundation.layout.width
import androidx.compose.foundation.lazy.LazyColumn
import androidx.compose.foundation.lazy.items
import androidx.compose.foundation.lazy.itemsIndexed
import androidx.compose.foundation.lazy.rememberLazyListState
import androidx.compose.foundation.shape.CircleShape
import androidx.compose.material.ExperimentalMaterialApi
import androidx.compose.material.pullrefresh.PullRefreshIndicator
import androidx.compose.material.pullrefresh.pullRefresh
import androidx.compose.material.pullrefresh.rememberPullRefreshState
import androidx.compose.material.icons.Icons
import androidx.compose.material.icons.filled.Block
import androidx.compose.material.icons.filled.Bookmark
import androidx.compose.material.icons.filled.CalendarMonth
import androidx.compose.material.icons.filled.CameraAlt
import androidx.compose.material.icons.filled.Link
import androidx.compose.material.icons.filled.Lock
import androidx.compose.material.icons.filled.LocationOn
import androidx.compose.material.icons.filled.MailOutline
import androidx.compose.material.icons.filled.MoreVert
import androidx.compose.material.icons.filled.Notifications
import androidx.compose.material.icons.filled.NotificationsOff
import androidx.compose.material.icons.filled.PushPin
import androidx.compose.material.icons.filled.Settings
import androidx.compose.material.icons.filled.Share
import androidx.compose.material.icons.filled.Shield
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
import androidx.compose.material3.ScrollableTabRow
import androidx.compose.material3.Surface
import androidx.compose.material3.Tab
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
import androidx.compose.ui.draw.clip
import androidx.compose.ui.graphics.Color
import androidx.compose.ui.layout.ContentScale
import androidx.compose.ui.platform.LocalContext
import androidx.compose.ui.platform.LocalUriHandler
import androidx.compose.ui.res.stringResource
import androidx.compose.ui.semantics.Role
import androidx.compose.ui.text.font.FontWeight
import androidx.compose.ui.text.style.TextOverflow
import androidx.compose.ui.unit.dp
import androidx.lifecycle.viewmodel.compose.viewModel
import coil.compose.AsyncImage
import one.zrp.social.mobile.R
import one.zrp.social.mobile.data.ProfileRepository
import one.zrp.social.mobile.network.Post
import one.zrp.social.mobile.network.UserProfile
import one.zrp.social.mobile.network.UserReply
import one.zrp.social.mobile.ui.components.Avatar
import one.zrp.social.mobile.ui.components.EditPostDialog
import one.zrp.social.mobile.ui.components.ProfileHeaderSkeleton
import one.zrp.social.mobile.ui.components.ReportDialog
import one.zrp.social.mobile.ui.components.BadgeSize
import one.zrp.social.mobile.ui.components.VerifiedBadge
import one.zrp.social.mobile.ui.home.PostCard
import one.zrp.social.mobile.ui.theme.Spacing
import one.zrp.social.mobile.ui.theme.TouchTarget
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
    onOpenTrustPassport: (username: String) -> Unit = {},
    onOpenVideoViewer: (String) -> Unit = {},
) {
    val viewModel: ProfileViewModel = viewModel(
        factory = remember(username) { ProfileViewModelFactory(ProfileRepository(), username) },
    )
    val state by viewModel.state.collectAsState()
    val context = LocalContext.current
    val contentResolver = context.contentResolver

    val isRefreshingSelectedTab = when (state.selectedTab) {
        ProfileTab.POSTS -> state.isRefreshingPosts
        ProfileTab.REPLIES -> state.repliesTab.isLoading && state.repliesTab.hasLoaded
        ProfileTab.MEDIA -> state.mediaTab.isLoading && state.mediaTab.hasLoaded
        ProfileTab.LIKES -> state.likesTab.isLoading && state.likesTab.hasLoaded
        ProfileTab.REPOSTS -> state.repostsTab.isLoading && state.repostsTab.hasLoaded
    }
    val pullRefreshState = rememberPullRefreshState(
        refreshing = isRefreshingSelectedTab,
        onRefresh = { viewModel.refreshSelectedTab() },
    )

    Box(
        modifier = Modifier
            .fillMaxSize()
            .pullRefresh(pullRefreshState),
    ) {
        val profile = state.profile

        when {
            state.isLoadingProfile -> {
                ProfileHeaderSkeleton()
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

                @Composable
                fun ProfileTabPostCard(post: Post, isPinned: Boolean, showPin: Boolean) {
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
                        isOwnPost = post.author.id == state.ownUserId,
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
                        onOpenVideoViewer = onOpenVideoViewer,
                        showPinOption = showPin,
                        isPinned = isPinned,
                        onPinClick = { postId -> viewModel.togglePin(postId) },
                        onVoteClick = { postId, pollId, optionIndex -> viewModel.votePoll(postId, pollId, optionIndex) },
                    )
                }

                val listState = rememberLazyListState()

                val shouldLoadMore by remember {
                    derivedStateOf {
                        val lastVisible = listState.layoutInfo.visibleItemsInfo.lastOrNull()?.index ?: 0
                        val totalItems = listState.layoutInfo.totalItemsCount
                        totalItems > 0 && lastVisible >= totalItems - 3
                    }
                }

                LaunchedEffect(shouldLoadMore, state.selectedTab) {
                    if (shouldLoadMore) viewModel.loadMoreSelectedTab()
                }

                // Bottom content padding beyond the Scaffold's own
                // bottomBar-height innerPadding (see ZrpNavHost.kt's
                // NavHost, which already reserves that) - without extra
                // room here, the LAST post's own text can sit right at
                // that boundary with no breathing space, reading as
                // "hidden behind the bottom navigation" on a real
                // device even though the bar itself never overlaps it.
                LazyColumn(
                    state = listState,
                    modifier = Modifier.fillMaxSize(),
                    contentPadding = PaddingValues(bottom = Spacing.xxl),
                ) {
                    item {
                        ProfileHeader(
                            profile = profile,
                            isOwnProfile = state.isOwnProfile,
                            isTogglingFollow = state.isTogglingFollow,
                            isFollowRequested = state.isFollowRequested,
                            isTogglingBlock = state.isTogglingBlock,
                            isMuted = state.isMuted,
                            isTogglingMute = state.isTogglingMute,
                            isUploadingAvatar = state.isUploadingAvatar,
                            isUploadingBanner = state.isUploadingBanner,
                            onFollowClick = { viewModel.toggleFollow() },
                            onBlockClick = { viewModel.toggleBlock() },
                            onMuteClick = { viewModel.toggleMute() },
                            onLogoutClick = onLogout,
                            onMessageClick = { onMessageClick(profile.id, profile.username) },
                            onBookmarksClick = onOpenBookmarks,
                            onShareClick = {
                                val slug = profile.customUrl ?: profile.username
                                val shareIntent = Intent(Intent.ACTION_SEND).apply {
                                    type = "text/plain"
                                    putExtra(Intent.EXTRA_TEXT, "https://zrp.one/$slug")
                                }
                                context.startActivity(Intent.createChooser(shareIntent, null))
                            },
                            onFollowersClick = { onOpenFollowers(profile.username) },
                            onFollowingClick = { onOpenFollowing(profile.username) },
                            onBlockedUsersClick = onOpenBlockedUsers,
                            onMutedUsersClick = onOpenMutedUsers,
                            onSettingsClick = onOpenSettings,
                            onAvatarPicked = { uri -> viewModel.uploadAvatar(contentResolver, uri) },
                            onBannerPicked = { uri -> viewModel.uploadBanner(contentResolver, uri) },
                            onTrustPassportClick = { onOpenTrustPassport(profile.username) },
                        )

                        val mediaUploadError = state.mediaUploadError
                        if (mediaUploadError != null) {
                            Text(
                                text = stringResource(
                                    if (mediaUploadError == MediaUploadTarget.AVATAR) {
                                        R.string.profile_upload_avatar_failed
                                    } else {
                                        R.string.profile_upload_banner_failed
                                    },
                                ),
                                color = MaterialTheme.colorScheme.error,
                                style = MaterialTheme.typography.bodySmall,
                                modifier = Modifier
                                    .padding(horizontal = Spacing.lg, vertical = Spacing.xs)
                                    .clickable { viewModel.dismissMediaUploadError() },
                            )
                        }
                    }

                    item {
                        ProfileTabRow(
                            selectedTab = state.selectedTab,
                            showLikesTab = state.isOwnProfile || profile.publicLikes,
                            onTabSelected = { viewModel.selectTab(it) },
                        )
                    }

                    // Matches page.tsx's own canViewPosts: a private
                    // account's tab content (every tab, not just Posts)
                    // is hidden from anyone but the owner or an approved
                    // follower - the backend already enforces this
                    // server-side (each tab endpoint returns an empty
                    // page otherwise), this just explains the resulting
                    // empty screen instead of showing a bare blank list.
                    val canViewContent = state.isOwnProfile ||
                        !profile.isPrivate ||
                        (profile.isFollowing && !state.isFollowRequested)

                    if (!canViewContent) {
                        item { ProfileProtectedMessage() }
                    } else {
                        when (state.selectedTab) {
                            ProfileTab.POSTS -> {
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
                                                    text = stringResource(R.string.profile_pinned),
                                                    style = MaterialTheme.typography.labelMedium,
                                                    color = ZrpBlue,
                                                    modifier = Modifier.padding(start = Spacing.xs),
                                                )
                                            }
                                            ProfileTabPostCard(post = pinnedPost, isPinned = true, showPin = state.isOwnProfile)
                                            HorizontalDivider()
                                        }
                                    }
                                }

                                val nonPinnedPosts = if (pinnedPost != null) state.posts.filterNot { it.id == pinnedPost.id } else state.posts
                                if (nonPinnedPosts.isEmpty() && pinnedPost == null && !state.isRefreshingPosts) {
                                    item { ProfileEmptyState(stringResource(R.string.profile_no_posts)) }
                                }
                                itemsIndexed(nonPinnedPosts, key = { _, post -> post.id }) { _, post ->
                                    ProfileTabPostCard(post = post, isPinned = false, showPin = state.isOwnProfile)
                                }
                                if (state.isLoadingMore) {
                                    item { ProfileTabLoadingMore() }
                                }
                            }
                            ProfileTab.REPLIES -> {
                                val tab = state.repliesTab
                                if (!tab.hasLoaded && tab.isLoading) {
                                    item { ProfileTabInitialLoading() }
                                } else if (tab.replies.isEmpty() && tab.hasLoaded) {
                                    item { ProfileEmptyState(stringResource(R.string.profile_no_replies)) }
                                }
                                itemsIndexed(tab.replies, key = { _, reply -> reply.id }) { _, reply ->
                                    ReplyRow(
                                        reply = reply,
                                        onAuthorClick = onAuthorClick,
                                        onOpenPost = { onOpenComments(reply.postId) },
                                    )
                                }
                                if (tab.isLoading && tab.hasLoaded) {
                                    item { ProfileTabLoadingMore() }
                                }
                            }
                            ProfileTab.MEDIA -> {
                                val tab = state.mediaTab
                                if (!tab.hasLoaded && tab.isLoading) {
                                    item { ProfileTabInitialLoading() }
                                } else if (tab.posts.isEmpty() && tab.hasLoaded) {
                                    item { ProfileEmptyState(stringResource(R.string.profile_no_media)) }
                                }
                                // A photo grid, not a column of full post
                                // cards - matches page.tsx's own media
                                // grid (see that file's comment for why).
                                // A LazyVerticalGrid nested inside this
                                // LazyColumn would be the same double-
                                // scrollable crash ADMIN's own stats grid
                                // hit (see zrp-design-system's "Known
                                // native debt"), so rows are chunked by
                                // hand instead - three real Post items
                                // per Row, one item per row of three.
                                items(tab.posts.chunked(3), key = { row -> row.first().id }) { row ->
                                    ProfileMediaGridRow(row, onOpenComments)
                                }
                                if (tab.isLoading && tab.hasLoaded) {
                                    item { ProfileTabLoadingMore() }
                                }
                            }
                            ProfileTab.LIKES -> {
                                val tab = state.likesTab
                                if (!tab.hasLoaded && tab.isLoading) {
                                    item { ProfileTabInitialLoading() }
                                } else if (tab.posts.isEmpty() && tab.hasLoaded) {
                                    item { ProfileEmptyState(stringResource(R.string.profile_no_likes)) }
                                }
                                itemsIndexed(tab.posts, key = { _, post -> post.id }) { _, post ->
                                    ProfileTabPostCard(post = post, isPinned = false, showPin = false)
                                }
                                if (tab.isLoading && tab.hasLoaded) {
                                    item { ProfileTabLoadingMore() }
                                }
                            }
                            ProfileTab.REPOSTS -> {
                                val tab = state.repostsTab
                                if (!tab.hasLoaded && tab.isLoading) {
                                    item { ProfileTabInitialLoading() }
                                } else if (tab.posts.isEmpty() && tab.hasLoaded) {
                                    item { ProfileEmptyState(stringResource(R.string.profile_no_reposts)) }
                                }
                                itemsIndexed(tab.posts, key = { _, post -> post.id }) { _, post ->
                                    ProfileTabPostCard(post = post, isPinned = false, showPin = false)
                                }
                                if (tab.isLoading && tab.hasLoaded) {
                                    item { ProfileTabLoadingMore() }
                                }
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
                    AlertDialog(
                        onDismissRequest = { if (!isDeletingPost) deletingPostId = null },
                        title = { Text(stringResource(R.string.post_delete_confirm_title)) },
                        text = { Text(stringResource(R.string.post_delete_confirm_body)) },
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
                                    Text(stringResource(R.string.action_delete), color = MaterialTheme.colorScheme.error)
                                }
                            }
                        },
                        dismissButton = {
                            TextButton(onClick = { deletingPostId = null }, enabled = !isDeletingPost) {
                                Text(stringResource(R.string.action_cancel))
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
                        title = stringResource(R.string.post_edit_dialog_title),
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
            refreshing = isRefreshingSelectedTab,
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
    isFollowRequested: Boolean,
    isTogglingBlock: Boolean,
    isMuted: Boolean,
    isTogglingMute: Boolean,
    isUploadingAvatar: Boolean,
    isUploadingBanner: Boolean,
    onFollowClick: () -> Unit,
    onBlockClick: () -> Unit,
    onMuteClick: () -> Unit,
    onLogoutClick: () -> Unit,
    onMessageClick: () -> Unit,
    onBookmarksClick: () -> Unit,
    onShareClick: () -> Unit,
    onAvatarPicked: (Uri) -> Unit,
    onBannerPicked: (Uri) -> Unit,
    onFollowersClick: () -> Unit,
    onFollowingClick: () -> Unit,
    onBlockedUsersClick: () -> Unit,
    onMutedUsersClick: () -> Unit,
    onSettingsClick: () -> Unit,
    onTrustPassportClick: () -> Unit,
) {
    val avatarPickerLauncher = rememberLauncherForActivityResult(
        contract = ActivityResultContracts.PickVisualMedia(),
    ) { uri -> if (uri != null) onAvatarPicked(uri) }
    val bannerPickerLauncher = rememberLauncherForActivityResult(
        contract = ActivityResultContracts.PickVisualMedia(),
    ) { uri -> if (uri != null) onBannerPicked(uri) }

    Column(modifier = Modifier.fillMaxWidth()) {
        Box(modifier = Modifier.fillMaxWidth()) {
            // Cover photo and the action-button row both live in this
            // inner Column, which reserves HeaderAvatarSize/2 of empty
            // space below the cover for the avatar to overlap into.
            // The Avatar itself is a separate, later sibling of the
            // outer Box - later siblings paint on top - so it's never
            // covered by the button row underneath it.
            Column(modifier = Modifier.fillMaxWidth()) {
                Box(modifier = Modifier.fillMaxWidth().height(CoverHeight)) {
                    if (profile.coverUrl != null) {
                        AsyncImage(
                            model = profile.coverUrl,
                            contentDescription = null,
                            contentScale = ContentScale.Crop,
                            modifier = Modifier.fillMaxSize(),
                        )
                    } else {
                        Box(
                            modifier = Modifier
                                .fillMaxSize()
                                .background(MaterialTheme.colorScheme.surfaceContainerHigh),
                        )
                    }

                    if (isOwnProfile) {
                        // "Change banner" - the same real, translated
                        // tooltip src/app/profile/[username]/page.tsx's
                        // own camera-overlay button carries.
                        IconButton(
                            onClick = { bannerPickerLauncher.launch(PickVisualMediaRequest(ActivityResultContracts.PickVisualMedia.ImageOnly)) },
                            enabled = !isUploadingBanner,
                            modifier = Modifier
                                .align(Alignment.BottomEnd)
                                .padding(Spacing.xs)
                                .background(Color.Black.copy(alpha = 0.5f), MaterialTheme.shapes.small),
                        ) {
                            if (isUploadingBanner) {
                                CircularProgressIndicator(modifier = Modifier.size(18.dp), strokeWidth = 2.dp, color = Color.White)
                            } else {
                                Icon(
                                    Icons.Filled.CameraAlt,
                                    contentDescription = stringResource(R.string.profile_change_banner),
                                    tint = Color.White,
                                )
                            }
                        }
                    }
                }

                Row(
                    modifier = Modifier
                        .fillMaxWidth()
                        .padding(top = HeaderAvatarSize / 2 + Spacing.xs, end = Spacing.lg),
                    horizontalArrangement = Arrangement.End,
                    verticalAlignment = Alignment.CenterVertically,
                ) {
                    // Matches page.tsx's own unconditional Share Profile
                    // button (shown on both own and other profiles alike).
                    IconButton(onClick = onShareClick) {
                        Icon(Icons.Filled.Share, contentDescription = stringResource(R.string.profile_share))
                    }

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

                        if (profile.isBlocked) {
                            // This viewer has blocked this account. Message
                            // and Follow both imply an interaction block is
                            // meant to prevent, so - matching page.tsx's own
                            // gating - they're replaced with a single quiet
                            // indicator. The only way back is the same More
                            // menu's Unblock item above.
                            Surface(
                                shape = MaterialTheme.shapes.extraLarge,
                                color = MaterialTheme.colorScheme.surfaceContainerHigh,
                            ) {
                                Row(
                                    verticalAlignment = Alignment.CenterVertically,
                                    modifier = Modifier.padding(horizontal = Spacing.md, vertical = Spacing.sm),
                                ) {
                                    Icon(
                                        Icons.Filled.Block,
                                        contentDescription = null,
                                        tint = MaterialTheme.colorScheme.onSurfaceVariant,
                                        modifier = Modifier.size(16.dp),
                                    )
                                    Text(
                                        text = stringResource(R.string.profile_blocked_state),
                                        color = MaterialTheme.colorScheme.onSurfaceVariant,
                                        modifier = Modifier.padding(start = Spacing.xs),
                                    )
                                }
                            }
                        } else {
                            // No Tip button here (web's page.tsx has one for a
                            // creator with tipsEnabled): sending a tip is a
                            // real on-chain Solana transaction, and this app
                            // has no wallet integration at all yet - neither
                            // CreatorApi.kt nor any other native API exposes a
                            // send-tip endpoint, only the creator-side
                            // tipsEnabled/solanaWallet settings for RECEIVING
                            // one (CreatorScreen.kt, ProfileEditScreen.kt).
                            // Adding a Tip button here without a real Mobile
                            // Wallet Adapter flow behind it would be exactly
                            // the fake/non-functional UI the master directive
                            // forbids - this needs its own dedicated
                            // wallet-integration pass, not a cosmetic add here.
                            IconButton(onClick = onMessageClick) {
                                Icon(Icons.Filled.MailOutline, contentDescription = stringResource(R.string.action_message))
                            }

                            Spacer(modifier = Modifier.width(Spacing.xs))

                            Button(
                                onClick = onFollowClick,
                                enabled = !isTogglingFollow && !isFollowRequested,
                                shape = MaterialTheme.shapes.large,
                                colors = ButtonDefaults.buttonColors(
                                    containerColor = if (profile.isFollowing || isFollowRequested) {
                                        MaterialTheme.colorScheme.surfaceContainerHigh
                                    } else {
                                        ZrpRed
                                    },
                                    contentColor = if (profile.isFollowing || isFollowRequested) {
                                        MaterialTheme.colorScheme.onSurface
                                    } else {
                                        ZrpWhite
                                    },
                                ),
                            ) {
                                Text(
                                    stringResource(
                                        when {
                                            isFollowRequested -> R.string.action_requested
                                            profile.isFollowing -> R.string.action_following
                                            else -> R.string.action_follow
                                        },
                                    ),
                                )
                            }
                        }
                    }
                }
            }

            Box(
                modifier = Modifier
                    .padding(start = Spacing.lg)
                    .offset(y = CoverHeight - HeaderAvatarSize / 2)
                    .align(Alignment.TopStart),
            ) {
                Avatar(
                    url = profile.avatarUrl,
                    name = profile.name ?: profile.username,
                    size = HeaderAvatarSize,
                    ringColor = MaterialTheme.colorScheme.background,
                    ringWidth = 4.dp,
                )

                if (isOwnProfile) {
                    // "Change avatar" - the same real, translated
                    // tooltip web's own camera-overlay button carries.
                    IconButton(
                        onClick = { avatarPickerLauncher.launch(PickVisualMediaRequest(ActivityResultContracts.PickVisualMedia.ImageOnly)) },
                        enabled = !isUploadingAvatar,
                        modifier = Modifier
                            .align(Alignment.BottomEnd)
                            .size(28.dp)
                            .background(Color.Black.copy(alpha = 0.6f), MaterialTheme.shapes.extraLarge),
                    ) {
                        if (isUploadingAvatar) {
                            CircularProgressIndicator(modifier = Modifier.size(14.dp), strokeWidth = 2.dp, color = Color.White)
                        } else {
                            Icon(
                                Icons.Filled.CameraAlt,
                                contentDescription = stringResource(R.string.profile_change_avatar),
                                tint = Color.White,
                                modifier = Modifier.size(16.dp),
                            )
                        }
                    }
                }
            }
        }

        Column(modifier = Modifier.padding(start = Spacing.lg, end = Spacing.lg, top = Spacing.sm)) {
            Row(verticalAlignment = Alignment.CenterVertically) {
                // weight(fill = false) + single line: a display name is
                // free text the account owner sets, so an unconstrained
                // one took the whole row and pushed the verification
                // badge and the private-account lock off the right edge
                // entirely - most easily on a 320dp screen, but any
                // long name did it. The name now yields to them and
                // ellipsizes instead; the badge is never the thing that
                // gets dropped.
                Text(
                    text = profile.name ?: profile.username,
                    style = MaterialTheme.typography.titleLarge,
                    fontWeight = FontWeight.Bold,
                    maxLines = 1,
                    overflow = TextOverflow.Ellipsis,
                    modifier = Modifier.weight(1f, fill = false),
                )
                VerifiedBadge(
                    badgeType = profile.badgeType,
                    size = BadgeSize.large,
                )
                // Matches page.tsx's own `profile.isPrivate && !isOwnProfile`
                // lock glyph next to the display name.
                if (profile.isPrivate && !isOwnProfile) {
                    Icon(
                        imageVector = Icons.Filled.Lock,
                        contentDescription = null,
                        tint = MaterialTheme.colorScheme.onSurfaceVariant,
                        modifier = Modifier.padding(start = Spacing.xs).size(16.dp),
                    )
                }
            }
            Row(verticalAlignment = Alignment.CenterVertically) {
                Text(
                    text = "@${profile.username}",
                    style = MaterialTheme.typography.bodyMedium,
                    color = MaterialTheme.colorScheme.onSurfaceVariant,
                    maxLines = 1,
                    overflow = TextOverflow.Ellipsis,
                )

                // "Follows you" - the reverse of profile.isFollowing (does
                // THIS account follow the viewer), matching page.tsx's own
                // followsMe chip. Quiet - a filled chip, not a second
                // accent competing with the Follow button above.
                if (!isOwnProfile && profile.followsMe) {
                    Surface(
                        shape = MaterialTheme.shapes.small,
                        color = MaterialTheme.colorScheme.surfaceContainerHigh,
                        modifier = Modifier.padding(start = Spacing.xs),
                    ) {
                        Text(
                            text = stringResource(R.string.profile_follows_you),
                            style = MaterialTheme.typography.labelSmall,
                            color = MaterialTheme.colorScheme.onSurfaceVariant,
                            maxLines = 1,
                            modifier = Modifier.padding(horizontal = Spacing.xs, vertical = 1.dp),
                        )
                    }
                }
            }

            // Professional category - a free-text field the account
            // owner sets themselves (ProfileEditScreen), shown only when
            // showCategory is also on, matching page.tsx's own
            // `profile.category && profile.showCategory` guard exactly.
            if (!profile.category.isNullOrBlank() && profile.showCategory) {
                Text(
                    text = profile.category,
                    style = MaterialTheme.typography.bodyMedium,
                    fontWeight = FontWeight.Medium,
                    color = ZrpRed,
                    modifier = Modifier.padding(top = 1.dp),
                )
            }

            if (!profile.bio.isNullOrBlank()) {
                Text(
                    text = profile.bio,
                    style = MaterialTheme.typography.bodyMedium,
                    modifier = Modifier.padding(top = Spacing.xs),
                )
            }

            // Location / website / joined - stacked one per line rather
            // than page.tsx's own flex-wrap row: this app's smallest
            // supported width (320dp) can't reliably fit two-plus of
            // these side by side without either overflowing or wrapping
            // mid-item, and a vertical stack can't overflow horizontally
            // at all - the same real fields (UserProfile.location/
            // website/createdAt), just laid out for a narrower viewport.
            Column(modifier = Modifier.padding(top = Spacing.xs)) {
                if (!profile.location.isNullOrBlank()) {
                    ProfileMetaRow(icon = Icons.Filled.LocationOn, text = profile.location.removePrefix("@"))
                }
                if (!profile.website.isNullOrBlank()) {
                    val uriHandler = LocalUriHandler.current
                    val displayUrl = profile.website.removePrefix("https://").removePrefix("http://")
                    ProfileMetaRow(
                        icon = Icons.Filled.Link,
                        text = displayUrl,
                        color = ZrpRed,
                        modifier = Modifier.clickable { uriHandler.openUri(profile.website) },
                    )
                }
                ProfileMetaRow(
                    icon = Icons.Filled.CalendarMonth,
                    text = stringResource(R.string.profile_joined) + " " + formatProfileJoinDate(profile.createdAt),
                )
            }

            // Charity note - a real, static fact about ZRP's business
            // model (the same 35% used site-wide: footer.charityBadge,
            // about.value3Desc, settings.platformFeeNote).
            Text(
                text = stringResource(R.string.profile_charity_note, "35"),
                style = MaterialTheme.typography.labelSmall,
                color = MaterialTheme.colorScheme.onSurfaceVariant,
                modifier = Modifier.padding(top = Spacing.xs),
            )

            // Impact - the real per-account figure page.tsx renders next
            // to the charity note (profile.charityContributionUsdc is now
            // the real sum of this profile's own completed tips/purchases'
            // charityAmount, computed server-side by
            // getUserCharityContributionUsdc - see UserProfile's own
            // KDoc). Always rendered (a real $0.00 for an account with no
            // contributions yet is still real data, not a placeholder).
            Text(
                text = stringResource(
                    R.string.profile_impact,
                    String.format(java.util.Locale.US, "$%.2f", profile.charityContributionUsdc),
                ),
                style = MaterialTheme.typography.labelSmall,
                color = MaterialTheme.colorScheme.onSurfaceVariant,
                modifier = Modifier.padding(top = 2.dp),
            )

            // Milestone badges - the same real, server-computed facts
            // page.tsx renders (computeMilestones() in
            // src/lib/milestones.ts), one native string resource per key
            // so this can never disagree with web on wording. Empty for
            // a brand-new account with none earned yet, matching web's
            // own `milestones.length > 0` guard.
            if (profile.milestones.isNotEmpty()) {
                Row(
                    modifier = Modifier
                        .padding(top = Spacing.xs)
                        .horizontalScroll(rememberScrollState()),
                    horizontalArrangement = Arrangement.spacedBy(Spacing.xs),
                ) {
                    profile.milestones.forEach { milestone ->
                        MilestoneBadge(milestone)
                    }
                }
            }
        }

        Row(
            modifier = Modifier
                .fillMaxWidth()
                .padding(horizontal = Spacing.lg, vertical = Spacing.md),
            horizontalArrangement = Arrangement.spacedBy(Spacing.xl),
        ) {
            // No Posts count here - real-device feedback flagged it as a
            // redundant header stat when the Posts tab right below
            // already represents post count naturally (matching both the
            // reference X profile layout and page.tsx's own header,
            // which has never shown one either - this was a native-only
            // divergence, not something web parity required).
            ProfileStat(count = profile._count.followers, label = stringResource(R.string.profile_followers), onClick = onFollowersClick)
            // Matches page.tsx's own showFollowingCount: an account that
            // has turned publicFollowing off hides the real number
            // (shown as "-") from anyone but the owner.
            val showFollowingCount = isOwnProfile || profile.publicFollowing
            ProfileStat(
                count = profile._count.following,
                label = stringResource(R.string.profile_following),
                onClick = if (showFollowingCount) onFollowingClick else null,
                displayOverride = if (showFollowingCount) null else "-",
            )
        }

        // ZRP Trust Passport - a real, public trust score built from
        // this account's own signals (see TrustApi's own KDoc). Shown
        // on every profile, own and others' alike, matching the
        // website's own unconditional placement here.
        Row(
            modifier = Modifier
                .fillMaxWidth()
                .padding(horizontal = Spacing.lg, vertical = Spacing.sm)
                .clip(MaterialTheme.shapes.large)
                .background(ZrpBlue.copy(alpha = 0.08f))
                .clickable(onClick = onTrustPassportClick)
                .padding(Spacing.md),
            verticalAlignment = Alignment.CenterVertically,
        ) {
            Box(
                modifier = Modifier
                    .size(44.dp)
                    .clip(CircleShape)
                    .background(ZrpBlue.copy(alpha = 0.1f)),
                contentAlignment = Alignment.Center,
            ) {
                Icon(Icons.Filled.Shield, contentDescription = null, tint = ZrpBlue, modifier = Modifier.size(24.dp))
            }

            Column(modifier = Modifier.weight(1f).padding(start = Spacing.sm)) {
                Row(verticalAlignment = Alignment.CenterVertically) {
                    // Title gets weight(fill = false) so it's measured
                    // AFTER the badge below - the badge always renders at
                    // its own natural, un-wrapped width, and the title
                    // ellipsizes instead if the two don't both fit. The
                    // reverse (title measured first, unweighted) is what
                    // squeezed the badge's remaining width so narrow that
                    // "Confiance" wrapped mid-word in French - the same
                    // failure mode this needs to avoid in every one of
                    // the 11 supported languages, not just work around it
                    // for this one string.
                    Text(
                        text = stringResource(R.string.profile_trust_passport_title),
                        style = MaterialTheme.typography.bodyMedium,
                        fontWeight = FontWeight.Bold,
                        maxLines = 1,
                        overflow = TextOverflow.Ellipsis,
                        modifier = Modifier.weight(1f, fill = false),
                    )
                    Surface(shape = MaterialTheme.shapes.extraLarge, color = ZrpRed.copy(alpha = 0.1f), modifier = Modifier.padding(start = Spacing.xs)) {
                        Text(
                            text = stringResource(R.string.profile_trust_passport_badge),
                            style = MaterialTheme.typography.labelSmall,
                            fontWeight = FontWeight.Bold,
                            color = ZrpRed,
                            maxLines = 1,
                            softWrap = false,
                            modifier = Modifier.padding(horizontal = Spacing.xs, vertical = 1.dp),
                        )
                    }
                }
                Text(
                    text = stringResource(R.string.profile_trust_passport_desc),
                    style = MaterialTheme.typography.bodySmall,
                    color = MaterialTheme.colorScheme.onSurfaceVariant,
                    modifier = Modifier.padding(top = 1.dp),
                )
            }

            Text(
                text = stringResource(R.string.profile_trust_passport_view) + " →",
                style = MaterialTheme.typography.labelMedium,
                fontWeight = FontWeight.Bold,
                color = ZrpBlue,
            )
        }

        HorizontalDivider()
    }
}

@Composable
private fun ProfileStat(count: Int, label: String, onClick: (() -> Unit)? = null, displayOverride: String? = null) {
    // Followers/Following are primary navigation off this screen, but
    // the column is only a bold number over a small caption - roughly
    // 36dp tall, under Android's 48dp accessible minimum - and a bare
    // clickable() announces as plain text rather than something you can
    // activate. Only the rows that actually navigate get the target and
    // the role; the Posts count isn't tappable and shouldn't claim to be.
    Column(
        modifier = if (onClick != null) {
            Modifier
                .heightIn(min = TouchTarget.min)
                .clickable(onClick = onClick, role = Role.Button, onClickLabel = label)
        } else {
            Modifier
        },
        verticalArrangement = Arrangement.Center,
    ) {
        Text(
            text = displayOverride ?: formatCount(count),
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

/**
 * One icon+text line in the location/website/joined block - see the
 * call site's own comment for why these stack vertically here instead
 * of page.tsx's flex-wrap row.
 */
@Composable
private fun ProfileMetaRow(
    icon: androidx.compose.ui.graphics.vector.ImageVector,
    text: String,
    color: androidx.compose.ui.graphics.Color = MaterialTheme.colorScheme.onSurfaceVariant,
    modifier: Modifier = Modifier,
) {
    Row(
        modifier = modifier.padding(top = 2.dp),
        verticalAlignment = Alignment.CenterVertically,
    ) {
        Icon(icon, contentDescription = null, tint = color, modifier = Modifier.size(14.dp))
        Text(
            text = text,
            style = MaterialTheme.typography.bodySmall,
            color = color,
            maxLines = 1,
            overflow = TextOverflow.Ellipsis,
            modifier = Modifier.padding(start = Spacing.xs),
        )
    }
}

/**
 * One earned milestone key -> its real, translated label - mirrors
 * page.tsx's own MILESTONE_TRANSLATION_KEYS exactly, key for key, so
 * native can never render a wording web doesn't also have. Falls back
 * to the raw key for a fact type this native build doesn't recognize
 * yet (a future computeMilestones() addition), matching page.tsx's own
 * `if (!translationKey) return fact.key` fallback.
 */
@Composable
private fun milestoneLabel(fact: one.zrp.social.mobile.network.MilestoneFact): String {
    val n = fact.params?.get("n")
    return when (fact.key) {
        "years_on_zrp" -> stringResource(R.string.profile_milestone_years, n ?: 0)
        "six_months" -> stringResource(R.string.profile_milestone_six_months)
        "new_member" -> stringResource(R.string.profile_milestone_new_member)
        "posts_500" -> stringResource(R.string.profile_milestone_posts_500)
        "posts_100" -> stringResource(R.string.profile_milestone_posts_100)
        "posts_10" -> stringResource(R.string.profile_milestone_posts_10)
        "followers_1k" -> stringResource(R.string.profile_milestone_followers_1k)
        "followers_100" -> stringResource(R.string.profile_milestone_followers_100)
        else -> fact.key
    }
}

@Composable
private fun MilestoneBadge(fact: one.zrp.social.mobile.network.MilestoneFact) {
    Surface(
        shape = MaterialTheme.shapes.small,
        color = MaterialTheme.colorScheme.surfaceContainerHigh,
    ) {
        Text(
            text = fact.icon + " " + milestoneLabel(fact),
            style = MaterialTheme.typography.labelSmall,
            maxLines = 1,
            modifier = Modifier.padding(horizontal = Spacing.sm, vertical = 4.dp),
        )
    }
}

// Matches page.tsx's own tabLabelMap/visibleTabs - five tabs, Likes
// hidden whenever showLikesTab is false (the profile owner has turned
// publicLikes off and this isn't their own profile).
@Composable
private fun ProfileTabRow(
    selectedTab: ProfileTab,
    showLikesTab: Boolean,
    onTabSelected: (ProfileTab) -> Unit,
) {
    val tabs = remember(showLikesTab) {
        buildList {
            add(ProfileTab.POSTS)
            add(ProfileTab.REPLIES)
            add(ProfileTab.MEDIA)
            if (showLikesTab) add(ProfileTab.LIKES)
            add(ProfileTab.REPOSTS)
        }
    }
    ScrollableTabRow(selectedTabIndex = tabs.indexOf(selectedTab).coerceAtLeast(0), edgePadding = Spacing.lg) {
        tabs.forEach { tab ->
            Tab(
                selected = tab == selectedTab,
                onClick = { onTabSelected(tab) },
                text = { Text(profileTabLabel(tab)) },
            )
        }
    }
}

@Composable
private fun profileTabLabel(tab: ProfileTab): String = when (tab) {
    ProfileTab.POSTS -> stringResource(R.string.profile_posts)
    ProfileTab.REPLIES -> stringResource(R.string.profile_replies)
    ProfileTab.MEDIA -> stringResource(R.string.profile_media)
    ProfileTab.LIKES -> stringResource(R.string.profile_likes)
    ProfileTab.REPOSTS -> stringResource(R.string.profile_reposts)
}

// Matches page.tsx's own renderProtectedMessage - shown across every
// tab (not just Posts) whenever canViewPosts is false, since the
// backend already withholds all five tabs' content the same way.
@Composable
private fun ProfileProtectedMessage() {
    Column(
        modifier = Modifier
            .fillMaxWidth()
            .padding(vertical = Spacing.xxl, horizontal = Spacing.lg),
        horizontalAlignment = Alignment.CenterHorizontally,
    ) {
        Box(
            modifier = Modifier
                .size(88.dp)
                .clip(CircleShape)
                .background(MaterialTheme.colorScheme.surfaceContainerHigh),
            contentAlignment = Alignment.Center,
        ) {
            Icon(
                imageVector = Icons.Filled.Lock,
                contentDescription = null,
                tint = MaterialTheme.colorScheme.onSurfaceVariant,
                modifier = Modifier.size(40.dp),
            )
        }
        Text(
            text = stringResource(R.string.profile_protected_account),
            style = MaterialTheme.typography.titleMedium,
            fontWeight = FontWeight.Bold,
            modifier = Modifier.padding(top = Spacing.md),
        )
        Text(
            text = stringResource(R.string.profile_protected_message),
            style = MaterialTheme.typography.bodyMedium,
            color = MaterialTheme.colorScheme.onSurfaceVariant,
            textAlign = androidx.compose.ui.text.style.TextAlign.Center,
            modifier = Modifier.padding(top = Spacing.xs),
        )
    }
}

@Composable
private fun ProfileEmptyState(text: String) {
    Box(
        modifier = Modifier
            .fillMaxWidth()
            .padding(vertical = Spacing.xxl),
        contentAlignment = Alignment.Center,
    ) {
        Text(text = text, style = MaterialTheme.typography.bodyMedium, color = MaterialTheme.colorScheme.onSurfaceVariant)
    }
}

@Composable
private fun ProfileTabInitialLoading() {
    Box(modifier = Modifier.fillMaxWidth().padding(32.dp), contentAlignment = Alignment.Center) {
        CircularProgressIndicator()
    }
}

@Composable
private fun ProfileTabLoadingMore() {
    Box(modifier = Modifier.fillMaxWidth().padding(16.dp), contentAlignment = Alignment.Center) {
        CircularProgressIndicator(modifier = Modifier.size(24.dp))
    }
}

// One row of the Media tab's thumbnail grid - up to three square photos,
// each tapping through to the real post (the same real /post/{id}
// destination ProfileTabPostCard's own onClick already opens). No like/
// comment count overlay the way page.tsx's own grid shows on :hover -
// touch has no hover state, and a permanently-visible overlay would just
// obscure the photo, so the tap target is the whole photo instead.
@Composable
private fun ProfileMediaGridRow(row: List<Post>, onOpenPost: (String) -> Unit) {
    Row(
        modifier = Modifier.fillMaxWidth(),
        horizontalArrangement = Arrangement.spacedBy(2.dp),
    ) {
        row.forEach { post ->
            Box(
                modifier = Modifier
                    .weight(1f)
                    .aspectRatio(1f)
                    .clickable(onClick = { onOpenPost(post.id) }, role = Role.Button)
                    .background(MaterialTheme.colorScheme.surfaceContainerHigh),
            ) {
                val imageUrl = post.imageUrl
                if (imageUrl != null) {
                    AsyncImage(
                        model = imageUrl,
                        contentDescription = null,
                        contentScale = ContentScale.Crop,
                        modifier = Modifier.fillMaxSize(),
                    )
                }
            }
        }
        // Pad an incomplete final row (1 or 2 photos) with empty
        // weighted space so the last real thumbnail keeps a full row's
        // width instead of stretching to fill the row alone.
        repeat(3 - row.size) {
            Spacer(modifier = Modifier.weight(1f))
        }
    }
}

// The native equivalent of page.tsx's renderReplyItem - a comment
// authored by the profile owner, tapping it opens the parent post
// (the same real /post/{postId} destination web's own Link points at)
// rather than a dedicated reply detail screen, which doesn't exist on
// either platform.
@Composable
private fun ReplyRow(
    reply: UserReply,
    onAuthorClick: (String) -> Unit,
    onOpenPost: () -> Unit,
) {
    Column(
        modifier = Modifier
            .fillMaxWidth()
            .clickable(onClick = onOpenPost)
            .padding(horizontal = Spacing.lg, vertical = Spacing.md),
    ) {
        Row(verticalAlignment = Alignment.Top) {
            Avatar(
                url = reply.author.avatarUrl,
                name = reply.author.name ?: reply.author.username,
                size = 40.dp,
                modifier = Modifier.clickable { onAuthorClick(reply.author.username) },
            )
            Column(modifier = Modifier.padding(start = Spacing.sm).weight(1f)) {
                Row(verticalAlignment = Alignment.CenterVertically) {
                    Text(
                        text = reply.author.name ?: reply.author.username,
                        fontWeight = FontWeight.Bold,
                        style = MaterialTheme.typography.bodyMedium,
                        maxLines = 1,
                        overflow = TextOverflow.Ellipsis,
                        modifier = Modifier.clickable { onAuthorClick(reply.author.username) },
                    )
                    VerifiedBadge(badgeType = reply.author.badgeType, size = BadgeSize.default)
                }
                Row {
                    Text(
                        text = "@${reply.author.username}",
                        style = MaterialTheme.typography.bodySmall,
                        color = MaterialTheme.colorScheme.onSurfaceVariant,
                    )
                    Text(
                        text = " · " + formatReplyDate(reply.createdAt),
                        style = MaterialTheme.typography.bodySmall,
                        color = MaterialTheme.colorScheme.onSurfaceVariant,
                    )
                }
                val replyTo = reply.replyTo
                if (replyTo != null) {
                    Text(
                        text = stringResource(R.string.profile_replying_to) + " @${replyTo.author.username}",
                        style = MaterialTheme.typography.bodySmall,
                        color = MaterialTheme.colorScheme.onSurfaceVariant,
                        modifier = Modifier.padding(top = 2.dp),
                    )
                }
                Text(
                    text = reply.content,
                    style = MaterialTheme.typography.bodyMedium,
                    modifier = Modifier.padding(top = Spacing.xs),
                )
                if (reply.imageUrl != null) {
                    AsyncImage(
                        model = reply.imageUrl,
                        contentDescription = null,
                        contentScale = ContentScale.Crop,
                        modifier = Modifier
                            .fillMaxWidth()
                            .height(180.dp)
                            .padding(top = Spacing.sm)
                            .clip(MaterialTheme.shapes.medium),
                    )
                }
            }
        }
        HorizontalDivider(modifier = Modifier.padding(top = Spacing.md))
    }
}

// Short, locale-aware date (e.g. "Jul 12, 2026") - matches page.tsx's
// own toLocaleDateString(localeMap[language]) call for reply timestamps,
// a different (shorter) format than the profile header's own
// formatProfileJoinDate month+year string.
private fun formatReplyDate(iso: String): String {
    val date = try {
        profileIsoFormat.get()!!.parse(iso)
    } catch (_: Exception) {
        null
    } ?: return ""
    return java.text.DateFormat.getDateInstance(java.text.DateFormat.MEDIUM, java.util.Locale.getDefault()).format(date)
}

// Locale-aware month+year, e.g. "July 2026" / "juillet 2026" - unlike
// TrustFormatting.kt's own formatTrustJoinDate (deliberately hardcoded
// to en-US to match a DIFFERENT web page's own hardcoded
// toLocaleDateString("en-US", ...) call), page.tsx's profile join date
// uses `localeMap[language] || "en-US"` - it IS locale-aware there, so
// this uses the device's current Locale (already set by Settings >
// Language via AppCompatDelegate) rather than copying Trust's English-
// only behavior onto a screen where web itself doesn't do that.
private val profileIsoFormat = ThreadLocal.withInitial {
    java.text.SimpleDateFormat("yyyy-MM-dd'T'HH:mm:ss.SSS'Z'", java.util.Locale.US).apply {
        timeZone = java.util.TimeZone.getTimeZone("UTC")
    }
}

private fun formatProfileJoinDate(iso: String): String {
    val date = try {
        profileIsoFormat.get()!!.parse(iso)
    } catch (_: Exception) {
        null
    } ?: return ""
    val formatter = java.text.SimpleDateFormat("MMMM yyyy", java.util.Locale.getDefault())
    return formatter.format(date)
}
