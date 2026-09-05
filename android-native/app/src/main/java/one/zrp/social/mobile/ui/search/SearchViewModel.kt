package one.zrp.social.mobile.ui.search

import androidx.lifecycle.ViewModel
import androidx.lifecycle.viewModelScope
import kotlinx.coroutines.Job
import kotlinx.coroutines.async
import kotlinx.coroutines.coroutineScope
import kotlinx.coroutines.delay
import kotlinx.coroutines.flow.MutableStateFlow
import kotlinx.coroutines.flow.StateFlow
import kotlinx.coroutines.flow.asStateFlow
import kotlinx.coroutines.flow.update
import kotlinx.coroutines.launch
import one.zrp.social.mobile.data.SearchRepository
import one.zrp.social.mobile.network.Post
import one.zrp.social.mobile.network.SearchUser
import one.zrp.social.mobile.network.TrendingHashtag

data class SearchUiState(
    val query: String = "",
    val isSearching: Boolean = false,
    val users: List<SearchUser> = emptyList(),
    val posts: List<Post> = emptyList(),
    val suggestedUsers: List<SearchUser> = emptyList(),
    val trendingHashtags: List<TrendingHashtag> = emptyList(),
    val isLoadingDiscover: Boolean = true,
    val error: String? = null,
)

/**
 * Backs the Search tab: the same real /search endpoint the website
 * uses for typed queries (debounced client-side so every keystroke
 * doesn't fire a request, matching the server's own 2-character
 * minimum), plus the suggested-users/trending-hashtags endpoints the
 * Home feed's own widgets already reuse for the pre-search "Discover"
 * state.
 */
class SearchViewModel(private val repository: SearchRepository) : ViewModel() {
    private val _state = MutableStateFlow(SearchUiState())
    val state: StateFlow<SearchUiState> = _state.asStateFlow()

    private var searchJob: Job? = null

    init {
        loadDiscover()
    }

    fun onQueryChange(query: String) {
        _state.update { it.copy(query = query) }

        searchJob?.cancel()
        val trimmed = query.trim()
        if (trimmed.length < 2) {
            _state.update { it.copy(isSearching = false, users = emptyList(), posts = emptyList(), error = null) }
            return
        }

        searchJob = viewModelScope.launch {
            delay(350)
            _state.update { it.copy(isSearching = true, error = null) }
            repository.search(trimmed)
                .onSuccess { results ->
                    _state.update {
                        it.copy(isSearching = false, users = results.users, posts = results.posts)
                    }
                }
                .onFailure { error ->
                    _state.update {
                        it.copy(isSearching = false, error = error.message ?: "Search failed.")
                    }
                }
        }
    }

    fun onHashtagClick(tag: String) {
        onQueryChange(tag)
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

    private fun applyOptimisticLike(post: Post): Post {
        val wasLiked = post.liked == true
        return post.copy(
            liked = !wasLiked,
            _count = post._count.copy(likes = post._count.likes + if (wasLiked) -1 else 1),
        )
    }

    private fun loadDiscover() {
        viewModelScope.launch {
            _state.update { it.copy(isLoadingDiscover = true) }
            coroutineScope {
                val suggestedDeferred = async { repository.getSuggestedUsers() }
                val trendingDeferred = async { repository.getTrendingHashtags() }
                val suggested = suggestedDeferred.await()
                val trending = trendingDeferred.await()

                _state.update {
                    it.copy(
                        isLoadingDiscover = false,
                        suggestedUsers = suggested.getOrDefault(emptyList()),
                        trendingHashtags = trending.getOrDefault(emptyList()),
                    )
                }
            }
        }
    }
}
