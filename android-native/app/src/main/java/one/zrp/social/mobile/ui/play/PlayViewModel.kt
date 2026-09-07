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
import one.zrp.social.mobile.network.PlayDuelSummary
import one.zrp.social.mobile.network.PlayProfileStats

data class PlayUiState(
    val isLoading: Boolean = true,
    val dailyChallenge: PlayChallengeDetail? = null,
    val trending: List<PlayChallengeSummary> = emptyList(),
    val myProfile: PlayProfileStats? = null,
    val isSignedIn: Boolean = false,
    val ownUserId: String? = null,
    val pendingDuels: List<PlayDuelSummary> = emptyList(),
    val activeDuels: List<PlayDuelSummary> = emptyList(),
    val busyDuelId: String? = null,
)

/**
 * ZRP PLAY home - ported from PlayHomePage.tsx: the daily challenge
 * slot, the trending-challenges grid, and incoming/active duel
 * sections, all against the real GET /play/home round trip. The
 * leaderboard snippet and Create Challenge/My Duels/Leaderboard entry
 * points aren't shown yet - those screens are later native phases,
 * same staging every other feature epic in this app used for its own
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
                            ownUserId = ownUserId,
                            pendingDuels = home.pendingDuels,
                            activeDuels = home.activeDuels,
                        )
                    }
                }
                .onFailure { _state.update { it.copy(isLoading = false) } }
        }
    }

    fun respondToDuel(duelId: String, accept: Boolean) {
        _state.update { it.copy(busyDuelId = duelId) }
        viewModelScope.launch {
            repository.respondToDuel(duelId, accept)
            _state.update { it.copy(busyDuelId = null) }
            load()
        }
    }
}

class PlayViewModelFactory(private val repository: PlayRepository) : ViewModelProvider.Factory {
    @Suppress("UNCHECKED_CAST")
    override fun <T : ViewModel> create(modelClass: Class<T>): T = PlayViewModel(repository) as T
}
