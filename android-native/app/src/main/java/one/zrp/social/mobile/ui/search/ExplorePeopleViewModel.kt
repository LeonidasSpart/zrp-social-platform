package one.zrp.social.mobile.ui.search

import androidx.lifecycle.ViewModel
import androidx.lifecycle.ViewModelProvider
import androidx.lifecycle.viewModelScope
import kotlinx.coroutines.flow.MutableStateFlow
import kotlinx.coroutines.flow.StateFlow
import kotlinx.coroutines.flow.asStateFlow
import kotlinx.coroutines.flow.update
import kotlinx.coroutines.launch
import one.zrp.social.mobile.data.DiscoverRepository
import one.zrp.social.mobile.data.ProfileRepository
import one.zrp.social.mobile.data.SearchRepository
import one.zrp.social.mobile.network.NearbyUser
import one.zrp.social.mobile.network.SearchUser

data class ExplorePeopleUiState(
    val users: List<SearchUser> = emptyList(),
    val isLoading: Boolean = true,
    // "People near you" (GET /api/discover/people) - a real, tested
    // backend capability that had no frontend consumer on any platform
    // before this. Country-based only (see NearbyUser's KDoc), fetched
    // and shown as its own section rather than merged into `users` -
    // the two lists come from different ranking rules (follower-count
    // leaderboard vs. same-country) and conflating them would misrepresent
    // why a given row is being suggested.
    val nearbyUsers: List<NearbyUser> = emptyList(),
    val isLoadingNearby: Boolean = true,
    // Set only when the server reports "unknown_viewer_country" - the
    // section is hidden rather than shown empty in that case, since
    // there is a real, actionable reason (no country on file) rather
    // than "nobody nearby right now."
    val nearbyUnknownCountry: Boolean = false,
    // Once a row's follow completes, it just disables in place - matching
    // explore/people/page.tsx's own followingIds Set exactly (no unfollow
    // affordance on this screen, and the row is never removed). Shared
    // across both the suggested and nearby lists since a row is keyed by
    // user id either way.
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
    private val discoverRepository: DiscoverRepository,
) : ViewModel() {
    private val _state = MutableStateFlow(ExplorePeopleUiState())
    val state: StateFlow<ExplorePeopleUiState> = _state.asStateFlow()

    init {
        // Independent requests - one failing (or a viewer with no known
        // country) must never blank the other section.
        viewModelScope.launch {
            searchRepository.getSuggestedUsers(limit = 50)
                .onSuccess { users -> _state.update { it.copy(isLoading = false, users = users) } }
                .onFailure { _state.update { it.copy(isLoading = false) } }
        }
        viewModelScope.launch {
            discoverRepository.getNearbyPeople(limit = 20)
                .onSuccess { page ->
                    _state.update {
                        it.copy(
                            isLoadingNearby = false,
                            nearbyUsers = page.users,
                            nearbyUnknownCountry = page.reason == "unknown_viewer_country",
                        )
                    }
                }
                .onFailure { _state.update { it.copy(isLoadingNearby = false) } }
        }
    }

    fun follow(userId: String, username: String) {
        val current = _state.value
        if (userId in current.followedIds || userId in current.requestedIds || current.followLoadingId != null) return

        _state.update { it.copy(followLoadingId = userId) }
        viewModelScope.launch {
            profileRepository.toggleFollow(username)
                .onSuccess { result ->
                    _state.update {
                        it.copy(
                            followLoadingId = null,
                            followedIds = if (result.following) it.followedIds + userId else it.followedIds,
                            requestedIds = if (result.requested) it.requestedIds + userId else it.requestedIds,
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
    private val discoverRepository: DiscoverRepository,
) : ViewModelProvider.Factory {
    @Suppress("UNCHECKED_CAST")
    override fun <T : ViewModel> create(modelClass: Class<T>): T {
        return ExplorePeopleViewModel(searchRepository, profileRepository, discoverRepository) as T
    }
}
