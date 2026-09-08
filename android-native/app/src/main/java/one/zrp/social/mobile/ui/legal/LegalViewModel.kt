package one.zrp.social.mobile.ui.legal

import androidx.lifecycle.ViewModel
import androidx.lifecycle.ViewModelProvider
import androidx.lifecycle.viewModelScope
import kotlinx.coroutines.flow.MutableStateFlow
import kotlinx.coroutines.flow.StateFlow
import kotlinx.coroutines.flow.asStateFlow
import kotlinx.coroutines.flow.update
import kotlinx.coroutines.launch
import one.zrp.social.mobile.data.LegalRepository
import one.zrp.social.mobile.network.LegalContentResponse

data class LegalUiState(
    val isLoading: Boolean = true,
    val data: LegalContentResponse? = null,
    val errorMessage: String? = null,
)

/**
 * Terms of Service / Privacy Policy / Community Guidelines / Help
 * Center / Contact - see LegalRepository's own KDoc. `page` is one of
 * "terms" | "privacy" | "guidelines" | "help" | "contact", matching
 * GET /api/legal/{page}.
 */
class LegalViewModel(
    private val repository: LegalRepository,
    private val page: String,
) : ViewModel() {
    private val _state = MutableStateFlow(LegalUiState())
    val state: StateFlow<LegalUiState> = _state.asStateFlow()

    init {
        load()
    }

    fun retry() = load()

    private fun load() {
        _state.update { it.copy(isLoading = true, errorMessage = null) }
        viewModelScope.launch {
            repository.getContent(page)
                .onSuccess { data -> _state.update { it.copy(isLoading = false, data = data) } }
                .onFailure { e -> _state.update { it.copy(isLoading = false, errorMessage = e.message) } }
        }
    }
}

class LegalViewModelFactory(
    private val repository: LegalRepository,
    private val page: String,
) : ViewModelProvider.Factory {
    @Suppress("UNCHECKED_CAST")
    override fun <T : ViewModel> create(modelClass: Class<T>): T = LegalViewModel(repository, page) as T
}
