package one.zrp.social.mobile.ui.home

import androidx.compose.animation.core.LinearEasing
import androidx.compose.animation.core.RepeatMode
import androidx.compose.animation.core.animateFloat
import androidx.compose.animation.core.infiniteRepeatable
import androidx.compose.animation.core.rememberInfiniteTransition
import androidx.compose.animation.core.tween
import androidx.compose.foundation.layout.Box
import androidx.compose.foundation.layout.Column
import androidx.compose.foundation.layout.fillMaxSize
import androidx.compose.foundation.layout.fillMaxWidth
import androidx.compose.foundation.layout.padding
import androidx.compose.foundation.layout.size
import androidx.compose.foundation.lazy.LazyColumn
import androidx.compose.foundation.lazy.itemsIndexed
import androidx.compose.foundation.lazy.rememberLazyListState
import androidx.compose.foundation.shape.CircleShape
import androidx.compose.material.ExperimentalMaterialApi
import androidx.compose.material.icons.Icons
import androidx.compose.material.icons.filled.Refresh
import androidx.compose.material.pullrefresh.PullRefreshIndicator
import androidx.compose.material.pullrefresh.pullRefresh
import androidx.compose.material.pullrefresh.rememberPullRefreshState
import androidx.compose.material3.AlertDialog
import androidx.compose.material3.CircularProgressIndicator
import androidx.compose.material3.Icon
import androidx.compose.material3.IconButton
import androidx.compose.material3.MaterialTheme
import androidx.compose.material3.Surface
import androidx.compose.material3.Tab
import androidx.compose.material3.TabRow
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
import androidx.compose.ui.draw.rotate
import androidx.compose.ui.res.stringResource
import androidx.compose.ui.unit.dp
import androidx.lifecycle.viewmodel.compose.viewModel
import one.zrp.social.mobile.R
import one.zrp.social.mobile.data.PostsRepository
import one.zrp.social.mobile.ui.components.EditPostDialog
import one.zrp.social.mobile.ui.components.ReportDialog
import one.zrp.social.mobile.ui.stories.StoriesRail
import one.zrp.social.mobile.ui.theme.ZrpRed

/**
 * The native Home screen: the same two real feed streams the website
 * exposes (For You / Following), fetched and paginated directly - no
 * WebView, no re-implemented ranking logic.
 */
