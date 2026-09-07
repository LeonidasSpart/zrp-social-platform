package one.zrp.social.mobile.ui.trust

import androidx.lifecycle.ViewModel
import androidx.lifecycle.ViewModelProvider
import androidx.lifecycle.viewModelScope
import kotlinx.coroutines.flow.MutableStateFlow
import kotlinx.coroutines.flow.StateFlow
import kotlinx.coroutines.flow.asStateFlow
import kotlinx.coroutines.flow.update
import kotlinx.coroutines.launch
import one.zrp.social.mobile.data.TrustRepository
import one.zrp.social.mobile.network.TrustPassportResponse

data class TrustPassportUiState(
    val isLoading: Boolean = true,
    val data: TrustPassportResponse? = null,
    val error: Boolean = false,
)

/**
 * ZRP Trust Passport - ported from src/app/trust/[username]/page.tsx:
 * a transparent trust score built entirely from public account
 * signals. See TrustApi's own KDoc for the full real contract - no
 * auth required, matching the real route.
 */
class TrustPassportViewModel(
    private val repository: TrustRepository,
    private val username: String,
) : ViewModel() {
    private val _state = MutableStateFlow(TrustPassportUiState())
    val state: StateFlow<TrustPassportUiState> = _state.asStateFlow()

    init {
        load()
    }

    private fun load() {
        _state.update { it.copy(isLoading = true, error = false) }
        viewModelScope.launch {
            repository.getTrustPassport(username)
                .onSuccess { data -> _state.update { it.copy(isLoading = false, data = data) } }
                .onFailure { _state.update { it.copy(isLoading = false, error = true) } }
        }
    }
}

class TrustPassportViewModelFactory(
    private val repository: TrustRepository,
    private val username: String,
) : ViewModelProvider.Factory {
    @Suppress("UNCHECKED_CAST")
    override fun <T : ViewModel> create(modelClass: Class<T>): T = TrustPassportViewModel(repository, username) as T
}
