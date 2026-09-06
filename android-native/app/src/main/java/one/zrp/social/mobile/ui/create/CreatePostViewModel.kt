package one.zrp.social.mobile.ui.create

import androidx.lifecycle.ViewModel
import androidx.lifecycle.viewModelScope
import kotlinx.coroutines.flow.MutableStateFlow
import kotlinx.coroutines.flow.StateFlow
import kotlinx.coroutines.flow.asStateFlow
import kotlinx.coroutines.flow.update
import kotlinx.coroutines.launch
import one.zrp.social.mobile.data.PostsRepository
import one.zrp.social.mobile.network.GifResult
import one.zrp.social.mobile.network.Post

data class CreatePostUiState(
    val content: String = "",
    val isPosting: Boolean = false,
    val error: String? = null,
    val posted: Boolean = false,
    val quotedPost: Post? = null,
    val isLoadingQuotedPost: Boolean = false,
    val selectedGif: GifResult? = null,
)

/**
 * Backs the Create tab's composer - a real POST /api/posts call. No
 * client-side reimplementation of the server's plan-based length/
 * image limits: a rejected post simply surfaces the server's own
 * error message.
 *
 * When [quotePostId] is set (reached via the repost menu's "Quote"
 * option, matching the website's QuotePostModal), the real post being
 * quoted is fetched via GET /posts/{id} to render its own preview
 * above the composer, and submit() attaches quotePostId to the create
 * call the same way QuotePostModal.tsx does.
 */
class CreatePostViewModel(
    private val repository: PostsRepository,
    private val quotePostId: String? = null,
) : ViewModel() {
    private val _state = MutableStateFlow(CreatePostUiState())
    val state: StateFlow<CreatePostUiState> = _state.asStateFlow()

    init {
        if (quotePostId != null) {
            _state.update { it.copy(isLoadingQuotedPost = true) }
            viewModelScope.launch {
                repository.getPost(quotePostId)
                    .onSuccess { post -> _state.update { it.copy(quotedPost = post, isLoadingQuotedPost = false) } }
                    .onFailure { error ->
                        _state.update {
                            it.copy(
                                isLoadingQuotedPost = false,
                                error = error.message ?: "Couldn't load the post you're quoting.",
                            )
                        }
                    }
            }
        }
    }

    fun onContentChange(content: String) {
        _state.update { it.copy(content = content, error = null) }
    }

    fun onGifSelected(gif: GifResult) {
        _state.update { it.copy(selectedGif = gif, error = null) }
    }

    fun onRemoveGif() {
        _state.update { it.copy(selectedGif = null) }
    }

    fun submit() {
        val content = _state.value.content.trim()
        val gif = _state.value.selectedGif
        // Matches PostComposer.tsx's own isSubmitDisabled: a post needs
        // real text OR real media (here, an attached GIF) - not
        // necessarily both, unlike this composer's previous
        // content-only requirement.
        if ((content.isEmpty() && gif == null) || _state.value.isPosting) return

        _state.update { it.copy(isPosting = true, error = null) }
        viewModelScope.launch {
            repository.createPost(content, quotePostId, gif?.url)
                .onSuccess {
                    _state.update { it.copy(isPosting = false, posted = true) }
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
