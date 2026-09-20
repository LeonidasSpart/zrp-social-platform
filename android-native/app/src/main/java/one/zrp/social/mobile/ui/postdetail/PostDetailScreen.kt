package one.zrp.social.mobile.ui.postdetail

import android.content.Intent
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
import androidx.compose.material.icons.filled.Close
import androidx.compose.material.icons.filled.Send
import androidx.compose.material3.AlertDialog
import androidx.compose.material3.CircularProgressIndicator
import androidx.compose.material3.HorizontalDivider
import androidx.compose.material3.Icon
import androidx.compose.material3.IconButton
import androidx.compose.material3.MaterialTheme
import androidx.compose.material3.OutlinedTextField
import androidx.compose.material3.Text
import androidx.compose.material3.TextButton
import androidx.compose.runtime.Composable
import androidx.compose.runtime.collectAsState
import androidx.compose.runtime.getValue
import androidx.compose.runtime.mutableStateOf
import androidx.compose.runtime.remember
import androidx.compose.runtime.setValue
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.platform.LocalContext
import androidx.compose.ui.res.stringResource
import androidx.compose.ui.unit.dp
import androidx.lifecycle.viewmodel.compose.viewModel
import one.zrp.social.mobile.R
import one.zrp.social.mobile.data.CommentsRepository
import one.zrp.social.mobile.data.PostsRepository
import one.zrp.social.mobile.network.Comment
import one.zrp.social.mobile.ui.comments.CommentThread
import one.zrp.social.mobile.ui.comments.CommentsViewModel
import one.zrp.social.mobile.ui.comments.CommentsViewModelFactory
import one.zrp.social.mobile.ui.components.EditPostDialog
import one.zrp.social.mobile.ui.home.PostCard
import one.zrp.social.mobile.ui.theme.IconSize
import one.zrp.social.mobile.ui.theme.TouchTarget
import one.zrp.social.mobile.ui.theme.ZrpRed
import one.zrp.social.mobile.util.localizedError

/**
 * The actual post-detail screen the app never had: the post itself
 * (real PostCard, same as every feed/profile/search list - like,
 * repost, bookmark all work here too) followed by its real comment
 * thread below, one continuous scroll - matching the website's own
 * /post/[id] page and the iOS app's PostDetailView. Reached only from
 * a "like"/"repost" notification tap and the equivalent push deep link
 * (see ZrpNavHost's "post/{postId}" route) - every other place in the
 * app that opens a post (Home, Profile, Search, Bookmarks, etc.) still
 * goes straight to the comments-only screen exactly as before; that is
 * unrelated, pre-existing behavior this screen does not change.
 *
 * Report/delete/edit-post, quote, poll voting, and the video viewer are
 * intentionally not wired here yet (CommentsScreen never exposed any
 * of them either, since it never rendered the post at all - so leaving
 * them as no-ops is not a regression, just not full PostCard feature
 * parity with the main feed). Comment-level actions (like/repost/
 * bookmark/reply/edit/delete on a COMMENT) are the real, unmodified
 * CommentsViewModel/CommentThread behavior, reused as-is.
 */
