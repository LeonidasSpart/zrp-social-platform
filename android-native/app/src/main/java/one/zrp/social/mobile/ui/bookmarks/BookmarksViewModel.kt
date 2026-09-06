package one.zrp.social.mobile.ui.bookmarks

import androidx.lifecycle.ViewModel
import androidx.lifecycle.viewModelScope
import kotlinx.coroutines.flow.MutableStateFlow
import kotlinx.coroutines.flow.StateFlow
import kotlinx.coroutines.flow.asStateFlow
import kotlinx.coroutines.flow.update
import kotlinx.coroutines.launch
import one.zrp.social.mobile.data.BookmarksRepository
import one.zrp.social.mobile.network.Post

data class BookmarksUiState(
    val posts: List<Post> = emptyList(),
    val isLoading: Boolean = true,
    val isLoadingMore: Boolean = false,
    val nextCursor: String? = null,
    val endReached: Boolean = false,
    val error: String? = null,
    val ownUserId: String? = null,
)

/**
 * Drives the Bookmarks screen - real saved posts from the same
 * GET /bookmarks endpoint the website's Bookmarks page uses. Like/
 * repost/bookmark toggles here mirror HomeViewModel's exact optimistic-
 * update pattern, duplicated rather than shared per this codebase's
 * established per-screen convention.
 */
class BookmarksViewModel(private val repository: BookmarksRepository) : ViewModel() {
    private val _state = MutableStateFlow(BookmarksUiState())
    val state: StateFlow<BookmarksUiState> = _state.asStateFlow()

    init {
        refresh()
        viewModelScope.launch {
            repository.getOwnUserId().onSuccess { id -> _state.update { it.copy(ownUserId = id) } }
        }
    }

    fun refresh() {
        _state.update { it.copy(isLoading = true, error = null) }
        viewModelScope.launch {
            repository.getBookmarkedPosts(cursor = null)
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
                    _state.update { it.copy(isLoading = false, error = error.message ?: "Couldn't load bookmarks.") }
                }
        }
    }

    fun loadMore() {
        val current = _state.value
        if (current.isLoadingMore || current.endReached || current.nextCursor == null) return

        _state.update { it.copy(isLoadingMore = true) }
        viewModelScope.launch {
            repository.getBookmarkedPosts(current.nextCursor)
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

    // Unbookmarking here removes the post from view immediately, same
    // as the website's Bookmarks page - there's nothing left to keep
    // showing once a post's own bookmark is what put it on this screen.
    fun toggleBookmark(postId: String) {
        val previousPosts = _state.value.posts
        _state.update { it.copy(posts = it.posts.filterNot { post -> post.id == postId }) }

        viewModelScope.launch {
            repository.toggleBookmark(postId).onFailure {
                _state.update { it.copy(posts = previousPosts) }
            }
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

    // A deleted post disappears from the list the moment the server
    // confirms it, matching HomeViewModel/SearchViewModel/
    // ProfileViewModel's own deletePost - no optimistic removal, since
    // there's nothing sensible to roll back to on failure.
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
