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
import one.zrp.social.mobile.network.AdminHelpCampaign

data class AdminHelpUiState(
    val isLoading: Boolean = true,
    val statusFilter: String = "PENDING_REVIEW",
    val campaigns: List<AdminHelpCampaign> = emptyList(),
    val page: Int = 1,
    val totalPages: Int = 1,
    val updatingId: String? = null,
    val reasonModalCampaignId: String? = null,
    val reasonModalAction: String? = null,
    val error: String? = null,
)

/**
 * Ported from src/app/admin/help/page.tsx - the review queue for real
 * ZRP HELP aid campaigns (the same rows the Aid tab raises money
 * against). Same approve/reject/remove contract and status gating as
 * the marketplace queue - see AdminMarketplaceViewModel's own KDoc -
 * except that approving a campaign here does not set an expiry, since
 * a HELP campaign runs until its organiser closes it.
 */
class AdminHelpViewModel(private val repository: AdminRepository) : ViewModel() {
    private val _state = MutableStateFlow(AdminHelpUiState())
    val state: StateFlow<AdminHelpUiState> = _state.asStateFlow()

    fun load() {
        val filter = _state.value.statusFilter
        val page = _state.value.page
        _state.update { it.copy(isLoading = true, error = null) }
        viewModelScope.launch {
            repository.getAdminHelpCampaigns(filter, page)
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

    fun openReasonModal(id: String, action: String) =
        _state.update { it.copy(reasonModalCampaignId = id, reasonModalAction = action) }

    fun closeReasonModal() = _state.update { it.copy(reasonModalCampaignId = null, reasonModalAction = null) }

    fun submitReasonAction(reason: String) {
        val id = _state.value.reasonModalCampaignId ?: return
        val action = _state.value.reasonModalAction ?: return
        _state.update { it.copy(reasonModalCampaignId = null, reasonModalAction = null) }
        review(id, action, reason.ifBlank { null })
    }

    private fun review(id: String, action: String, rejectionReason: String?) {
        _state.update { it.copy(updatingId = id, error = null) }
        viewModelScope.launch {
            repository.reviewHelpCampaign(id, action, rejectionReason)
                .onSuccess {
                    _state.update { it.copy(updatingId = null) }
                    load()
                }
                .onFailure { error -> _state.update { it.copy(updatingId = null, error = error.message) } }
        }
    }

    fun consumeError() = _state.update { it.copy(error = null) }
}

class AdminHelpViewModelFactory(private val repository: AdminRepository) : ViewModelProvider.Factory {
    @Suppress("UNCHECKED_CAST")
    override fun <T : ViewModel> create(modelClass: Class<T>): T = AdminHelpViewModel(repository) as T
}
