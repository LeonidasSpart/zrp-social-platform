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
import one.zrp.social.mobile.network.AdminListing

data class AdminMarketplaceUiState(
    val isLoading: Boolean = true,
    val statusFilter: String = "PENDING_REVIEW",
    val listings: List<AdminListing> = emptyList(),
    val page: Int = 1,
    val totalPages: Int = 1,
    val updatingId: String? = null,
    // The reason modal is shared by reject and remove (the only two
    // destructive actions), so it carries which one it's confirming.
    val reasonModalListingId: String? = null,
    val reasonModalAction: String? = null,
    val error: String? = null,
)

/**
 * Ported from src/app/admin/marketplace/page.tsx - the review queue for
 * real ZRP Market Plus listings. Approve/reject only apply to a
 * PENDING_REVIEW listing and remove only to an ACTIVE one (a live
 * listing being pulled for a policy violation); the route enforces that
 * split and 400s otherwise, so each row only offers the actions valid
 * for its own status. Approving also starts a fresh 90-day expiry
 * window server-side.
 */
class AdminMarketplaceViewModel(private val repository: AdminRepository) : ViewModel() {
    private val _state = MutableStateFlow(AdminMarketplaceUiState())
    val state: StateFlow<AdminMarketplaceUiState> = _state.asStateFlow()

    fun load() {
        val filter = _state.value.statusFilter
        val page = _state.value.page
        _state.update { it.copy(isLoading = true, error = null) }
        viewModelScope.launch {
            repository.getAdminListings(filter, page)
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
            repository.reviewListing(id, action, rejectionReason)
                .onSuccess {
                    _state.update { it.copy(updatingId = null) }
                    load()
                }
                .onFailure { error -> _state.update { it.copy(updatingId = null, error = error.message) } }
        }
    }

    fun consumeError() = _state.update { it.copy(error = null) }
}

class AdminMarketplaceViewModelFactory(private val repository: AdminRepository) : ViewModelProvider.Factory {
    @Suppress("UNCHECKED_CAST")
    override fun <T : ViewModel> create(modelClass: Class<T>): T = AdminMarketplaceViewModel(repository) as T
}
