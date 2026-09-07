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
import one.zrp.social.mobile.network.PlayDuelDetail

data class PlayDuelDetailUiState(
    val isLoading: Boolean = true,
    val notFound: Boolean = false,
    val duel: PlayDuelDetail? = null,
    val ownUserId: String? = null,
)

/** A single duel - ported from PlayDuelDetailPage.tsx. */
class PlayDuelDetailViewModel(
    private val duelId: String,
    private val repository: PlayRepository,
) : ViewModel() {
    private val _state = MutableStateFlow(PlayDuelDetailUiState())
    val state: StateFlow<PlayDuelDetailUiState> = _state.asStateFlow()

    init {
        viewModelScope.launch {
            repository.getOwnUserId().onSuccess { id -> _state.update { it.copy(ownUserId = id) } }
        }
        load()
    }

    private fun load() {
        _state.update { it.copy(isLoading = true, notFound = false) }
        viewModelScope.launch {
            repository.getDuel(duelId)
                .onSuccess { duel -> _state.update { it.copy(isLoading = false, duel = duel) } }
                .onFailure { _state.update { it.copy(isLoading = false, notFound = true) } }
        }
    }
}

class PlayDuelDetailViewModelFactory(
    private val duelId: String,
    private val repository: PlayRepository,
) : ViewModelProvider.Factory {
    @Suppress("UNCHECKED_CAST")
    override fun <T : ViewModel> create(modelClass: Class<T>): T = PlayDuelDetailViewModel(duelId, repository) as T
}
