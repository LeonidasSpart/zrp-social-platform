package one.zrp.social.mobile.ui.shorts

import androidx.lifecycle.ViewModel
import androidx.lifecycle.ViewModelProvider
import androidx.lifecycle.viewModelScope
import kotlinx.coroutines.flow.MutableStateFlow
import kotlinx.coroutines.flow.StateFlow
import kotlinx.coroutines.flow.asStateFlow
import kotlinx.coroutines.flow.update
import kotlinx.coroutines.launch
import one.zrp.social.mobile.data.PostsRepository
import one.zrp.social.mobile.network.Post
import one.zrp.social.mobile.network.PostsPage

data class ShortsUiState(
    val isLoading: Boolean = true,
    val posts: List<Post> = emptyList(),
    val nextCursor: String? = null,
    val endReached: Boolean = false,
    val isLoadingMore: Boolean = false,
    val currentIndex: Int = 0,
    val muted: Boolean = true,
)

/**
 * ZRP Shorts - ported from shorts/page.tsx: the real vertical video
 * feed against GET /api/videos (filtered video posts, same Post shape
 * and cursor pagination as every other feed), with the same real
 * like/repost/comment interaction model PostCard already uses
 * elsewhere. Uploading a Short is a later phase, the same staged-
 * deferral every other feature epic this app used for its own phase 1.
 */
class ShortsViewModel(private val repository: PostsRepository) : ViewModel() {
    private val _state = MutableStateFlow(ShortsUiState())
    val state: StateFlow<ShortsUiState> = _state.asStateFlow()

    init {
        load()
    }

    private fun load() {
        _state.update { it.copy(isLoading = true) }
        viewModelScope.launch {
            repository.getVideos()
                .onSuccess { page -> applyFreshPage(page) }
                .onFailure { _state.update { it.copy(isLoading = false) } }
        }
    }

    fun loadMore() {
        val s = _state.value
        val cursor = s.nextCursor ?: return
        if (s.isLoadingMore || s.endReached) return
        _state.update { it.copy(isLoadingMore = true) }
        viewModelScope.launch {
            repository.getVideos(cursor = cursor)
                .onSuccess { page -> applyAppendedPage(page) }
                .onFailure { _state.update { it.copy(isLoadingMore = false) } }
        }
    }

    fun setCurrentIndex(index: Int) {
        _state.update { it.copy(currentIndex = index) }
        if (index >= _state.value.posts.size - 3) loadMore()
    }

    fun toggleMuted() = _state.update { it.copy(muted = !it.muted) }

    fun toggleLike(postId: String) {
        val previousPosts = _state.value.posts
        _state.update { s -> s.copy(posts = s.posts.map { if (it.id == postId) applyOptimisticLike(it) else it }) }
        viewModelScope.launch {
            repository.toggleLike(postId).onFailure {
                _state.update { it.copy(posts = previousPosts) }
            }
        }
    }

    fun toggleRepost(postId: String) {
        val previousPosts = _state.value.posts
        _state.update { s -> s.copy(posts = s.posts.map { if (it.id == postId) applyOptimisticRepost(it) else it }) }
        viewModelScope.launch {
            repository.toggleRepost(postId).onFailure {
                _state.update { it.copy(posts = previousPosts) }
            }
        }
    }

    private fun applyFreshPage(page: PostsPage) {
        _state.update {
            it.copy(
                isLoading = false,
                posts = page.posts,
                nextCursor = page.nextCursor,
                endReached = page.nextCursor == null,
            )
        }
    }

    private fun applyAppendedPage(page: PostsPage) {
        _state.update {
            it.copy(
                posts = it.posts + page.posts,
                nextCursor = page.nextCursor,
                isLoadingMore = false,
                endReached = page.nextCursor == null,
            )
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

class ShortsViewModelFactory(private val repository: PostsRepository) : ViewModelProvider.Factory {
    @Suppress("UNCHECKED_CAST")
    override fun <T : ViewModel> create(modelClass: Class<T>): T = ShortsViewModel(repository) as T
}
