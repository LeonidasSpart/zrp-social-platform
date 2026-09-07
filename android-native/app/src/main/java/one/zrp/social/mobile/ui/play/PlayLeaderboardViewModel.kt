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
import one.zrp.social.mobile.network.PlayLeaderboardEntry

data class PlayLeaderboardUiState(
    val isLoading: Boolean = true,
    val scope: String = "global",
    val entries: List<PlayLeaderboardEntry> = emptyList(),
    val myRank: Int? = null,
    val ownUserId: String? = null,
)

/** Leaderboard - ported from PlayLeaderboardPage.tsx: global/country/friends scope tabs against the real GET /play/leaderboard. */
class PlayLeaderboardViewModel(private val repository: PlayRepository) : ViewModel() {
    private val _state = MutableStateFlow(PlayLeaderboardUiState())
    val state: StateFlow<PlayLeaderboardUiState> = _state.asStateFlow()

    init {
        viewModelScope.launch {
            repository.getOwnUserId().onSuccess { id -> _state.update { it.copy(ownUserId = id) } }
        }
        load()
    }

    fun onScopeChange(scope: String) {
        if (scope == _state.value.scope) return
        _state.update { it.copy(scope = scope) }
        load()
    }

    private fun load() {
        _state.update { it.copy(isLoading = true) }
        viewModelScope.launch {
            repository.getLeaderboard(_state.value.scope)
                .onSuccess { response -> _state.update { it.copy(isLoading = false, entries = response.leaderboard, myRank = response.myRank) } }
                .onFailure { _state.update { it.copy(isLoading = false) } }
        }
    }
}

class PlayLeaderboardViewModelFactory(private val repository: PlayRepository) : ViewModelProvider.Factory {
    @Suppress("UNCHECKED_CAST")
    override fun <T : ViewModel> create(modelClass: Class<T>): T = PlayLeaderboardViewModel(repository) as T
}
