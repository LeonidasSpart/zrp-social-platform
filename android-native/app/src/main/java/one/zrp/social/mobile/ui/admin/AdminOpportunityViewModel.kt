package one.zrp.social.mobile.ui.admin

import androidx.lifecycle.ViewModel
import androidx.lifecycle.ViewModelProvider
import androidx.lifecycle.viewModelScope
import kotlinx.coroutines.flow.MutableStateFlow
import kotlinx.coroutines.flow.StateFlow
import kotlinx.coroutines.flow.asStateFlow
import kotlinx.coroutines.flow.update
import kotlinx.coroutines.launch
import one.zrp.social.mobile.data.AdminRepository
import one.zrp.social.mobile.network.AdminOpportunityListing

data class AdminOpportunityUiState(
    val isLoading: Boolean = true,
    val statusFilter: String = "PENDING_REVIEW",
    val listings: List<AdminOpportunityListing> = emptyList(),
    val page: Int = 1,
    val totalPages: Int = 1,
    val updatingId: String? = null,
    val reasonModalListingId: String? = null,
    val reasonModalAction: String? = null,
    val error: String? = null,
)

/**
 * Ported from src/app/admin/opportunity/page.tsx - the review queue for
 * real ZRP Opportunity listings (jobs/gigs/volunteering). Same
 * approve/reject/remove contract and same status gating as the
 * marketplace queue, against the OpportunityListing model instead of
 * Listing - see AdminMarketplaceViewModel's own KDoc.
 */
class AdminOpportunityViewModel(private val repository: AdminRepository) : ViewModel() {
    private val _state = MutableStateFlow(AdminOpportunityUiState())
    val state: StateFlow<AdminOpportunityUiState> = _state.asStateFlow()

    fun load() {
        val filter = _state.value.statusFilter
        val page = _state.value.page
        _state.update { it.copy(isLoading = true, error = null) }
        viewModelScope.launch {
            repository.getAdminOpportunityListings(filter, page)
                .onSuccess { response ->
                    _state.update {
                        it.copy(isLoading = false, listings = response.listings, totalPages = response.totalPages)
                    }
                }
                .onFailure { error -> _state.update { it.copy(isLoading = false, error = error.message) } }
        }
    }

    fun setStatusFilter(status: String) {
        if (status == _state.value.statusFilter) return
        _state.update { it.copy(statusFilter = status, page = 1) }
        load()
    }

    fun setPage(page: Int) {
        if (page < 1 || page > _state.value.totalPages) return
        _state.update { it.copy(page = page) }
        load()
    }

    fun approve(id: String) = review(id, "approve", null)

    fun openReasonModal(id: String, action: String) =
        _state.update { it.copy(reasonModalListingId = id, reasonModalAction = action) }

    fun closeReasonModal() = _state.update { it.copy(reasonModalListingId = null, reasonModalAction = null) }

    fun submitReasonAction(reason: String) {
        val id = _state.value.reasonModalListingId ?: return
        val action = _state.value.reasonModalAction ?: return
        _state.update { it.copy(reasonModalListingId = null, reasonModalAction = null) }
        review(id, action, reason.ifBlank { null })
    }

    private fun review(id: String, action: String, rejectionReason: String?) {
        _state.update { it.copy(updatingId = id, error = null) }
        viewModelScope.launch {
            repository.reviewOpportunityListing(id, action, rejectionReason)
                .onSuccess {
                    _state.update { it.copy(updatingId = null) }
                    load()
                }
                .onFailure { error -> _state.update { it.copy(updatingId = null, error = error.message) } }
        }
    }

    fun consumeError() = _state.update { it.copy(error = null) }
}

class AdminOpportunityViewModelFactory(private val repository: AdminRepository) : ViewModelProvider.Factory {
    @Suppress("UNCHECKED_CAST")
    override fun <T : ViewModel> create(modelClass: Class<T>): T = AdminOpportunityViewModel(repository) as T
}
