package one.zrp.social.mobile.ui.search

import androidx.lifecycle.ViewModel
import androidx.lifecycle.ViewModelProvider
import androidx.lifecycle.viewModelScope
import kotlinx.coroutines.flow.MutableStateFlow
import kotlinx.coroutines.flow.StateFlow
import kotlinx.coroutines.flow.asStateFlow
import kotlinx.coroutines.flow.update
import kotlinx.coroutines.launch
import one.zrp.social.mobile.data.ProfileRepository
import one.zrp.social.mobile.data.SearchRepository
import one.zrp.social.mobile.network.SearchUser

data class ExplorePeopleUiState(
    val users: List<SearchUser> = emptyList(),
    val isLoading: Boolean = true,
    // Once a row's follow completes, it just disables in place - matching
    // explore/people/page.tsx's own followingIds Set exactly (no unfollow
    // affordance on this screen, and the row is never removed).
    val followedIds: Set<String> = emptySet(),
    val requestedIds: Set<String> = emptySet(),
    val followLoadingId: String? = null,
)

/**
 * Backs the "Explore People" see-all screen - the real website's own
 * src/app/explore/people/page.tsx destination. Same GET
 * /users/suggested endpoint the Discover state's own compact list
 * already calls (limit=50 instead of the teaser's default 10), plus
 * the same real follow toggle every other follow button in this app
 * uses (POST /users/{username}/follow) - suggested users are already
 * guaranteed not-yet-followed server-side, so this only ever needs to
 * follow, never unfollow, from this screen.
 */
class ExplorePeopleViewModel(
    private val searchRepository: SearchRepository,
    private val profileRepository: ProfileRepository,
) : ViewModel() {
    private val _state = MutableStateFlow(ExplorePeopleUiState())
    val state: StateFlow<ExplorePeopleUiState> = _state.asStateFlow()

    init {
        viewModelScope.launch {
            searchRepository.getSuggestedUsers(limit = 50)
                .onSuccess { users -> _state.update { it.copy(isLoading = false, users = users) } }
                .onFailure { _state.update { it.copy(isLoading = false) } }
        }
    }

    fun follow(user: SearchUser) {
        val current = _state.value
        if (user.id in current.followedIds || user.id in current.requestedIds || current.followLoadingId != null) return

        _state.update { it.copy(followLoadingId = user.id) }
        viewModelScope.launch {
            profileRepository.toggleFollow(user.username)
                .onSuccess { result ->
                    _state.update {
                        it.copy(
                            followLoadingId = null,
                            followedIds = if (result.following) it.followedIds + user.id else it.followedIds,
                            requestedIds = if (result.requested) it.requestedIds + user.id else it.requestedIds,
                        )
                    }
                }
                .onFailure {
                    _state.update { it.copy(followLoadingId = null) }
                }
        }
    }
}

class ExplorePeopleViewModelFactory(
    private val searchRepository: SearchRepository,
    private val profileRepository: ProfileRepository,
) : ViewModelProvider.Factory {
    @Suppress("UNCHECKED_CAST")
    override fun <T : ViewModel> create(modelClass: Class<T>): T {
        return ExplorePeopleViewModel(searchRepository, profileRepository) as T
    }
}
