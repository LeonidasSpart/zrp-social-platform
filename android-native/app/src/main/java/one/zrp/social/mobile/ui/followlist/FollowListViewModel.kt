package one.zrp.social.mobile.ui.followlist

import androidx.lifecycle.ViewModel
import androidx.lifecycle.viewModelScope
import kotlinx.coroutines.flow.MutableStateFlow
import kotlinx.coroutines.flow.StateFlow
import kotlinx.coroutines.flow.asStateFlow
import kotlinx.coroutines.flow.update
import kotlinx.coroutines.launch
import one.zrp.social.mobile.data.ProfileRepository
import one.zrp.social.mobile.network.FollowListUser

enum class FollowListMode { FOLLOWERS, FOLLOWING }

data class FollowListUiState(
    val users: List<FollowListUser> = emptyList(),
    val isLoading: Boolean = true,
    val isLoadingMore: Boolean = false,
    val nextCursor: String? = null,
    val endReached: Boolean = false,
    val error: String? = null,
    val ownUserId: String? = null,
    val followTogglingId: String? = null,
)

/**
 * Drives both the Followers and Following screens - same real
 * GET /users/{username}/followers|following endpoints the website's
 * own pages use (src/app/profile/[username]/followers|following/
 * page.tsx), including that page's exact rule for hiding the follow
 * button on the viewer's own row (compares against the signed-in
 * user's id, not the list row's isFollowing flag).
 */
class FollowListViewModel(
    private val repository: ProfileRepository,
    private val username: String,
    private val mode: FollowListMode,
) : ViewModel() {
    private val _state = MutableStateFlow(FollowListUiState())
    val state: StateFlow<FollowListUiState> = _state.asStateFlow()

    init {
        viewModelScope.launch {
            repository.getOwnUserId().onSuccess { id -> _state.update { it.copy(ownUserId = id) } }
        }
        refresh()
    }

    private suspend fun fetchPage(cursor: String?) = when (mode) {
        FollowListMode.FOLLOWERS -> repository.getFollowers(username, cursor)
        FollowListMode.FOLLOWING -> repository.getFollowing(username, cursor)
    }

    fun refresh() {
        _state.update { it.copy(isLoading = true, error = null) }
        viewModelScope.launch {
            fetchPage(cursor = null)
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
                    _state.update { it.copy(isLoading = false, error = error.message ?: "Couldn't load this list.") }
                }
        }
    }

    fun loadMore() {
        val current = _state.value
        if (current.isLoadingMore || current.endReached || current.nextCursor == null) return

        _state.update { it.copy(isLoadingMore = true) }
        viewModelScope.launch {
            fetchPage(current.nextCursor)
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

    fun toggleFollow(targetUsername: String, targetUserId: String) {
        // Guards against a double-tap firing two overlapping toggles for
        // the same row (ProfileViewModel's own toggleFollow has the
        // identical isTogglingFollow guard, for the identical reason) -
        // without this, two in-flight requests can resolve out of order
        // and leave local state one flip behind whatever the server
        // actually recorded, surfacing as the relationship "reverting"
        // the next time this list is loaded fresh.
        if (_state.value.followTogglingId == targetUserId) return

        val previousUsers = _state.value.users
        _state.update { state ->
            state.copy(
                followTogglingId = targetUserId,
                users = state.users.map { user ->
                    if (user.id == targetUserId) user.copy(isFollowing = !user.isFollowing) else user
                },
            )
        }
        viewModelScope.launch {
            repository.toggleFollow(targetUsername)
                .onSuccess { result ->
                    // The server's `following` is authoritative, not the
                    // optimistic flip above - a private target resolves
                    // to a pending follow REQUEST rather than an actual
                    // follow (result.following stays false), which the
                    // blind flip this replaces got wrong every time.
                    _state.update { state ->
                        state.copy(
                            users = state.users.map { user ->
                                if (user.id == targetUserId) user.copy(isFollowing = result.following) else user
                            },
                        )
                    }
                }
                .onFailure { _state.update { it.copy(users = previousUsers) } }
            _state.update { it.copy(followTogglingId = null) }
        }
    }
}
