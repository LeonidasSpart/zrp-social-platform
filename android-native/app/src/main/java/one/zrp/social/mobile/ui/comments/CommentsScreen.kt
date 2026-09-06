package one.zrp.social.mobile.ui.comments

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
import androidx.compose.material.icons.filled.Bookmark
import androidx.compose.material.icons.filled.BookmarkBorder
import androidx.compose.material.icons.filled.ChatBubbleOutline
import androidx.compose.material.icons.filled.Close
import androidx.compose.material.icons.filled.DeleteOutline
import androidx.compose.material.icons.filled.Edit
import androidx.compose.material.icons.filled.Favorite
import androidx.compose.material.icons.filled.FavoriteBorder
import androidx.compose.material.icons.filled.Repeat
import androidx.compose.material.icons.filled.Send
import androidx.compose.material.icons.filled.Share
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
import androidx.compose.ui.unit.dp
import androidx.lifecycle.viewmodel.compose.viewModel
import one.zrp.social.mobile.data.CommentsRepository
import one.zrp.social.mobile.network.Comment
import one.zrp.social.mobile.ui.components.Avatar
import one.zrp.social.mobile.ui.components.EditPostDialog
import one.zrp.social.mobile.ui.components.VerifiedBadge
import one.zrp.social.mobile.ui.theme.IconSize
import one.zrp.social.mobile.ui.theme.Spacing
import one.zrp.social.mobile.ui.theme.TouchTarget
import one.zrp.social.mobile.ui.theme.ZrpBlue
import one.zrp.social.mobile.ui.theme.ZrpGreen
import one.zrp.social.mobile.ui.theme.ZrpRed
import one.zrp.social.mobile.util.formatRelativeTime

/**
 * A single post's real comment thread - the same GET/POST
 * /posts/{id}/comments endpoints the website's post detail view uses,
 * full nested reply trees included, plus the same real per-comment
 * like/repost/bookmark/edit/delete/reply actions CommentItem.tsx
 * exposes, at any nesting depth.
 */
