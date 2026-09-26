package one.zrp.social.mobile.ui.comments

import android.content.Intent
import androidx.compose.animation.animateColorAsState
import androidx.compose.animation.core.tween
import androidx.compose.foundation.ExperimentalFoundationApi
import androidx.compose.foundation.background
import androidx.compose.foundation.clickable
import androidx.compose.foundation.relocation.BringIntoViewRequester
import androidx.compose.foundation.relocation.bringIntoViewRequester
import androidx.compose.ui.semantics.Role
import androidx.compose.foundation.layout.Box
import androidx.compose.foundation.layout.Column
import androidx.compose.foundation.layout.Row
import androidx.compose.foundation.layout.Spacer
import androidx.compose.foundation.layout.fillMaxSize
import androidx.compose.foundation.layout.fillMaxWidth
import androidx.compose.foundation.layout.imePadding
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
import androidx.compose.runtime.LaunchedEffect
import androidx.compose.runtime.collectAsState
import androidx.compose.runtime.getValue
import androidx.compose.runtime.mutableStateOf
import androidx.compose.runtime.remember
import androidx.compose.runtime.setValue
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.graphics.Color
import androidx.compose.ui.platform.LocalContext
import androidx.compose.ui.res.stringResource
import androidx.compose.ui.text.style.TextOverflow
import androidx.compose.ui.unit.dp
import androidx.lifecycle.viewmodel.compose.viewModel
import kotlinx.coroutines.delay
import one.zrp.social.mobile.R
import one.zrp.social.mobile.data.CommentsRepository
import one.zrp.social.mobile.network.Comment
import one.zrp.social.mobile.ui.components.Avatar
import one.zrp.social.mobile.ui.components.EditPostDialog
import one.zrp.social.mobile.ui.components.LinkifiedText
import one.zrp.social.mobile.ui.components.VerifiedBadge
import one.zrp.social.mobile.ui.theme.IconSize
import one.zrp.social.mobile.ui.theme.Spacing
import one.zrp.social.mobile.ui.theme.TouchTarget
import one.zrp.social.mobile.ui.theme.ZrpGreen
import one.zrp.social.mobile.ui.theme.ZrpRed
import one.zrp.social.mobile.util.formatRelativeTime
import one.zrp.social.mobile.util.localizedError

/**
 * A single post's real comment thread - the same GET/POST
 * /posts/{id}/comments endpoints the website's post detail view uses,
 * full nested reply trees included, plus the same real per-comment
 * like/repost/bookmark/edit/delete/reply actions CommentItem.tsx
 * exposes, at any nesting depth.
 */
