package one.zrp.social.mobile.ui.bookmarks

import androidx.compose.foundation.background
import androidx.compose.foundation.clickable
import androidx.compose.foundation.layout.Box
import androidx.compose.foundation.layout.Column
import androidx.compose.foundation.layout.IntrinsicSize
import androidx.compose.foundation.layout.Row
import androidx.compose.foundation.layout.Spacer
import androidx.compose.foundation.layout.fillMaxHeight
import androidx.compose.foundation.layout.fillMaxSize
import androidx.compose.foundation.layout.fillMaxWidth
import androidx.compose.foundation.layout.height
import androidx.compose.foundation.layout.padding
import androidx.compose.foundation.layout.size
import androidx.compose.foundation.layout.width
import androidx.compose.foundation.lazy.LazyColumn
import androidx.compose.foundation.lazy.itemsIndexed
import androidx.compose.foundation.lazy.rememberLazyListState
import androidx.compose.material.icons.Icons
import androidx.compose.material.icons.filled.ArrowBack
import androidx.compose.material.icons.filled.Bookmark
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
import androidx.compose.ui.text.style.TextOverflow
import androidx.compose.ui.unit.dp
import androidx.lifecycle.viewmodel.compose.viewModel
import one.zrp.social.mobile.R
import one.zrp.social.mobile.data.BookmarkRow
import one.zrp.social.mobile.data.BookmarksRepository
import one.zrp.social.mobile.network.BookmarkedComment
import one.zrp.social.mobile.ui.components.Avatar
import one.zrp.social.mobile.ui.components.EditPostDialog
import one.zrp.social.mobile.ui.components.ReportDialog
import one.zrp.social.mobile.ui.components.VerifiedBadge
import one.zrp.social.mobile.ui.home.PostCard
import one.zrp.social.mobile.ui.theme.ZrpRed
import one.zrp.social.mobile.util.formatRelativeTime
import one.zrp.social.mobile.util.localizedError

/**
 * Real saved posts AND saved comments from GET /bookmarks, in the same
 * merged (createdAt DESC) order the website's own Bookmarks page shows
 * (src/app/bookmarks/page.tsx) - a saved comment renders as its own
 * card (BookmarkedCommentCard below) rather than a PostCard, matching
 * the website's distinct comment-bookmark row.
 */
@Composable
fun BookmarksScreen(
    onAuthorClick: (String) -> Unit,
    onOpenComments: (postId: String) -> Unit,
    onOpenPostComment: (postId: String, commentId: String) -> Unit = { postId, _ -> onOpenComments(postId) },
    // A quoted post's preview opens its real detail page, not the
    // comments-only screen onOpenComments leads to.
    onOpenPost: (postId: String) -> Unit = onOpenComments,
    onBack: () -> Unit,
    onOpenQuotePost: (postId: String) -> Unit = {},
    onOpenReposts: (postId: String) -> Unit = {},
    onOpenQuotes: (postId: String) -> Unit = {},
    onOpenHashtag: (String) -> Unit = {},
    onOpenVideoViewer: (String) -> Unit = {},
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
                Icon(Icons.Filled.ArrowBack, contentDescription = stringResource(R.string.nav_back))
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
            state.rows.isEmpty() -> {
                Box(modifier = Modifier.fillMaxSize(), contentAlignment = Alignment.Center) {
                    Text(
                        text = localizedError(state.error) ?: stringResource(R.string.bookmarks_empty),
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
                    itemsIndexed(
                        state.rows,
                        key = { _, row ->
                            when (row) {
                                is BookmarkRow.PostRow -> "post-${row.post.id}"
                                is BookmarkRow.CommentRow -> "comment-${row.comment.id}"
                            }
                        },
                    ) { _, row ->
                        when (row) {
                            is BookmarkRow.PostRow -> {
                                val post = row.post
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
                                    onQuotedPostClick = onOpenPost,
                                    onAuthorClick = onAuthorClick,
                                    onHashtagClick = onOpenHashtag,
                                    onOpenVideoViewer = onOpenVideoViewer,
                                    onVoteClick = { postId, pollId, optionIndex -> viewModel.votePoll(postId, pollId, optionIndex) },
                                )
                            }
                            is BookmarkRow.CommentRow -> {
                                BookmarkedCommentCard(
                                    comment = row.comment,
                                    onAuthorClick = onAuthorClick,
                                    onClick = { onOpenPostComment(row.comment.post.id, row.comment.id) },
                                    onUnbookmarkClick = { viewModel.toggleCommentBookmark(row.comment.id) },
                                )
                            }
                        }
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
    val editPostContent = state.rows
        .filterIsInstance<BookmarkRow.PostRow>()
        .map { it.post }
        .find { it.id == editPostId }?.content
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

/**
 * A saved comment row - modeled on the website's own comment-bookmark
 * card (src/app/bookmarks/page.tsx), a bare-bones card distinct from a
 * full CommentRow (no like/repost/reply actions here, since this isn't
 * a comment thread - just a saved reference back into one) with the
 * same red left accent. Tapping it opens the parent post scrolled to
 * this exact comment (onOpenPostComment, reusing PostDetailScreen's
 * existing scroll-to-comment support).
 */
@Composable
private fun BookmarkedCommentCard(
    comment: BookmarkedComment,
    onAuthorClick: (String) -> Unit,
    onClick: () -> Unit,
    onUnbookmarkClick: () -> Unit,
) {
    Row(
        modifier = Modifier
            .fillMaxWidth()
            .height(IntrinsicSize.Min)
            .clickable(onClick = onClick)
            .padding(top = 12.dp, bottom = 12.dp, end = 16.dp),
        verticalAlignment = Alignment.Top,
    ) {
        Box(
            modifier = Modifier
                .fillMaxHeight()
                .width(3.dp)
                .background(ZrpRed),
        )

        Spacer(modifier = Modifier.width(13.dp))

        Avatar(
            url = comment.author.avatarUrl,
            name = comment.author.name ?: comment.author.username,
            size = 32.dp,
            modifier = Modifier.clickable { onAuthorClick(comment.author.id) },
        )

        Spacer(modifier = Modifier.width(10.dp))

        Column(modifier = Modifier.weight(1f)) {
            Row(verticalAlignment = Alignment.CenterVertically) {
                Text(
                    text = comment.author.name ?: comment.author.username,
                    style = MaterialTheme.typography.titleSmall,
                    maxLines = 1,
                    overflow = TextOverflow.Ellipsis,
                    modifier = Modifier.weight(1f, fill = false),
                )
                VerifiedBadge(badgeType = comment.author.badgeType)
                Spacer(modifier = Modifier.width(6.dp))
                Text(
                    text = "· ${formatRelativeTime(comment.createdAt)}",
                    style = MaterialTheme.typography.bodySmall,
                    color = MaterialTheme.colorScheme.onSurfaceVariant,
                )
            }
            Text(
                text = comment.content,
                style = MaterialTheme.typography.bodyMedium,
                modifier = Modifier.padding(top = 2.dp),
            )
            Text(
                text = stringResource(R.string.comment_replying_to, comment.post.author.username),
                style = MaterialTheme.typography.bodySmall,
                color = ZrpRed,
                modifier = Modifier.padding(top = 4.dp),
            )
        }

        IconButton(onClick = onUnbookmarkClick) {
            Icon(
                imageVector = Icons.Filled.Bookmark,
                contentDescription = stringResource(R.string.action_remove_bookmark),
                tint = ZrpRed,
            )
        }
    }
}
