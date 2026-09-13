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
    // Backs the reason-prompt used by reject/suspend/cancel alike - only
    // the confirm label/placeholder/action string differ per action, the
    // same way src/app/admin/ads/page.tsx's single reasonPromptId/
    // reasonPromptAction pair drives all three.
    val reasonPromptCampaignId: String? = null,
    val reasonPromptAction: String? = null,
    // Per-campaign admin-note drafts, keyed by campaign id - unset (no
    // key) means "no edit in progress, show the saved adminNote".
    val noteDrafts: Map<String, String> = emptyMap(),
    val error: String? = null,
)

/**
 * Ported from src/app/admin/ads/page.tsx - the review queue for real
 * paid ad campaigns (the same AdCampaign rows AdsApi serves into the
 * feed once they're ACTIVE). Approving one now moves a campaign to
 * PAYMENT_PENDING rather than straight to ACTIVE (a real on-chain
 * payment step - see lib/ads/lifecycle.ts), and staff can also
 * suspend/resume/cancel a campaign post-launch and save a staff-only
 * note independent of any status change. The route re-validates every
 * transition server-side against that same lifecycle map, so this
 * screen only needs to show the right buttons for the right statuses
 * and call the route with the right action - never its own copy of the
 * transition rules.
 *
 * The PUT returns the bare updated campaign without its
 * advertiser/post relations, so a reviewed campaign is reloaded rather
 * than patched in place - same as before.
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

    fun approve(id: String) = review(id, "approve", null, null)

    fun resume(id: String) = review(id, "resume", null, null)

    fun openReasonPrompt(id: String, action: String) =
        _state.update { it.copy(reasonPromptCampaignId = id, reasonPromptAction = action) }

    fun closeReasonPrompt() =
        _state.update { it.copy(reasonPromptCampaignId = null, reasonPromptAction = null) }

    fun submitReasonPrompt(reason: String) {
        val id = _state.value.reasonPromptCampaignId ?: return
        val action = _state.value.reasonPromptAction ?: return
        _state.update { it.copy(reasonPromptCampaignId = null, reasonPromptAction = null) }
        review(id, action, reason.ifBlank { null }, null)
    }

    fun updateNoteDraft(id: String, text: String) =
        _state.update { it.copy(noteDrafts = it.noteDrafts + (id to text)) }

    fun saveNote(id: String) {
        val note = _state.value.noteDrafts[id] ?: return
        review(id, "note", null, note)
    }

    private fun review(id: String, action: String, rejectionReason: String?, adminNote: String?) {
        _state.update { it.copy(updatingId = id, error = null) }
        viewModelScope.launch {
            repository.reviewAdCampaign(id, action, rejectionReason, adminNote)
                .onSuccess {
                    _state.update {
                        // A plain note-save leaves the note draft consumed;
                        // every other action already leaves the row behind
                        // via the reload below (or keeps it, under "all"),
                        // matching web's handleReview.
                        it.copy(updatingId = null, noteDrafts = it.noteDrafts - id)
                    }
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
