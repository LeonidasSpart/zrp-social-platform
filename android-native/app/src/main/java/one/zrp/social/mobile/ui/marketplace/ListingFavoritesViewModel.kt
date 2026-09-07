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

data class ListingFavoritesUiState(
    val listings: List<ListingSummary> = emptyList(),
    val isLoading: Boolean = true,
)

/** The same real GET /listings/favorites route MarketplaceFavoritesPage uses. */
class ListingFavoritesViewModel(private val repository: MarketplaceRepository) : ViewModel() {
    private val _state = MutableStateFlow(ListingFavoritesUiState())
    val state: StateFlow<ListingFavoritesUiState> = _state.asStateFlow()

    init {
        load()
    }

    private fun load() {
        _state.update { it.copy(isLoading = true) }
        viewModelScope.launch {
            repository.getFavoriteListings()
                .onSuccess { listings -> _state.update { it.copy(listings = listings, isLoading = false) } }
                .onFailure { _state.update { it.copy(isLoading = false) } }
        }
    }

    // Removing here matches MarketplaceFavoritesPage's own removeFavorite() -
    // this list only exists to show favorited listings, so an unfavorited
    // one disappears immediately rather than waiting for a refresh.
    fun removeFavorite(listingId: String) {
        val previous = _state.value.listings
        _state.update { it.copy(listings = it.listings.filterNot { l -> l.id == listingId }) }
        viewModelScope.launch {
            repository.toggleFavorite(listingId).onFailure {
                _state.update { it.copy(listings = previous) }
            }
        }
    }
}

class ListingFavoritesViewModelFactory(private val repository: MarketplaceRepository) : ViewModelProvider.Factory {
    @Suppress("UNCHECKED_CAST")
    override fun <T : ViewModel> create(modelClass: Class<T>): T {
        return ListingFavoritesViewModel(repository) as T
    }
}