@Composable
fun CommentsScreen(postId: String, onBack: () -> Unit) {
    val viewModel: CommentsViewModel = viewModel(
        factory = remember(postId) { CommentsViewModelFactory(CommentsRepository(), postId) },
    )
    val state by viewModel.state.collectAsState()
    val context = LocalContext.current

    var editingCommentId by remember { mutableStateOf<String?>(null) }
    var isSubmittingEdit by remember { mutableStateOf(false) }
    var editError by remember { mutableStateOf<String?>(null) }
    var deletingCommentId by remember { mutableStateOf<String?>(null) }
    var isDeletingComment by remember { mutableStateOf(false) }

    fun shareComment(comment: Comment) {
        val url = "https://zrp.one/post/$postId?comment=${comment.id}"
        val intent = Intent(Intent.ACTION_SEND).apply {
            type = "text/plain"
            putExtra(Intent.EXTRA_TEXT, url)
        }
        context.startActivity(Intent.createChooser(intent, "Share comment"))
    }

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
                text = "Comments",
                style = MaterialTheme.typography.titleMedium,
                modifier = Modifier.padding(start = 4.dp),
            )
        }
        HorizontalDivider()

        Box(modifier = Modifier.weight(1f).fillMaxWidth()) {
            when {
                state.isLoading -> {
                    Box(modifier = Modifier.fillMaxSize(), contentAlignment = Alignment.Center) {
                        CircularProgressIndicator()
                    }
                }
                state.comments.isEmpty() -> {
                    Box(modifier = Modifier.fillMaxSize(), contentAlignment = Alignment.Center) {
                        Text(
                            text = state.error ?: "No comments yet. Be the first to reply.",
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
                    LazyColumn(modifier = Modifier.fillMaxSize()) {
                        items(state.comments, key = { it.id }) { comment ->
                            CommentThread(
                                comment = comment,
                                depth = 0,
                                ownUserId = state.ownUserId,
                                onLikeClick = { viewModel.toggleLike(it) },
                                onRepostClick = { viewModel.toggleRepost(it) },
                                onBookmarkClick = { viewModel.toggleBookmark(it) },
                                onReplyClick = { id, username -> viewModel.startReply(id, username) },
                                onShareClick = { shareComment(it) },
                                onEditClick = { id ->
                                    editingCommentId = id
                                    editError = null
                                },
                                onDeleteClick = { id -> deletingCommentId = id },
                            )
                            HorizontalDivider()
                        }
                    }
                }
            }
        }

        if (state.error != null && state.comments.isNotEmpty()) {
            Text(
                text = state.error ?: "",
                color = MaterialTheme.colorScheme.error,
                style = MaterialTheme.typography.bodySmall,
                modifier = Modifier.padding(horizontal = 12.dp, vertical = 4.dp),
            )
        }

        val replyingToUsername = state.replyingToUsername
        if (replyingToUsername != null) {
            Row(
                modifier = Modifier
                    .fillMaxWidth()
                    .padding(horizontal = 12.dp, vertical = 4.dp),
                verticalAlignment = Alignment.CenterVertically,
            ) {
                Text(
                    text = "Replying to @$replyingToUsername",
                    style = MaterialTheme.typography.bodySmall,
                    color = MaterialTheme.colorScheme.onSurfaceVariant,
                    modifier = Modifier.weight(1f),
                )
                IconButton(onClick = { viewModel.cancelReply() }, modifier = Modifier.size(TouchTarget.min)) {
                    Icon(Icons.Filled.Close, contentDescription = "Cancel reply", modifier = Modifier.size(IconSize.sm))
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
                value = state.draft,
                onValueChange = { viewModel.onDraftChange(it) },
                placeholder = { Text(if (replyingToUsername != null) "Reply to @$replyingToUsername" else "Add a comment") },
                enabled = !state.isPosting,
                modifier = Modifier.weight(1f),
            )

            Spacer(modifier = Modifier.width(8.dp))

            IconButton(
                onClick = { viewModel.submit() },
                enabled = state.draft.isNotBlank() && !state.isPosting,
            ) {
                if (state.isPosting) {
                    CircularProgressIndicator(modifier = Modifier.size(20.dp), strokeWidth = 2.dp)
                } else {
                    Icon(Icons.Filled.Send, contentDescription = "Post comment", tint = ZrpRed)
                }
            }
        }
    }

    val editCommentId = editingCommentId
    val editCommentContent = state.comments.findInTree(editCommentId)?.content
    if (editCommentId != null && editCommentContent != null) {
        EditPostDialog(
            initialContent = editCommentContent,
            isSubmitting = isSubmittingEdit,
            error = editError,
            title = "Edit comment",
            onDismiss = { editingCommentId = null },
            onSubmit = { content ->
                isSubmittingEdit = true
                viewModel.editComment(editCommentId, content) { result ->
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
            title = { Text("Delete comment?") },
            text = { Text("This can't be undone. Any replies to it will be deleted too.") },
            confirmButton = {
                if (isDeletingComment) {
                    CircularProgressIndicator(modifier = Modifier.size(20.dp))
                } else {
                    TextButton(onClick = {
                        isDeletingComment = true
                        viewModel.deleteComment(deleteCommentId) { result ->
                            isDeletingComment = false
                            deletingCommentId = null
                            result.onFailure { /* left visible; the row itself still shows the comment on failure */ }
                        }
                    }) {
                        Text("Delete", color = MaterialTheme.colorScheme.error)
                    }
                }
            },
            dismissButton = {
                TextButton(onClick = { deletingCommentId = null }, enabled = !isDeletingComment) {
                    Text("Cancel")
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

@Composable
private fun CommentThread(
    comment: Comment,
    depth: Int,
    ownUserId: String?,
    onLikeClick: (String) -> Unit,
    onRepostClick: (String) -> Unit,
    onBookmarkClick: (String) -> Unit,
    onReplyClick: (id: String, username: String) -> Unit,
    onShareClick: (Comment) -> Unit,
    onEditClick: (String) -> Unit,
    onDeleteClick: (String) -> Unit,
) {
    Column(modifier = Modifier.padding(start = (depth * 24).dp)) {
        CommentRow(
            comment = comment,
            isOwnComment = ownUserId != null && comment.author.id == ownUserId,
            onLikeClick = { onLikeClick(comment.id) },
            onRepostClick = { onRepostClick(comment.id) },
            onBookmarkClick = { onBookmarkClick(comment.id) },
            onReplyClick = { onReplyClick(comment.id, comment.author.username) },
            onShareClick = { onShareClick(comment) },
            onEditClick = { onEditClick(comment.id) },
            onDeleteClick = { onDeleteClick(comment.id) },
        )
        comment.replies?.forEach { reply ->
            CommentThread(
                comment = reply,
                depth = depth + 1,
                ownUserId = ownUserId,
                onLikeClick = onLikeClick,
                onRepostClick = onRepostClick,
                onBookmarkClick = onBookmarkClick,
                onReplyClick = onReplyClick,
                onShareClick = onShareClick,
                onEditClick = onEditClick,
                onDeleteClick = onDeleteClick,
            )
        }
    }
}

@Composable
private fun CommentRow(
    comment: Comment,
    isOwnComment: Boolean,
    onLikeClick: () -> Unit,
    onRepostClick: () -> Unit,
    onBookmarkClick: () -> Unit,
    onReplyClick: () -> Unit,
    onShareClick: () -> Unit,
    onEditClick: () -> Unit,
    onDeleteClick: () -> Unit,
) {
    Row(
        modifier = Modifier
            .fillMaxWidth()
            .padding(horizontal = 16.dp, vertical = 10.dp),
        verticalAlignment = Alignment.Top,
    ) {
        Avatar(
            url = comment.author.avatarUrl,
            name = comment.author.name ?: comment.author.username,
            size = 36.dp,
        )

        Spacer(modifier = Modifier.width(10.dp))

        Column(modifier = Modifier.weight(1f)) {
            Row(verticalAlignment = Alignment.CenterVertically) {
                Text(
                    text = comment.author.name ?: comment.author.username,
                    style = MaterialTheme.typography.titleSmall,
                )
                VerifiedBadge(badgeType = comment.author.badgeType, modifier = Modifier.padding(start = 3.dp))
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

            Row(
                verticalAlignment = Alignment.CenterVertically,
                modifier = Modifier.padding(top = Spacing.xs),
            ) {
                CommentStat(
                    icon = if (comment.liked == true) Icons.Filled.Favorite else Icons.Filled.FavoriteBorder,
                    count = comment._count.likes,
                    contentDescription = if (comment.liked == true) "Unlike" else "Like",
                    tint = if (comment.liked == true) ZrpRed else MaterialTheme.colorScheme.onSurfaceVariant,
                    onClick = onLikeClick,
                )
                CommentStat(
                    icon = Icons.Filled.ChatBubbleOutline,
                    count = 0,
                    contentDescription = "Reply",
                    tint = MaterialTheme.colorScheme.onSurfaceVariant,
                    onClick = onReplyClick,
                )
                CommentStat(
                    icon = Icons.Filled.Repeat,
                    count = comment._count.reposts,
                    contentDescription = if (comment.reposted == true) "Undo repost" else "Repost",
                    tint = if (comment.reposted == true) ZrpGreen else MaterialTheme.colorScheme.onSurfaceVariant,
                    onClick = onRepostClick,
                )
                CommentStat(
                    icon = if (comment.bookmarked == true) Icons.Filled.Bookmark else Icons.Filled.BookmarkBorder,
                    count = comment._count.bookmarks,
                    contentDescription = if (comment.bookmarked == true) "Remove bookmark" else "Bookmark",
                    tint = if (comment.bookmarked == true) ZrpBlue else MaterialTheme.colorScheme.onSurfaceVariant,
                    onClick = onBookmarkClick,
                )
                IconButton(onClick = onShareClick, modifier = Modifier.size(TouchTarget.min)) {
                    Icon(
                        imageVector = Icons.Filled.Share,
                        contentDescription = "Share",
                        tint = MaterialTheme.colorScheme.onSurfaceVariant,
                        modifier = Modifier.size(IconSize.sm),
                    )
                }
                if (isOwnComment) {
                    IconButton(onClick = onEditClick, modifier = Modifier.size(TouchTarget.min)) {
                        Icon(
                            imageVector = Icons.Filled.Edit,
                            contentDescription = "Edit comment",
                            tint = MaterialTheme.colorScheme.onSurfaceVariant,
                            modifier = Modifier.size(IconSize.sm),
                        )
                    }
                    IconButton(onClick = onDeleteClick, modifier = Modifier.size(TouchTarget.min)) {
                        Icon(
                            imageVector = Icons.Filled.DeleteOutline,
                            contentDescription = "Delete comment",
                            tint = MaterialTheme.colorScheme.onSurfaceVariant,
                            modifier = Modifier.size(IconSize.sm),
                        )
                    }
                }
            }
        }
    }
}

// No count shown when zero, matching the website's own CommentItem
// (`{likesCount > 0 && <span>{likesCount}</span>}`) - a bare icon
// otherwise, not a "0".
@Composable
private fun CommentStat(
    icon: androidx.compose.ui.graphics.vector.ImageVector,
    count: Int,
    contentDescription: String,
    tint: androidx.compose.ui.graphics.Color,
    onClick: () -> Unit,
) {
    Row(verticalAlignment = Alignment.CenterVertically) {
        IconButton(onClick = onClick, modifier = Modifier.size(TouchTarget.min)) {
            Icon(
                imageVector = icon,
                contentDescription = contentDescription,
                tint = tint,
                modifier = Modifier.size(IconSize.sm),
            )
        }
        if (count > 0) {
            Text(
                text = count.toString(),
                style = MaterialTheme.typography.bodySmall,
                color = tint,
            )
        }
    }
}
