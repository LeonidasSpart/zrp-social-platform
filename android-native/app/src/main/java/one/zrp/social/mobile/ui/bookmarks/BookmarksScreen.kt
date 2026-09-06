package one.zrp.social.mobile.ui.bookmarks

import androidx.compose.foundation.layout.Box
import androidx.compose.foundation.layout.Column
import androidx.compose.foundation.layout.Row
import androidx.compose.foundation.layout.fillMaxSize
import androidx.compose.foundation.layout.fillMaxWidth
import androidx.compose.foundation.layout.padding
import androidx.compose.foundation.layout.size
import androidx.compose.foundation.lazy.LazyColumn
import androidx.compose.foundation.lazy.itemsIndexed
import androidx.compose.foundation.lazy.rememberLazyListState
import androidx.compose.material.icons.Icons
import androidx.compose.material.icons.filled.ArrowBack
import androidx.compose.material3.AlertDialog
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
import androidx.compose.runtime.mutableStateOf
import androidx.compose.runtime.remember
import androidx.compose.runtime.setValue
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.res.stringResource
import androidx.compose.ui.unit.dp
import androidx.lifecycle.viewmodel.compose.viewModel
import one.zrp.social.mobile.R
import one.zrp.social.mobile.data.BookmarksRepository
import one.zrp.social.mobile.ui.components.EditPostDialog
import one.zrp.social.mobile.ui.components.ReportDialog
import one.zrp.social.mobile.ui.home.PostCard

/**
 * Real saved posts from GET /bookmarks - the same list the website's
 * own Bookmarks page shows (post-bookmarks only; see
 * BookmarksRepository's KDoc for why saved comments aren't rendered
 * here yet).
 */
@Composable
fun BookmarksScreen(
    onAuthorClick: (String) -> Unit,
    onOpenComments: (postId: String) -> Unit,
    onBack: () -> Unit,
    onOpenQuotePost: (postId: String) -> Unit = {},
    onOpenReposts: (postId: String) -> Unit = {},
    onOpenQuotes: (postId: String) -> Unit = {},
    onOpenHashtag: (String) -> Unit = {},
) {
    val viewModel: BookmarksViewModel = viewModel(
        factory = remember { BookmarksViewModelFactory(BookmarksRepository()) },
    )
    val state by viewModel.state.collectAsState()
    var reportingPostId by remember { mutableStateOf<String?>(null) }
    var isSubmittingReport by remember { mutableStateOf(false) }
    var reportError by remember { mutableStateOf<String?>(null) }
    var deletingPostId by remember { mutableStateOf<String?>(null) }
    var isDeletingPost by remember { mutableStateOf(false) }
    var editingPostId by remember { mutableStateOf<String?>(null) }
    var isSubmittingEdit by remember { mutableStateOf(false) }
    var editError by remember { mutableStateOf<String?>(null) }

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
                text = stringResource(R.string.nav_bookmarks),
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
            state.posts.isEmpty() -> {
                Box(modifier = Modifier.fillMaxSize(), contentAlignment = Alignment.Center) {
                    Text(
                        text = state.error ?: "No bookmarks yet. Posts you save will show up here.",
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
                    itemsIndexed(state.posts, key = { _, post -> post.id }) { _, post ->
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
                            isOwnPost = state.ownUserId != null && post.author.id == state.ownUserId,
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
    val editPostContent = state.posts.find { it.id == editPostId }?.content
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
