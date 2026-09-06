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
    val error: String? = null,
)

/**
 * Drives a single post's real comment thread - the same GET/POST
 * /posts/{id}/comments endpoints the website's post detail view uses.
 * Top-level comments only for composing (see CommentsScreen's KDoc on
 * why replies aren't composable yet); reading already shows full
 * nested reply threads exactly as the backend returns them.
 */
class CommentsViewModel(
    private val repository: CommentsRepository,
    private val postId: String,
) : ViewModel() {
    private val _state = MutableStateFlow(CommentsUiState())
    val state: StateFlow<CommentsUiState> = _state.asStateFlow()

    init {
        refresh()
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

    fun submit() {
        val content = _state.value.draft.trim()
        if (content.isEmpty() || _state.value.isPosting) return

        _state.update { it.copy(isPosting = true, error = null) }
        viewModelScope.launch {
            repository.createComment(postId, content)
                .onSuccess { comment ->
                    _state.update {
                        it.copy(
                            comments = it.comments + comment,
                            draft = "",
                            isPosting = false,
                        )
                    }
                }
                .onFailure { error ->
                    _state.update { it.copy(isPosting = false, error = error.message ?: "Couldn't post this comment.") }
                }
        }
    }
}
