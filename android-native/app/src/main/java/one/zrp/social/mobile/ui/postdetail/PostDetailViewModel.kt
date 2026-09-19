package one.zrp.social.mobile.ui.postdetail

import androidx.lifecycle.ViewModel
import androidx.lifecycle.viewModelScope
import kotlinx.coroutines.flow.MutableStateFlow
import kotlinx.coroutines.flow.StateFlow
import kotlinx.coroutines.flow.asStateFlow
import kotlinx.coroutines.flow.update
import kotlinx.coroutines.launch
import one.zrp.social.mobile.data.PostsRepository
import one.zrp.social.mobile.network.Post

data class PostDetailUiState(
    val post: Post? = null,
    val isLoading: Boolean = true,
    val error: String? = null,
)

/**
 * Loads the single post itself (GET /posts/{id}, the same endpoint the
 * website's own post detail page uses) plus its real like/repost/
 * bookmark toggles - the piece CommentsScreen never fetched, since it
 * only ever rendered the comment thread. Comment loading/posting stays
 * owned by CommentsViewModel (PostDetailScreen runs one of each side by
 * side); this ViewModel only knows about the post.
 */
class PostDetailViewModel(
    private val repository: PostsRepository,
    private val postId: String,
) : ViewModel() {
    private val _state = MutableStateFlow(PostDetailUiState())
    val state: StateFlow<PostDetailUiState> = _state.asStateFlow()

    init {
        refresh()
    }

    fun refresh() {
        viewModelScope.launch {
            _state.update { it.copy(isLoading = true, error = null) }
            repository.getPost(postId)
                .onSuccess { post -> _state.update { it.copy(post = post, isLoading = false) } }
                .onFailure { error ->
                    _state.update { it.copy(isLoading = false, error = error.message ?: "Couldn't load this post.") }
                }
        }
    }

    // Same optimistic-toggle-with-rollback shape every other feed
    // ViewModel in this app already uses for these three endpoints
    // (HomeViewModel, ProfileViewModel, etc.) - the like/repost/
    // bookmark endpoints are plain toggles, so a failed request just
    // rolls the flag/count back rather than needing a full refetch.
    fun toggleLike() {
        val previous = _state.value.post ?: return
        _state.update { it.copy(post = applyOptimisticLike(previous)) }
        viewModelScope.launch {
            repository.toggleLike(postId).onFailure { _state.update { it.copy(post = previous) } }
        }
    }

    fun toggleRepost() {
        val previous = _state.value.post ?: return
        _state.update { it.copy(post = applyOptimisticRepost(previous)) }
        viewModelScope.launch {
            repository.toggleRepost(postId).onFailure { _state.update { it.copy(post = previous) } }
        }
    }

    fun toggleBookmark() {
        val previous = _state.value.post ?: return
        _state.update { it.copy(post = applyOptimisticBookmark(previous)) }
        viewModelScope.launch {
            repository.toggleBookmark(postId).onFailure { _state.update { it.copy(post = previous) } }
        }
    }

    private fun applyOptimisticLike(post: Post): Post {
        val wasLiked = post.liked == true
        return post.copy(
            liked = !wasLiked,
            _count = post._count.copy(likes = post._count.likes + if (wasLiked) -1 else 1),
        )
    }

    private fun applyOptimisticRepost(post: Post): Post {
        val wasReposted = post.reposted == true
        return post.copy(
            reposted = !wasReposted,
            _count = post._count.copy(reposts = post._count.reposts + if (wasReposted) -1 else 1),
        )
    }

    private fun applyOptimisticBookmark(post: Post): Post {
        return post.copy(bookmarked = post.bookmarked != true)
    }
}
