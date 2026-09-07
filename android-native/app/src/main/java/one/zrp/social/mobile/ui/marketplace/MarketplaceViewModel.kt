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

data class MarketplaceUiState(
    val listings: List<ListingSummary> = emptyList(),
    val isLoading: Boolean = true,
    val isLoadingMore: Boolean = false,
    val nextCursor: String? = null,
    val endReached: Boolean = false,
    val error: String? = null,
    val searchQuery: String = "",
    // null means every category ("All").
    val selectedCategory: String? = null,
    // One of "newest" (default), "priceLow", "priceHigh" - the same
    // real GET /listings `sort` values MarketplaceSearchPage's own
    // sort dropdown sends.
    val sort: String = "newest",
)

/**
 * ZRP Market Plus browse - the same real GET /listings public browse
 * endpoint MarketplaceHomePage/CategoryPage/SearchPage all share on
 * web, folded into one native screen with an in-place category filter
 * and search bar rather than three separate routes: a phone's own
 * "tap a category to filter this same grid" pattern reads more natural
 * than three near-identical pages a phone would just navigate between
 * anyway.
 */
class MarketplaceViewModel(private val repository: MarketplaceRepository) : ViewModel() {
    private val _state = MutableStateFlow(MarketplaceUiState())
    val state: StateFlow<MarketplaceUiState> = _state.asStateFlow()

    init {
        load()
    }

    private fun load() {
        _state.update { it.copy(isLoading = true, error = null) }
        viewModelScope.launch {
            val s = _state.value
            repository.getListings(
                cursor = null,
                category = s.selectedCategory,
                search = s.searchQuery,
                sort = s.sort,
            ).onSuccess { page ->
                _state.update {
                    it.copy(
                        listings = page.listings,
                        nextCursor = page.nextCursor,
                        isLoading = false,
                        endReached = page.nextCursor == null,
                    )
                }
            }.onFailure { error ->
                _state.update { it.copy(isLoading = false, error = error.message) }
            }
        }
    }

    fun loadMore() {
        val current = _state.value
        if (current.isLoadingMore || current.endReached || current.nextCursor == null) return

        _state.update { it.copy(isLoadingMore = true) }
        viewModelScope.launch {
            repository.getListings(
                cursor = current.nextCursor,
                category = current.selectedCategory,
                search = current.searchQuery,
                sort = current.sort,
            ).onSuccess { page ->
                _state.update {
                    it.copy(
                        listings = it.listings + page.listings,
                        nextCursor = page.nextCursor,
                        isLoadingMore = false,
                        endReached = page.nextCursor == null,
                    )
                }
            }.onFailure {
                _state.update { it.copy(isLoadingMore = false) }
            }
        }
    }

    fun onSearchQueryChange(query: String) {
        _state.update { it.copy(searchQuery = query) }
    }

    fun onSearch() {
        load()
    }

    fun onCategorySelect(category: String?) {
        if (_state.value.selectedCategory == category) return
        _state.update { it.copy(selectedCategory = category) }
        load()
    }

    fun onSortChange(sort: String) {
        if (_state.value.sort == sort) return
        _state.update { it.copy(sort = sort) }
        load()
    }

    fun refresh() {
        load()
    }
}

class MarketplaceViewModelFactory(private val repository: MarketplaceRepository) : ViewModelProvider.Factory {
    @Suppress("UNCHECKED_CAST")
    override fun <T : ViewModel> create(modelClass: Class<T>): T {
        return MarketplaceViewModel(repository) as T
    }
}