@OptIn(ExperimentalMaterialApi::class)
@Composable
fun HomeScreen(
    onAuthorClick: (String) -> Unit,
    onOpenComments: (postId: String) -> Unit,
    onOpenStoryViewer: (userId: String) -> Unit,
    onCreateStory: () -> Unit,
    onOpenQuotePost: (postId: String) -> Unit = {},
    onOpenReposts: (postId: String) -> Unit = {},
    onOpenQuotes: (postId: String) -> Unit = {},
    onOpenHashtag: (String) -> Unit = {},
    onOpenVideoViewer: (String) -> Unit = {},
) {
    val viewModel: HomeViewModel = viewModel(
        factory = remember { HomeViewModelFactory(PostsRepository()) },
    )
    val activeTab by viewModel.activeTab.collectAsState()
    val forYouState by viewModel.forYouState.collectAsState()
    val followingState by viewModel.followingState.collectAsState()
    val ownUserId by viewModel.ownUserId.collectAsState()

    val state = if (activeTab == FeedTab.FOR_YOU) forYouState else followingState

    val pullRefreshState = rememberPullRefreshState(
        refreshing = state.isRefreshing,
        onRefresh = { viewModel.refresh(activeTab) },
    )

    Box(modifier = Modifier.fillMaxSize()) {
        Column(modifier = Modifier.fillMaxSize()) {
            // A real, always-visible manual refresh affordance - page.tsx's
            // own floating "Refresh feed" button (a translucent circular
            // button positioned over the top of the page, spinning while
            // refreshing) - not just the pull-to-refresh gesture below,
            // which someone who doesn't know the gesture exists would
            // otherwise have no way to trigger. Web hardcodes its own
            // aria-label in English; translated here as native-only
            // supporting copy instead.
            //
            // Aligned within a Box scoped to just the stories rail's own
            // height (not the whole screen, and not the feed content
            // below) so it always floats over the stories row - the same
            // real area web's own button overlays - rather than drifting
            // onto the tab row or the first post depending on content
            // length. StoriesRail's own endContentPadding reserves scroll
            // clearance so the last story avatar is never hidden under it,
            // matching how web's StoriesBar wrapper reserves `pr-8` for
            // the exact same reason.
            Box(modifier = Modifier.fillMaxWidth()) {
                StoriesRail(
                    onOpenViewer = onOpenStoryViewer,
                    onCreateStory = onCreateStory,
                    endContentPadding = 44.dp,
                )

                val rotation = if (state.isRefreshing) {
                    val angle by rememberInfiniteTransition(label = "refreshSpin").animateFloat(
                        initialValue = 0f,
                        targetValue = 360f,
                        animationSpec = infiniteRepeatable(
                            animation = tween(durationMillis = 800, easing = LinearEasing),
                            repeatMode = RepeatMode.Restart,
                        ),
                        label = "refreshSpinAngle",
                    )
                    angle
                } else {
                    0f
                }

                // IconButton (not the Surface) owns the clickable bounds
                // here, so Compose's own 48dp-minimum touch target applies
                // in full - a fixed-size Surface wrapping the IconButton
                // instead would clip that minimum down to the visual
                // circle's own size, under Android's accessibility touch
                // target floor.
                IconButton(
                    onClick = { viewModel.refresh(activeTab) },
                    enabled = !state.isRefreshing,
                    modifier = Modifier.align(Alignment.CenterEnd),
                ) {
                    Surface(
                        shape = CircleShape,
                        color = MaterialTheme.colorScheme.surfaceContainerHigh.copy(alpha = 0.9f),
                        modifier = Modifier.size(36.dp),
                    ) {
                        Box(contentAlignment = Alignment.Center, modifier = Modifier.fillMaxSize()) {
                            Icon(
                                imageVector = Icons.Filled.Refresh,
                                contentDescription = stringResource(R.string.home_refresh_feed_cd),
                                tint = if (state.isRefreshing) ZrpRed else MaterialTheme.colorScheme.onSurfaceVariant,
                                modifier = Modifier
                                    .size(18.dp)
                                    .rotate(rotation),
                            )
                        }
                    }
                }
            }

            TabRow(selectedTabIndex = if (activeTab == FeedTab.FOR_YOU) 0 else 1) {
                Tab(
                    selected = activeTab == FeedTab.FOR_YOU,
                    onClick = { viewModel.selectTab(FeedTab.FOR_YOU) },
                    text = { Text(stringResource(R.string.feed_for_you)) },
                )
                Tab(
                    selected = activeTab == FeedTab.FOLLOWING,
                    onClick = { viewModel.selectTab(FeedTab.FOLLOWING) },
                    text = { Text(stringResource(R.string.feed_following)) },
                )
            }

            Box(
                modifier = Modifier
                    .fillMaxSize()
                    .pullRefresh(pullRefreshState),
            ) {
                val listState = rememberLazyListState()

                val shouldLoadMore by remember {
                    derivedStateOf {
                        val lastVisible = listState.layoutInfo.visibleItemsInfo.lastOrNull()?.index ?: 0
                        val totalItems = listState.layoutInfo.totalItemsCount
                        totalItems > 0 && lastVisible >= totalItems - 3
                    }
                }

                LaunchedEffect(shouldLoadMore, activeTab) {
                    if (shouldLoadMore) {
                        viewModel.loadMore(activeTab)
                    }
                }

                if (state.error != null && state.posts.isEmpty()) {
                    Text(
                        text = state.error,
                        color = MaterialTheme.colorScheme.error,
                        modifier = Modifier
                            .align(Alignment.Center)
                            .padding(24.dp),
                    )
                } else {
                    var reportingPostId by remember { mutableStateOf<String?>(null) }
                    var isSubmittingReport by remember { mutableStateOf(false) }
                    var reportError by remember { mutableStateOf<String?>(null) }
                    var deletingPostId by remember { mutableStateOf<String?>(null) }
                    var isDeletingPost by remember { mutableStateOf(false) }
                    var editingPostId by remember { mutableStateOf<String?>(null) }
                    var isSubmittingEdit by remember { mutableStateOf(false) }
                    var editError by remember { mutableStateOf<String?>(null) }

                    LazyColumn(state = listState, modifier = Modifier.fillMaxSize()) {
                        itemsIndexed(state.posts, key = { _, post -> post.id }) { _, post ->
                            PostCard(
                                post = post,
                                onLikeClick = { postId -> viewModel.toggleLike(activeTab, postId) },
                                onCommentClick = onOpenComments,
                                onRepostClick = { postId -> viewModel.toggleRepost(activeTab, postId) },
                                onBookmarkClick = { postId -> viewModel.toggleBookmark(activeTab, postId) },
                                onReportClick = { postId ->
                                    reportingPostId = postId
                                    reportError = null
                                },
                                isOwnPost = ownUserId != null && post.author.id == ownUserId,
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

                    val postId = reportingPostId
                    if (postId != null) {
                        ReportDialog(
                            isSubmitting = isSubmittingReport,
                            error = reportError,
                            onDismiss = { reportingPostId = null },
                            onSubmit = { reason, details ->
                                isSubmittingReport = true
                                viewModel.reportPost(postId, reason, details) { result ->
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
                                        viewModel.deletePost(activeTab, deletePostId) { result ->
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
                    val editPostContent = state.posts.find { it.id == editPostId }?.content
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

                PullRefreshIndicator(
                    refreshing = state.isRefreshing,
                    state = pullRefreshState,
                    modifier = Modifier.align(Alignment.TopCenter),
                )
            }
        }
    }
}
