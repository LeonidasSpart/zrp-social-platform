package one.zrp.social.mobile.ui.comments

import androidx.lifecycle.ViewModel
import androidx.lifecycle.viewModelScope
import kotlinx.coroutines.flow.MutableStateFlow
import kotlinx.coroutines.flow.StateFlow
import kotlinx.coroutines.flow.asStateFlow
import kotlinx.coroutines.flow.update
import kotlinx.coroutines.launch
import one.zrp.social.mobile.data.CommentsRepository
import one.zrp.social.mobile.network.Comment

data class CommentsUiState(
    val comments: List<Comment> = emptyList(),
    val isLoading: Boolean = true,
    val draft: String = "",
    val isPosting: Boolean = false,
    val replyingToId: String? = null,
    val replyingToUsername: String? = null,
    val ownUserId: String? = null,
    val error: String? = null,
)

/**
 * Drives a single post's real comment thread - the same GET/POST
 * /posts/{id}/comments endpoints the website's post detail view uses,
 * plus the same real per-comment like/repost/bookmark/edit/delete/reply
 * actions CommentItem.tsx exposes, at any nesting depth.
 */
class CommentsViewModel(
    private val repository: CommentsRepository,
    private val postId: String,
) : ViewModel() {
    private val _state = MutableStateFlow(CommentsUiState())
    val state: StateFlow<CommentsUiState> = _state.asStateFlow()

    init {
        refresh()
        viewModelScope.launch {
            repository.getOwnUserId().onSuccess { id -> _state.update { it.copy(ownUserId = id) } }
        }
    }

    fun refresh() {
        viewModelScope.launch {
            _state.update { it.copy(isLoading = true, error = null) }
            repository.getComments(postId)
                .onSuccess { comments -> _state.update { it.copy(comments = comments, isLoading = false) } }
                .onFailure { error ->
                    _state.update { it.copy(isLoading = false, error = error.message ?: "Couldn't load comments.") }
                }
        }
    }

    fun onDraftChange(value: String) {
        _state.update { it.copy(draft = value) }
    }

    fun startReply(commentId: String, username: String) {
        _state.update { it.copy(replyingToId = commentId, replyingToUsername = username) }
    }

    fun cancelReply() {
        _state.update { it.copy(replyingToId = null, replyingToUsername = null) }
    }

    fun submit() {
        val content = _state.value.draft.trim()
        if (content.isEmpty() || _state.value.isPosting) return
        val parentId = _state.value.replyingToId

        _state.update { it.copy(isPosting = true, error = null) }
        viewModelScope.launch {
            repository.createComment(postId, content, parentId)
                .onSuccess { comment ->
                    _state.update {
                        it.copy(
                            comments = if (parentId != null) it.comments.addReplyTo(parentId, comment) else it.comments + comment,
                            draft = "",
                            isPosting = false,
                            replyingToId = null,
                            replyingToUsername = null,
                        )
                    }
                }
                .onFailure { error ->
                    _state.update { it.copy(isPosting = false, error = error.message ?: "Couldn't post this comment.") }
                }
        }
    }

    fun toggleLike(commentId: String) {
        val previous = _state.value.comments
        _state.update { it.copy(comments = it.comments.updateCommentTree(commentId, ::applyOptimisticLike)) }
        viewModelScope.launch {
            repository.toggleLike(commentId).onFailure {
                _state.update { it.copy(comments = previous) }
            }
        }
    }

    fun toggleRepost(commentId: String) {
        val previous = _state.value.comments
        _state.update { it.copy(comments = it.comments.updateCommentTree(commentId, ::applyOptimisticRepost)) }
        viewModelScope.launch {
            repository.toggleRepost(commentId).onFailure {
                _state.update { it.copy(comments = previous) }
            }
        }
    }

    fun toggleBookmark(commentId: String) {
        val previous = _state.value.comments
        _state.update { it.copy(comments = it.comments.updateCommentTree(commentId, ::applyOptimisticBookmark)) }
        viewModelScope.launch {
            repository.toggleBookmark(commentId).onFailure {
                _state.update { it.copy(comments = previous) }
            }
        }
    }

    // Applies the submitted content locally rather than replacing with
    // the server's returned object - PUT /comments/{id} never carries a
    // liked/reposted/bookmarked flag (same asymmetry as PUT /posts/{id}),
    // so swapping in that object wholesale would reset those already-
    // known flags on this comment.
    fun editComment(commentId: String, content: String, onResult: (Result<Unit>) -> Unit) {
        viewModelScope.launch {
            repository.updateComment(commentId, content)
                .onSuccess {
                    _state.update { it.copy(comments = it.comments.updateCommentTree(commentId) { c -> c.copy(content = content) }) }
                    onResult(Result.success(Unit))
                }
                .onFailure { onResult(Result.failure(it)) }
        }
    }

    fun deleteComment(commentId: String, onResult: (Result<Unit>) -> Unit) {
        viewModelScope.launch {
            repository.deleteComment(commentId)
                .onSuccess {
                    _state.update { it.copy(comments = it.comments.removeCommentTree(commentId)) }
                    onResult(Result.success(Unit))
                }
                .onFailure { onResult(Result.failure(it)) }
        }
    }

    private fun applyOptimisticLike(comment: Comment): Comment {
        val wasLiked = comment.liked == true
        return comment.copy(
            liked = !wasLiked,
            _count = comment._count.copy(likes = comment._count.likes + if (wasLiked) -1 else 1),
        )
    }

    private fun applyOptimisticRepost(comment: Comment): Comment {
        val wasReposted = comment.reposted == true
        return comment.copy(
            reposted = !wasReposted,
            _count = comment._count.copy(reposts = comment._count.reposts + if (wasReposted) -1 else 1),
        )
    }

    private fun applyOptimisticBookmark(comment: Comment): Comment {
        val wasBookmarked = comment.bookmarked == true
        return comment.copy(
            bookmarked = !wasBookmarked,
            _count = comment._count.copy(bookmarks = comment._count.bookmarks + if (wasBookmarked) -1 else 1),
        )
    }
}

// Comment threads nest to unlimited depth (self-relation, cascade
// delete) - these three walk the whole tree rather than assuming a
// fixed one-level reply structure, since the backend itself doesn't
// cap depth either.
private fun List<Comment>.updateCommentTree(id: String, transform: (Comment) -> Comment): List<Comment> {
    return map { comment ->
        if (comment.id == id) transform(comment)
        else comment.copy(replies = comment.replies?.updateCommentTree(id, transform))
    }
}

private fun List<Comment>.removeCommentTree(id: String): List<Comment> {
    return filterNot { it.id == id }.map { comment -> comment.copy(replies = comment.replies?.removeCommentTree(id)) }
}

private fun List<Comment>.addReplyTo(parentId: String, reply: Comment): List<Comment> {
    return map { comment ->
        if (comment.id == parentId) {
            comment.copy(replies = (comment.replies ?: emptyList()) + reply)
        } else {
            comment.copy(replies = comment.replies?.addReplyTo(parentId, reply))
        }
    }
}
