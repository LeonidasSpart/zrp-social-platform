package one.zrp.social.mobile.ui.quotes

import androidx.lifecycle.ViewModel
import androidx.lifecycle.viewModelScope
import kotlinx.coroutines.flow.MutableStateFlow
import kotlinx.coroutines.flow.StateFlow
import kotlinx.coroutines.flow.asStateFlow
import kotlinx.coroutines.flow.update
import kotlinx.coroutines.launch
import one.zrp.social.mobile.data.PostsRepository
import one.zrp.social.mobile.network.Post

data class QuotesUiState(
    val posts: List<Post> = emptyList(),
    val isLoading: Boolean = true,
    val isLoadingMore: Boolean = false,
    val nextCursor: String? = null,
    val endReached: Boolean = false,
    val error: String? = null,
    val ownUserId: String? = null,
)

/**
 * Real posts that quoted a given post - GET /posts/{id}/quotes, the
 * same endpoint the website's own quotes page uses
 * (src/app/post/[id]/quotes/page.tsx). Like/repost/bookmark/delete/
 * report/quote toggles here mirror HomeViewModel's own optimistic-
 * update pattern, duplicated rather than shared per this codebase's
 * established per-screen convention.
 */
class QuotesViewModel(private val repository: PostsRepository, private val postId: String) : ViewModel() {
    private val _state = MutableStateFlow(QuotesUiState())
    val state: StateFlow<QuotesUiState> = _state.asStateFlow()

    init {
        refresh()
        viewModelScope.launch {
            repository.getOwnUserId().onSuccess { id -> _state.update { it.copy(ownUserId = id) } }
        }
    }

    fun refresh() {
        _state.update { it.copy(isLoading = true, error = null) }
        viewModelScope.launch {
            repository.getQuotes(postId, cursor = null)
                .onSuccess { page ->
                    _state.update {
                        it.copy(
                            posts = page.posts,
                            nextCursor = page.nextCursor,
                            isLoading = false,
                            endReached = page.nextCursor == null,
                        )
                    }
                }
                .onFailure { error ->
                    _state.update { it.copy(isLoading = false, error = error.message ?: "Couldn't load quotes.") }
                }
        }
    }

    fun loadMore() {
        val current = _state.value
        if (current.isLoadingMore || current.endReached || current.nextCursor == null) return

        _state.update { it.copy(isLoadingMore = true) }
        viewModelScope.launch {
            repository.getQuotes(postId, current.nextCursor)
                .onSuccess { page ->
                    _state.update {
                        it.copy(
                            posts = it.posts + page.posts,
                            nextCursor = page.nextCursor,
                            isLoadingMore = false,
                            endReached = page.nextCursor == null,
                        )
                    }
                }
                .onFailure { error ->
                    _state.update { it.copy(isLoadingMore = false, error = error.message ?: "Couldn't load more.") }
                }
        }
    }

    fun toggleLike(quotePostId: String) {
        val previousPosts = _state.value.posts
        _state.update { state ->
            state.copy(posts = state.posts.map { post -> if (post.id == quotePostId) applyOptimisticLike(post) else post })
        }
        viewModelScope.launch {
            repository.toggleLike(quotePostId).onFailure {
                _state.update { it.copy(posts = previousPosts) }
            }
        }
    }

    fun toggleRepost(quotePostId: String) {
        val previousPosts = _state.value.posts
        _state.update { state ->
            state.copy(posts = state.posts.map { post -> if (post.id == quotePostId) applyOptimisticRepost(post) else post })
        }
        viewModelScope.launch {
            repository.toggleRepost(quotePostId).onFailure {
                _state.update { it.copy(posts = previousPosts) }
            }
        }
    }

    fun toggleBookmark(quotePostId: String) {
        val previousPosts = _state.value.posts
        _state.update { state ->
            state.copy(posts = state.posts.map { post -> if (post.id == quotePostId) applyOptimisticBookmark(post) else post })
        }
        viewModelScope.launch {
            repository.toggleBookmark(quotePostId).onFailure {
                _state.update { it.copy(posts = previousPosts) }
            }
        }
    }

    fun deletePost(quotePostId: String, onResult: (Result<Unit>) -> Unit) {
        viewModelScope.launch {
            val result = repository.deletePost(quotePostId)
            result.onSuccess {
                _state.update { it.copy(posts = it.posts.filterNot { post -> post.id == quotePostId }) }
            }
            onResult(result)
        }
    }

    // Applies the submitted content locally (post.copy) rather than
    // replacing with the server's returned object - PUT /posts/{id}
    // never carries a liked/reposted/bookmarked flag, so swapping in
    // that object wholesale would reset those already-known flags.
    fun editPost(quotePostId: String, content: String, onResult: (Result<Unit>) -> Unit) {
        viewModelScope.launch {
            repository.updatePost(quotePostId, content)
                .onSuccess {
                    _state.update {
                        it.copy(posts = it.posts.map { post -> if (post.id == quotePostId) post.copy(content = content) else post })
                    }
                    onResult(Result.success(Unit))
                }
                .onFailure { onResult(Result.failure(it)) }
        }
    }

    fun reportPost(quotePostId: String, reason: String, details: String?, onResult: (Result<Unit>) -> Unit) {
        viewModelScope.launch {
            onResult(repository.reportPost(quotePostId, reason, details))
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
