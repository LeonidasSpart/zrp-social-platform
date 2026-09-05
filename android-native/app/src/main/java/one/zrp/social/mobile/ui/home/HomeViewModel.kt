package one.zrp.social.mobile.ui.home

import androidx.lifecycle.ViewModel
import androidx.lifecycle.viewModelScope
import kotlinx.coroutines.flow.MutableStateFlow
import kotlinx.coroutines.flow.StateFlow
import kotlinx.coroutines.flow.asStateFlow
import kotlinx.coroutines.flow.update
import kotlinx.coroutines.launch
import one.zrp.social.mobile.data.PostsRepository
import one.zrp.social.mobile.network.Post
import one.zrp.social.mobile.network.PostsPage

enum class FeedTab { FOR_YOU, FOLLOWING }

data class HomeUiState(
    val posts: List<Post> = emptyList(),
    val isRefreshing: Boolean = false,
    val isLoadingMore: Boolean = false,
    val nextCursor: String? = null,
    val endReached: Boolean = false,
    val error: String? = null,
)

/**
 * Drives the Home screen's two real feed tabs (For You / Following).
 * Each tab keeps its own posts/cursor in its own StateFlow so
 * switching tabs and back doesn't re-fetch from scratch, matching how
 * the website's own tabs behave.
 */
class HomeViewModel(private val repository: PostsRepository) : ViewModel() {
    private val _forYou = MutableStateFlow(HomeUiState())
    private val _following = MutableStateFlow(HomeUiState())

    private val _activeTab = MutableStateFlow(FeedTab.FOR_YOU)
    val activeTab: StateFlow<FeedTab> = _activeTab.asStateFlow()

    val forYouState: StateFlow<HomeUiState> = _forYou.asStateFlow()
    val followingState: StateFlow<HomeUiState> = _following.asStateFlow()

    init {
        refresh(FeedTab.FOR_YOU)
    }

    fun selectTab(tab: FeedTab) {
        _activeTab.value = tab
        val state = stateFlowFor(tab).value
        if (state.posts.isEmpty() && !state.isRefreshing) {
            refresh(tab)
        }
    }

    fun refresh(tab: FeedTab = _activeTab.value) {
        val stateFlow = stateFlowFor(tab)
        stateFlow.update { it.copy(isRefreshing = true, error = null) }
        viewModelScope.launch {
            fetch(tab, cursor = null)
                .onSuccess { page -> applyFreshPage(stateFlow, page) }
                .onFailure { error ->
                    stateFlow.update {
                        it.copy(isRefreshing = false, error = error.message ?: "Couldn't load posts.")
                    }
                }
        }
    }

    fun loadMore(tab: FeedTab = _activeTab.value) {
        val stateFlow = stateFlowFor(tab)
        val current = stateFlow.value
        if (current.isLoadingMore || current.endReached || current.nextCursor == null) return

        stateFlow.update { it.copy(isLoadingMore = true) }
        viewModelScope.launch {
            fetch(tab, cursor = current.nextCursor)
                .onSuccess { page -> applyAppendedPage(stateFlow, page) }
                .onFailure { error ->
                    stateFlow.update {
                        it.copy(isLoadingMore = false, error = error.message ?: "Couldn't load more posts.")
                    }
                }
        }
    }

    fun toggleLike(tab: FeedTab, postId: String) {
        val stateFlow = stateFlowFor(tab)
        val previousPosts = stateFlow.value.posts

        // Optimistic update, same as the website's own post cards - the
        // like endpoint is a plain toggle, so a failed request just
        // rolls the flag/count back rather than needing a full refetch.
        stateFlow.update { state ->
            state.copy(posts = state.posts.map { post -> if (post.id == postId) applyOptimisticLike(post) else post })
        }

        viewModelScope.launch {
            repository.toggleLike(postId).onFailure {
                stateFlow.update { it.copy(posts = previousPosts) }
            }
        }
    }

    private fun applyFreshPage(stateFlow: MutableStateFlow<HomeUiState>, page: PostsPage) {
        stateFlow.update {
            it.copy(
                posts = page.posts,
                nextCursor = page.nextCursor,
                isRefreshing = false,
                endReached = page.nextCursor == null,
            )
        }
    }

    private fun applyAppendedPage(stateFlow: MutableStateFlow<HomeUiState>, page: PostsPage) {
        stateFlow.update {
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

    private suspend fun fetch(tab: FeedTab, cursor: String?) = when (tab) {
        FeedTab.FOR_YOU -> repository.getForYouFeed(cursor)
        FeedTab.FOLLOWING -> repository.getFollowingFeed(cursor)
    }

    private fun stateFlowFor(tab: FeedTab): MutableStateFlow<HomeUiState> = when (tab) {
        FeedTab.FOR_YOU -> _forYou
        FeedTab.FOLLOWING -> _following
    }
}
