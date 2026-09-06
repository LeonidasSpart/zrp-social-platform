package one.zrp.social.mobile.ui.hashtag

import androidx.lifecycle.ViewModel
import androidx.lifecycle.viewModelScope
import kotlinx.coroutines.flow.MutableStateFlow
import kotlinx.coroutines.flow.StateFlow
import kotlinx.coroutines.flow.asStateFlow
import kotlinx.coroutines.flow.update
import kotlinx.coroutines.launch
import one.zrp.social.mobile.data.PostsRepository
import one.zrp.social.mobile.network.Post

data class HashtagUiState(
    val posts: List<Post> = emptyList(),
    val isLoading: Boolean = true,
    val error: String? = null,
    val ownUserId: String? = null,
)

/**
 * Drives a single #hashtag feed - GET /posts/hashtag/{tag}, the same
 * endpoint the website's own /hashtag/{tag} page uses. That route
 * takes a flat 50 with no cursor, so unlike Home/Bookmarks/Search this
 * has no loadMore - matching the real backend rather than inventing
 * pagination it doesn't support.
 */
class HashtagViewModel(private val repository: PostsRepository, private val tag: String) : ViewModel() {
    private val _state = MutableStateFlow(HashtagUiState())
    val state: StateFlow<HashtagUiState> = _state.asStateFlow()

    init {
        refresh()
        viewModelScope.launch {
            repository.getOwnUserId().onSuccess { id -> _state.update { it.copy(ownUserId = id) } }
        }
    }

    fun refresh() {
        _state.update { it.copy(isLoading = true, error = null) }
        viewModelScope.launch {
            repository.getHashtagPosts(tag)
                .onSuccess { posts -> _state.update { it.copy(posts = posts, isLoading = false) } }
                .onFailure { error -> _state.update { it.copy(isLoading = false, error = error.message ?: "Couldn't load these posts.") } }
        }
    }

    fun toggleLike(postId: String) {
        val previousPosts = _state.value.posts
        _state.update { state ->
            state.copy(posts = state.posts.map { post -> if (post.id == postId) applyOptimisticLike(post) else post })
        }
        viewModelScope.launch {
            repository.toggleLike(postId).onFailure {
                _state.update { it.copy(posts = previousPosts) }
            }
        }
    }

    fun toggleRepost(postId: String) {
        val previousPosts = _state.value.posts
        _state.update { state ->
            state.copy(posts = state.posts.map { post -> if (post.id == postId) applyOptimisticRepost(post) else post })
        }
        viewModelScope.launch {
            repository.toggleRepost(postId).onFailure {
                _state.update { it.copy(posts = previousPosts) }
            }
        }
    }

    fun toggleBookmark(postId: String) {
        val previousPosts = _state.value.posts
        _state.update { state ->
            state.copy(posts = state.posts.map { post -> if (post.id == postId) post.copy(bookmarked = post.bookmarked != true) else post })
        }
        viewModelScope.launch {
            repository.toggleBookmark(postId).onFailure {
                _state.update { it.copy(posts = previousPosts) }
            }
        }
    }

    fun deletePost(postId: String, onResult: (Result<Unit>) -> Unit) {
        viewModelScope.launch {
            val result = repository.deletePost(postId)
            result.onSuccess {
                _state.update { it.copy(posts = it.posts.filterNot { post -> post.id == postId }) }
            }
            onResult(result)
        }
    }

    fun reportPost(postId: String, reason: String, details: String?, onResult: (Result<Unit>) -> Unit) {
        viewModelScope.launch {
            onResult(repository.reportPost(postId, reason, details))
        }
    }

    fun editPost(postId: String, content: String, onResult: (Result<Unit>) -> Unit) {
        viewModelScope.launch {
            repository.updatePost(postId, content)
                .onSuccess {
                    _state.update { it.copy(posts = it.posts.map { post -> if (post.id == postId) post.copy(content = content) else post }) }
                    onResult(Result.success(Unit))
                }
                .onFailure { onResult(Result.failure(it)) }
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
}
