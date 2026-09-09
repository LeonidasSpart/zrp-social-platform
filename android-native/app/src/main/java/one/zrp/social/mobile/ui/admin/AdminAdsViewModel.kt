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
import one.zrp.social.mobile.network.AdminAdCampaign

data class AdminAdsUiState(
    val isLoading: Boolean = true,
    val statusFilter: String = "PENDING_REVIEW",
    val campaigns: List<AdminAdCampaign> = emptyList(),
    val page: Int = 1,
    val totalPages: Int = 1,
    val updatingId: String? = null,
    val rejectModalCampaignId: String? = null,
    val error: String? = null,
)

/**
 * Ported from src/app/admin/ads/page.tsx - the review queue for real
 * paid ad campaigns (the same AdCampaign rows AdsApi serves into the
 * feed once they're ACTIVE). Approving one puts a real, budgeted
 * campaign live, so the route only accepts approve/reject on a
 * campaign that is still PENDING_REVIEW and 400s otherwise; this
 * screen only offers those two actions on a pending row for the same
 * reason.
 *
 * The PUT returns the bare updated campaign without its
 * advertiser/post relations, so a reviewed campaign is reloaded rather
 * than patched in place.
 */
class AdminAdsViewModel(private val repository: AdminRepository) : ViewModel() {
    private val _state = MutableStateFlow(AdminAdsUiState())
    val state: StateFlow<AdminAdsUiState> = _state.asStateFlow()

    fun load() {
        val filter = _state.value.statusFilter
        val page = _state.value.page
        _state.update { it.copy(isLoading = true, error = null) }
        viewModelScope.launch {
            repository.getAdCampaigns(filter, page)
                .onSuccess { response ->
                    _state.update {
                        it.copy(isLoading = false, campaigns = response.campaigns, totalPages = response.totalPages)
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

    fun openRejectModal(id: String) = _state.update { it.copy(rejectModalCampaignId = id) }
    fun closeRejectModal() = _state.update { it.copy(rejectModalCampaignId = null) }

    fun submitReject(reason: String) {
        val id = _state.value.rejectModalCampaignId ?: return
        _state.update { it.copy(rejectModalCampaignId = null) }
        review(id, "reject", reason.ifBlank { null })
    }

    private fun review(id: String, action: String, rejectionReason: String?) {
        _state.update { it.copy(updatingId = id, error = null) }
        viewModelScope.launch {
            repository.reviewAdCampaign(id, action, rejectionReason)
                .onSuccess {
                    _state.update { it.copy(updatingId = null) }
                    load()
                }
                .onFailure { error -> _state.update { it.copy(updatingId = null, error = error.message) } }
        }
    }

    fun consumeError() = _state.update { it.copy(error = null) }
}

class AdminAdsViewModelFactory(private val repository: AdminRepository) : ViewModelProvider.Factory {
    @Suppress("UNCHECKED_CAST")
    override fun <T : ViewModel> create(modelClass: Class<T>): T = AdminAdsViewModel(repository) as T
}