@Composable
fun CommentsScreen(
    postId: String,
    onBack: () -> Unit,
    onAuthorClick: (String) -> Unit = {},
    onOpenHashtag: (String) -> Unit = {},
) {
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

    // MainActivity opts into enableEdgeToEdge(), so AndroidManifest.xml's
    // windowSoftInputMode="adjustResize" alone doesn't reserve space for
    // the IME here - Compose draws behind it unless a real inset modifier
    // asks for the space back. Without this, the keyboard covered the
    // comment composer row (and whatever the user was typing into it)
    // rather than pushing it into view - see ConversationScreen.kt's own
    // imePadding() for the same fix on the equivalent DM composer.
    Column(modifier = Modifier.fillMaxSize().imePadding()) {
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
                text = stringResource(R.string.comments_title),
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
                            text = localizedError(state.error) ?: stringResource(R.string.comments_empty),
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
                                onAuthorClick = onAuthorClick,
                                onHashtagClick = onOpenHashtag,
                            )
                            HorizontalDivider()
                        }
                    }
                }
            }
        }

        if (state.error != null && state.comments.isNotEmpty()) {
            Text(
                text = localizedError(state.error) ?: "",
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
                    text = stringResource(R.string.comment_replying_to, replyingToUsername),
                    style = MaterialTheme.typography.bodySmall,
                    color = MaterialTheme.colorScheme.onSurfaceVariant,
                    modifier = Modifier.weight(1f),
                )
                IconButton(onClick = { viewModel.cancelReply() }, modifier = Modifier.size(TouchTarget.min)) {
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
                value = state.draft,
                onValueChange = { viewModel.onDraftChange(it) },
                placeholder = {
                    Text(
                        if (replyingToUsername != null) {
                            stringResource(R.string.comment_reply_to_placeholder, replyingToUsername)
                        } else {
                            stringResource(R.string.comment_write_placeholder)
                        },
                    )
                },
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
                    Icon(Icons.Filled.Send, contentDescription = stringResource(R.string.comment_post_cd), tint = ZrpRed)
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
            title = stringResource(R.string.comment_edit_cd),
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
        // Native uses a proper dialog here rather than a browser
        // confirm() popup (CommentItem.tsx's own equivalent, which by
        // nature can't be styled or translated) - same real confirm
        // step, translated properly since there's nothing web-side to
        // literally match here.
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
                        viewModel.deleteComment(deleteCommentId) { result ->
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

// Internal, not private: reused as-is by PostDetailScreen (same
// per-comment like/repost/bookmark/edit/delete/reply rendering, just
// composed under a post header instead of this screen's own bare
// comments-only Column) - see PostDetailScreen.kt.
//
// targetCommentId: the exact comment a notification/deep link pointed
// at (see PostDetailScreen's own targetCommentId param). Threaded
// through every recursive call so it reaches a reply at any depth, not
// just a top-level comment - replies render as nested Columns inside
// this same composable (see the recursive call below), never as their
// own separate LazyColumn item, so a plain LazyListState.scrollToItem
// could never have reached one anyway. BringIntoViewRequester instead
// asks the enclosing LazyColumn to scroll this exact row into view
// regardless of how deep it's nested, which is what actually works here.
@OptIn(ExperimentalFoundationApi::class)
@Composable
internal fun CommentThread(
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
    onAuthorClick: (String) -> Unit,
    onHashtagClick: (String) -> Unit,
    targetCommentId: String? = null,
) {
    Column(modifier = Modifier.padding(start = (depth * 24).dp)) {
        if (targetCommentId != null && targetCommentId == comment.id) {
            val bringIntoViewRequester = remember { BringIntoViewRequester() }
            var highlighted by remember { mutableStateOf(true) }
            val highlightColor by animateColorAsState(
                targetValue = if (highlighted) ZrpRed.copy(alpha = 0.12f) else Color.Transparent,
                animationSpec = tween(durationMillis = 500),
                label = "commentHighlight",
            )
            LaunchedEffect(comment.id) {
                bringIntoViewRequester.bringIntoView()
                delay(2000)
                highlighted = false
            }
            Box(
                modifier = Modifier
                    .bringIntoViewRequester(bringIntoViewRequester)
                    .background(highlightColor),
            ) {
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
                    onAuthorClick = { onAuthorClick(comment.author.username) },
                    onMentionClick = onAuthorClick,
                    onHashtagClick = onHashtagClick,
                )
            }
        } else {
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
                onAuthorClick = { onAuthorClick(comment.author.username) },
                onMentionClick = onAuthorClick,
                onHashtagClick = onHashtagClick,
            )
        }
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
                onAuthorClick = onAuthorClick,
                onHashtagClick = onHashtagClick,
                targetCommentId = targetCommentId,
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
    onAuthorClick: () -> Unit,
    onMentionClick: (String) -> Unit,
    onHashtagClick: (String) -> Unit,
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
            modifier = Modifier.clickable(onClick = onAuthorClick, role = Role.Button),
        )

        Spacer(modifier = Modifier.width(10.dp))

        Column(modifier = Modifier.weight(1f)) {
            Row(
                verticalAlignment = Alignment.CenterVertically,
                modifier = Modifier.clickable(onClick = onAuthorClick, role = Role.Button),
            ) {
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
            LinkifiedText(
                text = comment.content,
                style = MaterialTheme.typography.bodyMedium,
                onMentionClick = onMentionClick,
                onHashtagClick = onHashtagClick,
                modifier = Modifier.padding(top = 2.dp),
            )

            Row(
                verticalAlignment = Alignment.CenterVertically,
                modifier = Modifier.padding(top = Spacing.xs),
            ) {
                CommentStat(
                    icon = if (comment.liked == true) Icons.Filled.Favorite else Icons.Filled.FavoriteBorder,
                    count = comment._count.likes,
                    contentDescription = stringResource(if (comment.liked == true) R.string.action_unlike else R.string.action_like),
                    tint = if (comment.liked == true) ZrpRed else MaterialTheme.colorScheme.onSurfaceVariant,
                    onClick = onLikeClick,
                )
                CommentStat(
                    icon = Icons.Filled.ChatBubbleOutline,
                    count = 0,
                    contentDescription = stringResource(R.string.action_reply),
                    tint = MaterialTheme.colorScheme.onSurfaceVariant,
                    onClick = onReplyClick,
                )
                CommentStat(
                    icon = Icons.Filled.Repeat,
                    count = comment._count.reposts,
                    contentDescription = stringResource(if (comment.reposted == true) R.string.comment_undo_repost_cd else R.string.comment_repost_cd),
                    tint = if (comment.reposted == true) ZrpGreen else MaterialTheme.colorScheme.onSurfaceVariant,
                    onClick = onRepostClick,
                )
                CommentStat(
                    icon = if (comment.bookmarked == true) Icons.Filled.Bookmark else Icons.Filled.BookmarkBorder,
                    count = comment._count.bookmarks,
                    contentDescription = stringResource(if (comment.bookmarked == true) R.string.action_remove_bookmark else R.string.action_bookmark),
                    tint = if (comment.bookmarked == true) ZrpRed else MaterialTheme.colorScheme.onSurfaceVariant,
                    onClick = onBookmarkClick,
                )
                IconButton(onClick = onShareClick, modifier = Modifier.size(TouchTarget.min)) {
                    Icon(
                        imageVector = Icons.Filled.Share,
                        contentDescription = stringResource(R.string.action_share),
                        tint = MaterialTheme.colorScheme.onSurfaceVariant,
                        modifier = Modifier.size(IconSize.sm),
                    )
                }
                if (isOwnComment) {
                    IconButton(onClick = onEditClick, modifier = Modifier.size(TouchTarget.min)) {
                        Icon(
                            imageVector = Icons.Filled.Edit,
                            contentDescription = stringResource(R.string.comment_edit_cd),
                            tint = MaterialTheme.colorScheme.onSurfaceVariant,
                            modifier = Modifier.size(IconSize.sm),
                        )
                    }
                    IconButton(onClick = onDeleteClick, modifier = Modifier.size(TouchTarget.min)) {
                        Icon(
                            imageVector = Icons.Filled.DeleteOutline,
                            contentDescription = stringResource(R.string.comment_delete_cd),
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
