package one.zrp.social.mobile.ui.marketplace

import androidx.lifecycle.ViewModel
import androidx.lifecycle.ViewModelProvider
import androidx.lifecycle.viewModelScope
import kotlinx.coroutines.flow.MutableStateFlow
import kotlinx.coroutines.flow.StateFlow
import kotlinx.coroutines.flow.asStateFlow
import kotlinx.coroutines.flow.update
import kotlinx.coroutines.launch
import one.zrp.social.mobile.data.MarketplaceRepository
import one.zrp.social.mobile.network.ListingSummary

data class MyListingsUiState(
    val isLoading: Boolean = true,
    val listings: List<ListingSummary> = emptyList(),
    val deletingId: String? = null,
    val error: String? = null,
)

/** Ported from src/app/marketplace/my-listings/page.tsx - a seller's own dashboard over GET /listings/mine, with edit/delete actions. */
class MyListingsViewModel(private val repository: MarketplaceRepository) : ViewModel() {
    private val _state = MutableStateFlow(MyListingsUiState())
    val state: StateFlow<MyListingsUiState> = _state.asStateFlow()

    init { load() }

    fun load() {
        _state.update { it.copy(isLoading = true) }
        viewModelScope.launch {
            repository.getMyListings()
                .onSuccess { listings -> _state.update { it.copy(isLoading = false, listings = listings) } }
                .onFailure { error -> _state.update { it.copy(isLoading = false, error = error.message) } }
        }
    }

    fun deleteListing(id: String) {
        _state.update { it.copy(deletingId = id) }
        viewModelScope.launch {
            repository.deleteListing(id)
                .onSuccess {
                    _state.update { it.copy(deletingId = null, listings = it.listings.filterNot { l -> l.id == id }) }
                }
                .onFailure {
                    _state.update { it.copy(deletingId = null, error = deleteFailedError) }
                }
        }
    }

    companion object {
        const val deleteFailedError = "deleteFailed"
    }
}

class MyListingsViewModelFactory(private val repository: MarketplaceRepository) : ViewModelProvider.Factory {
    @Suppress("UNCHECKED_CAST")
    override fun <T : ViewModel> create(modelClass: Class<T>): T = MyListingsViewModel(repository) as T
}