@Composable
fun PostDetailScreen(
    postId: String,
    onBack: () -> Unit,
    onAuthorClick: (String) -> Unit = {},
    onOpenHashtag: (String) -> Unit = {},
    // The exact comment/reply a "someone commented"/"someone replied"
    // notification (or a shared comment link) pointed at - see
    // CommentThread's own doc comment for how this reaches a reply at
    // any depth, not just a top-level comment.
    targetCommentId: String? = null,
) {
    val postViewModel: PostDetailViewModel = viewModel(
        factory = remember(postId) { PostDetailViewModelFactory(PostsRepository(), postId) },
    )
    val postState by postViewModel.state.collectAsState()

    val commentsViewModel: CommentsViewModel = viewModel(
        factory = remember(postId) { CommentsViewModelFactory(CommentsRepository(), postId) },
    )
    val commentsState by commentsViewModel.state.collectAsState()

    val context = LocalContext.current

    var editingCommentId by remember { mutableStateOf<String?>(null) }
    var isSubmittingEdit by remember { mutableStateOf(false) }
    var editError by remember { mutableStateOf<String?>(null) }
    var deletingCommentId by remember { mutableStateOf<String?>(null) }
    var isDeletingComment by remember { mutableStateOf(false) }

    fun shareComment(comment: Comment) {
        // Matches the "post/{postId}?commentId={commentId}" deep link
        // registered on ZrpNavHost - a link built with the old
        // "?comment=" param name never matched that route at all and
        // silently opened the post with no comment target.
        val url = "https://zrp.one/post/$postId?commentId=${comment.id}"
        val intent = Intent(Intent.ACTION_SEND).apply {
            type = "text/plain"
            putExtra(Intent.EXTRA_TEXT, url)
        }
        context.startActivity(Intent.createChooser(intent, context.getString(R.string.comments_share_title)))
    }

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
        }
        HorizontalDivider()

        Box(modifier = Modifier.weight(1f).fillMaxWidth()) {
            LazyColumn(modifier = Modifier.fillMaxSize()) {
                item {
                    val post = postState.post
                    when {
                        post != null -> {
                            PostCard(
                                post = post,
                                onLikeClick = { postViewModel.toggleLike() },
                                onCommentClick = {},
                                onRepostClick = { postViewModel.toggleRepost() },
                                onBookmarkClick = { postViewModel.toggleBookmark() },
                                onClick = {},
                                onAuthorClick = onAuthorClick,
                                onHashtagClick = onOpenHashtag,
                            )
                        }
                        postState.isLoading -> {
                            Box(
                                modifier = Modifier.fillMaxWidth().padding(32.dp),
                                contentAlignment = Alignment.Center,
                            ) {
                                CircularProgressIndicator()
                            }
                        }
                        else -> {
                            Text(
                                text = localizedError(postState.error) ?: "",
                                color = MaterialTheme.colorScheme.error,
                                modifier = Modifier.padding(24.dp),
                            )
                        }
                    }
                }
                item { HorizontalDivider() }

                when {
                    commentsState.isLoading -> {
                        item {
                            Box(
                                modifier = Modifier.fillMaxWidth().padding(32.dp),
                                contentAlignment = Alignment.Center,
                            ) {
                                CircularProgressIndicator()
                            }
                        }
                    }
                    commentsState.comments.isEmpty() -> {
                        item {
                            Text(
                                text = localizedError(commentsState.error) ?: stringResource(R.string.comments_empty),
                                color = if (commentsState.error != null) {
                                    MaterialTheme.colorScheme.error
                                } else {
                                    MaterialTheme.colorScheme.onSurfaceVariant
                                },
                                modifier = Modifier.padding(24.dp),
                            )
                        }
                    }
                    else -> {
                        items(commentsState.comments, key = { it.id }) { comment ->
                            CommentThread(
                                comment = comment,
                                depth = 0,
                                ownUserId = commentsState.ownUserId,
                                onLikeClick = { commentsViewModel.toggleLike(it) },
                                onRepostClick = { commentsViewModel.toggleRepost(it) },
                                onBookmarkClick = { commentsViewModel.toggleBookmark(it) },
                                onReplyClick = { id, username -> commentsViewModel.startReply(id, username) },
                                onShareClick = { shareComment(it) },
                                onEditClick = { id ->
                                    editingCommentId = id
                                    editError = null
                                },
                                onDeleteClick = { id -> deletingCommentId = id },
                                onAuthorClick = onAuthorClick,
                                onHashtagClick = onOpenHashtag,
                                targetCommentId = targetCommentId,
                            )
                            HorizontalDivider()
                        }
                    }
                }
            }
        }

        if (commentsState.error != null && commentsState.comments.isNotEmpty()) {
            Text(
                text = localizedError(commentsState.error) ?: "",
                color = MaterialTheme.colorScheme.error,
                style = MaterialTheme.typography.bodySmall,
                modifier = Modifier.padding(horizontal = 12.dp, vertical = 4.dp),
            )
        }

        val replyingToUsername = commentsState.replyingToUsername
        if (replyingToUsername != null) {
            Row(
                modifier = Modifier
                    .fillMaxWidth()
                    .padding(horizontal = 12.dp, vertical = 4.dp),
                verticalAlignment = Alignment.CenterVertically,
            ) {
                Text(
                    text = stringResource(R.string.comment_replying_to, replyingToUsername),
                    style = MaterialTheme.typography.bodySmall,
                    color = MaterialTheme.colorScheme.onSurfaceVariant,
                    modifier = Modifier.weight(1f),
                )
                IconButton(onClick = { commentsViewModel.cancelReply() }, modifier = Modifier.size(TouchTarget.min)) {
                    Icon(
                        Icons.Filled.Close,
                        contentDescription = stringResource(R.string.comment_cancel_reply_cd),
                        modifier = Modifier.size(IconSize.sm),
                    )
                }
            }
        }

        Row(
            modifier = Modifier
                .fillMaxWidth()
                .padding(8.dp),
            verticalAlignment = Alignment.CenterVertically,
        ) {
            OutlinedTextField(
                value = commentsState.draft,
                onValueChange = { commentsViewModel.onDraftChange(it) },
                placeholder = {
                    Text(
                        if (replyingToUsername != null) {
                            stringResource(R.string.comment_reply_to_placeholder, replyingToUsername)
                        } else {
                            stringResource(R.string.comment_write_placeholder)
                        },
                    )
                },
                enabled = !commentsState.isPosting,
                modifier = Modifier.weight(1f),
            )

            Spacer(modifier = Modifier.width(8.dp))

            IconButton(
                onClick = { commentsViewModel.submit() },
                enabled = commentsState.draft.isNotBlank() && !commentsState.isPosting,
            ) {
                if (commentsState.isPosting) {
                    CircularProgressIndicator(modifier = Modifier.size(20.dp), strokeWidth = 2.dp)
                } else {
                    Icon(Icons.Filled.Send, contentDescription = stringResource(R.string.comment_post_cd), tint = ZrpRed)
                }
            }
        }
    }

    val editCommentId = editingCommentId
    val editCommentContent = commentsState.comments.findInTree(editCommentId)?.content
    if (editCommentId != null && editCommentContent != null) {
        EditPostDialog(
            initialContent = editCommentContent,
            isSubmitting = isSubmittingEdit,
            error = editError,
            title = stringResource(R.string.comment_edit_cd),
            onDismiss = { editingCommentId = null },
            onSubmit = { content ->
                isSubmittingEdit = true
                commentsViewModel.editComment(editCommentId, content) { result ->
                    isSubmittingEdit = false
                    result
                        .onSuccess { editingCommentId = null }
                        .onFailure { editError = it.message }
                }
            },
        )
    }

    val deleteCommentId = deletingCommentId
    if (deleteCommentId != null) {
        AlertDialog(
            onDismissRequest = { if (!isDeletingComment) deletingCommentId = null },
            title = { Text(stringResource(R.string.comment_delete_confirm_title)) },
            text = { Text(stringResource(R.string.comment_delete_confirm_body)) },
            confirmButton = {
                if (isDeletingComment) {
                    CircularProgressIndicator(modifier = Modifier.size(20.dp))
                } else {
                    TextButton(onClick = {
                        isDeletingComment = true
                        commentsViewModel.deleteComment(deleteCommentId) { result ->
                            isDeletingComment = false
                            deletingCommentId = null
                            result.onFailure { /* left visible; the row itself still shows the comment on failure */ }
                        }
                    }) {
                        Text(stringResource(R.string.action_delete), color = MaterialTheme.colorScheme.error)
                    }
                }
            },
            dismissButton = {
                TextButton(onClick = { deletingCommentId = null }, enabled = !isDeletingComment) {
                    Text(stringResource(R.string.action_cancel))
                }
            },
        )
    }
}

private fun List<Comment>.findInTree(id: String?): Comment? {
    if (id == null) return null
    for (comment in this) {
        if (comment.id == id) return comment
        comment.replies?.findInTree(id)?.let { return it }
    }
    return null
}
