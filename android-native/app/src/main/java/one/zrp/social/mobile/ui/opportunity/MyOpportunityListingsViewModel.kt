package one.zrp.social.mobile.ui.opportunity

import androidx.lifecycle.ViewModel
import androidx.lifecycle.ViewModelProvider
import androidx.lifecycle.viewModelScope
import kotlinx.coroutines.flow.MutableStateFlow
import kotlinx.coroutines.flow.StateFlow
import kotlinx.coroutines.flow.asStateFlow
import kotlinx.coroutines.flow.update
import kotlinx.coroutines.launch
import one.zrp.social.mobile.data.OpportunityRepository
import one.zrp.social.mobile.network.OpportunitySummary

data class MyOpportunityListingsUiState(
    val isLoading: Boolean = true,
    val listings: List<OpportunitySummary> = emptyList(),
    val error: String? = null,
)

/**
 * Ported from MyOpportunityListingsPage.tsx - a poster's own listings
 * over GET /opportunity/my-listings, real status badges, and a rejection
 * reason when present. No delete action here - unlike Marketplace's own
 * My Listings, web's OPPORTUNITY equivalent never exposes one either
 * (only View Applicants and Edit), so this doesn't invent one.
 */
class MyOpportunityListingsViewModel(private val repository: OpportunityRepository) : ViewModel() {
    private val _state = MutableStateFlow(MyOpportunityListingsUiState())
    val state: StateFlow<MyOpportunityListingsUiState> = _state.asStateFlow()

    init { load() }

    fun load() {
        _state.update { it.copy(isLoading = true) }
        viewModelScope.launch {
            repository.getMyListings()
                .onSuccess { page -> _state.update { it.copy(isLoading = false, listings = page.listings) } }
                .onFailure { error -> _state.update { it.copy(isLoading = false, error = error.message) } }
        }
    }
}

class MyOpportunityListingsViewModelFactory(private val repository: OpportunityRepository) : ViewModelProvider.Factory {
    @Suppress("UNCHECKED_CAST")
    override fun <T : ViewModel> create(modelClass: Class<T>): T = MyOpportunityListingsViewModel(repository) as T
}
