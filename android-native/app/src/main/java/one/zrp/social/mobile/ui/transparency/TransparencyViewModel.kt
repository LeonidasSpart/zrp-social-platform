package one.zrp.social.mobile.ui.transparency

import androidx.lifecycle.ViewModel
import androidx.lifecycle.ViewModelProvider
import androidx.lifecycle.viewModelScope
import kotlinx.coroutines.flow.MutableStateFlow
import kotlinx.coroutines.flow.StateFlow
import kotlinx.coroutines.flow.asStateFlow
import kotlinx.coroutines.flow.update
import kotlinx.coroutines.launch
import one.zrp.social.mobile.data.TransparencyRepository
import one.zrp.social.mobile.network.ModerationTransparencyResponse

data class TransparencyUiState(
    val isLoading: Boolean = true,
    val data: ModerationTransparencyResponse? = null,
    val error: Boolean = false,
)

/**
 * Live data backing TransparencyScreen - ported from
 * src/app/transparency/page.tsx. See TransparencyApi's own KDoc for
 * the full real contract (public, no auth, aggregate counts only).
 */
class TransparencyViewModel(private val repository: TransparencyRepository) : ViewModel() {
    private val _state = MutableStateFlow(TransparencyUiState())
    val state: StateFlow<TransparencyUiState> = _state.asStateFlow()

    init {
        load()
    }

    fun load() {
        _state.update { it.copy(isLoading = true, error = false) }
        viewModelScope.launch {
            repository.getModerationTransparency()
                .onSuccess { data -> _state.update { it.copy(isLoading = false, data = data) } }
                .onFailure { _state.update { it.copy(isLoading = false, error = true) } }
        }
    }
}

class TransparencyViewModelFactory(private val repository: TransparencyRepository) : ViewModelProvider.Factory {
    @Suppress("UNCHECKED_CAST")
    override fun <T : ViewModel> create(modelClass: Class<T>): T = TransparencyViewModel(repository) as T
}
