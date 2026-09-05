package one.zrp.social.mobile.ui.create

import androidx.lifecycle.ViewModel
import androidx.lifecycle.viewModelScope
import kotlinx.coroutines.flow.MutableStateFlow
import kotlinx.coroutines.flow.StateFlow
import kotlinx.coroutines.flow.asStateFlow
import kotlinx.coroutines.flow.update
import kotlinx.coroutines.launch
import one.zrp.social.mobile.data.PostsRepository

data class CreatePostUiState(
    val content: String = "",
    val isPosting: Boolean = false,
    val error: String? = null,
    val posted: Boolean = false,
)

/**
 * Backs the Create tab's composer - a real POST /api/posts call. No
 * client-side reimplementation of the server's plan-based length/
 * image limits: a rejected post simply surfaces the server's own
 * error message.
 */
class CreatePostViewModel(private val repository: PostsRepository) : ViewModel() {
    private val _state = MutableStateFlow(CreatePostUiState())
    val state: StateFlow<CreatePostUiState> = _state.asStateFlow()

    fun onContentChange(content: String) {
        _state.update { it.copy(content = content, error = null) }
    }

    fun submit() {
        val content = _state.value.content.trim()
        if (content.isEmpty() || _state.value.isPosting) return

        _state.update { it.copy(isPosting = true, error = null) }
        viewModelScope.launch {
            repository.createPost(content)
                .onSuccess {
                    _state.update { CreatePostUiState(posted = true) }
                }
                .onFailure { error ->
                    _state.update {
                        it.copy(isPosting = false, error = error.message ?: "Couldn't create this post. Please try again.")
                    }
                }
        }
    }

    fun consumePostedEvent() {
        _state.update { it.copy(posted = false) }
    }
}
