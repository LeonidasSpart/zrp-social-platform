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
import one.zrp.social.mobile.network.PlayDuelSummary

data class PlayDuelsUiState(
    val isLoading: Boolean = true,
    val duels: List<PlayDuelSummary> = emptyList(),
    val ownUserId: String? = null,
    val busyDuelId: String? = null,
)

/** My Duels - ported from PlayDuelsPage.tsx: incoming/active/history sections from the real GET /play/duels. */
class PlayDuelsViewModel(private val repository: PlayRepository) : ViewModel() {
    private val _state = MutableStateFlow(PlayDuelsUiState())
    val state: StateFlow<PlayDuelsUiState> = _state.asStateFlow()

    init {
        load()
        viewModelScope.launch {
            repository.getOwnUserId().onSuccess { id -> _state.update { it.copy(ownUserId = id) } }
        }
    }

    private fun load() {
        _state.update { it.copy(isLoading = true) }
        viewModelScope.launch {
            repository.getDuels()
                .onSuccess { page -> _state.update { it.copy(isLoading = false, duels = page.duels) } }
                .onFailure { _state.update { it.copy(isLoading = false) } }
        }
    }

    fun respond(duelId: String, accept: Boolean) {
        _state.update { it.copy(busyDuelId = duelId) }
        viewModelScope.launch {
            repository.respondToDuel(duelId, accept)
            _state.update { it.copy(busyDuelId = null) }
            load()
        }
    }
}

class PlayDuelsViewModelFactory(private val repository: PlayRepository) : ViewModelProvider.Factory {
    @Suppress("UNCHECKED_CAST")
    override fun <T : ViewModel> create(modelClass: Class<T>): T = PlayDuelsViewModel(repository) as T
}
