package one.zrp.social.mobile.ui.reposts

import androidx.lifecycle.ViewModel
import androidx.lifecycle.viewModelScope
import kotlinx.coroutines.flow.MutableStateFlow
import kotlinx.coroutines.flow.StateFlow
import kotlinx.coroutines.flow.asStateFlow
import kotlinx.coroutines.flow.update
import kotlinx.coroutines.launch
import one.zrp.social.mobile.data.PostsRepository
import one.zrp.social.mobile.network.FollowListUser

data class RepostsUiState(
    val users: List<FollowListUser> = emptyList(),
    val isLoading: Boolean = true,
    val isLoadingMore: Boolean = false,
    val nextCursor: String? = null,
    val endReached: Boolean = false,
    val error: String? = null,
)

/**
 * "Who reposted this post" - the same real GET /posts/{id}/reposts
 * endpoint the website's own reposts page uses
 * (src/app/post/[id]/reposts/page.tsx). Read-only: unlike Followers/
 * Following, that page shows a passive "Following" label when
 * isFollowing is true, never a follow/unfollow button, so this
 * ViewModel doesn't expose a toggle either.
 */
class RepostsViewModel(private val repository: PostsRepository, private val postId: String) : ViewModel() {
    private val _state = MutableStateFlow(RepostsUiState())
    val state: StateFlow<RepostsUiState> = _state.asStateFlow()

    init {
        refresh()
    }

    fun refresh() {
        _state.update { it.copy(isLoading = true, error = null) }
        viewModelScope.launch {
            repository.getReposts(postId, cursor = null)
                .onSuccess { page ->
                    _state.update {
                        it.copy(
                            users = page.items,
                            nextCursor = page.nextCursor,
                            isLoading = false,
                            endReached = page.nextCursor == null,
                        )
                    }
                }
                .onFailure { error ->
                    _state.update { it.copy(isLoading = false, error = error.message ?: "Couldn't load reposts.") }
                }
        }
    }

    fun loadMore() {
        val current = _state.value
        if (current.isLoadingMore || current.endReached || current.nextCursor == null) return

        _state.update { it.copy(isLoadingMore = true) }
        viewModelScope.launch {
            repository.getReposts(postId, current.nextCursor)
                .onSuccess { page ->
                    _state.update {
                        it.copy(
                            users = it.users + page.items,
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
}
