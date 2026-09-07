package one.zrp.social.mobile.ui.play

import androidx.lifecycle.ViewModel
import androidx.lifecycle.ViewModelProvider
import androidx.lifecycle.viewModelScope
import kotlinx.coroutines.flow.MutableStateFlow
import kotlinx.coroutines.flow.StateFlow
import kotlinx.coroutines.flow.asStateFlow
import kotlinx.coroutines.flow.update
import kotlinx.coroutines.launch
import one.zrp.social.mobile.data.PlayRepository
import one.zrp.social.mobile.network.PlayChallengeDetail
import one.zrp.social.mobile.network.PlayChallengeSummary
import one.zrp.social.mobile.network.PlayProfileStats

data class PlayUiState(
    val isLoading: Boolean = true,
    val dailyChallenge: PlayChallengeDetail? = null,
    val trending: List<PlayChallengeSummary> = emptyList(),
    val myProfile: PlayProfileStats? = null,
    val isSignedIn: Boolean = false,
)

/**
 * ZRP PLAY home - ported from PlayHomePage.tsx: the daily challenge
 * slot and the trending-challenges grid, both against the real GET
 * /play/home round trip. The pending/active duel sections, leaderboard
 * snippet, and Create Challenge/My Duels/Leaderboard entry points
 * aren't shown yet - those screens are later native phases, same
 * staging every other feature epic in this app used for its own
 * phase 1.
 */
class PlayViewModel(private val repository: PlayRepository) : ViewModel() {
    private val _state = MutableStateFlow(PlayUiState())
    val state: StateFlow<PlayUiState> = _state.asStateFlow()

    init {
        load()
    }

    private fun load() {
        _state.update { it.copy(isLoading = true) }
        viewModelScope.launch {
            val ownUserId = repository.getOwnUserId().getOrNull()
            repository.getHome()
                .onSuccess { home ->
                    _state.update {
                        it.copy(
                            isLoading = false,
                            dailyChallenge = home.dailyChallenge,
                            trending = home.trending,
                            myProfile = home.myProfile,
                            isSignedIn = ownUserId != null,
                        )
                    }
                }
                .onFailure { _state.update { it.copy(isLoading = false) } }
        }
    }
}

class PlayViewModelFactory(private val repository: PlayRepository) : ViewModelProvider.Factory {
    @Suppress("UNCHECKED_CAST")
    override fun <T : ViewModel> create(modelClass: Class<T>): T = PlayViewModel(repository) as T
}
