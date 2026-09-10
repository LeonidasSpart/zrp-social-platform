package one.zrp.social.mobile.ui.charity

import androidx.lifecycle.ViewModel
import androidx.lifecycle.ViewModelProvider
import androidx.lifecycle.viewModelScope
import kotlinx.coroutines.flow.MutableStateFlow
import kotlinx.coroutines.flow.StateFlow
import kotlinx.coroutines.flow.asStateFlow
import kotlinx.coroutines.flow.update
import kotlinx.coroutines.launch
import one.zrp.social.mobile.data.CharityRepository
import one.zrp.social.mobile.network.CharityTransparencyResponse

data class CharityLedgerUiState(
    val isLoading: Boolean = true,
    val data: CharityTransparencyResponse? = null,
    val error: Boolean = false,
)

/**
 * Live data backing CharityLedgerSection - ported from
 * CharityLedger.tsx. See CharityApi's own KDoc for the full real
 * contract (public, no auth).
 */
class CharityLedgerViewModel(private val repository: CharityRepository) : ViewModel() {
    private val _state = MutableStateFlow(CharityLedgerUiState())
    val state: StateFlow<CharityLedgerUiState> = _state.asStateFlow()

    init {
        load()
    }

    private fun load() {
        _state.update { it.copy(isLoading = true, error = false) }
        viewModelScope.launch {
            repository.getCharityTransparency()
                .onSuccess { data -> _state.update { it.copy(isLoading = false, data = data) } }
                .onFailure { _state.update { it.copy(isLoading = false, error = true) } }
        }
    }
}

class CharityLedgerViewModelFactory(private val repository: CharityRepository) : ViewModelProvider.Factory {
    @Suppress("UNCHECKED_CAST")
    override fun <T : ViewModel> create(modelClass: Class<T>): T = CharityLedgerViewModel(repository) as T
}
