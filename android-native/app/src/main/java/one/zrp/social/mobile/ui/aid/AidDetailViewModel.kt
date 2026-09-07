package one.zrp.social.mobile.ui.aid

import androidx.lifecycle.ViewModel
import androidx.lifecycle.ViewModelProvider
import androidx.lifecycle.viewModelScope
import kotlinx.coroutines.flow.MutableStateFlow
import kotlinx.coroutines.flow.StateFlow
import kotlinx.coroutines.flow.asStateFlow
import kotlinx.coroutines.flow.update
import kotlinx.coroutines.launch
import one.zrp.social.mobile.data.AidRepository
import one.zrp.social.mobile.network.HelpCampaignDetail

data class AidDetailUiState(
    val isLoading: Boolean = true,
    val notFound: Boolean = false,
    val campaign: HelpCampaignDetail? = null,
    val ownUserId: String? = null,
    val offerType: String? = null,
    val offerMessage: String = "",
    val isSubmittingOffer: Boolean = false,
    val offerSent: Boolean = false,
    val offerError: String? = null,
    val isReportOpen: Boolean = false,
    val isReportSubmitting: Boolean = false,
    val reportError: String? = null,
    val reportSent: Boolean = false,
)

/**
 * A single Aid campaign - the same real GET /help/{id}, POST
 * /help/{id}/offer, and POST /reports (with campaignId) routes
 * CampaignDetailPage uses. Money contributions aren't wired here - see
 * AidRepository's own note on why that flow isn't built natively.
 */
class AidDetailViewModel(
    private val campaignId: String,
    private val repository: AidRepository,
) : ViewModel() {
    private val _state = MutableStateFlow(AidDetailUiState())
    val state: StateFlow<AidDetailUiState> = _state.asStateFlow()

    init {
        load()
        viewModelScope.launch {
            repository.getOwnUserId().onSuccess { id -> _state.update { it.copy(ownUserId = id) } }
        }
    }

    private fun load() {
        _state.update { it.copy(isLoading = true, notFound = false) }
        viewModelScope.launch {
            repository.getCampaign(campaignId)
                .onSuccess { campaign -> _state.update { it.copy(isLoading = false, campaign = campaign) } }
                .onFailure { _state.update { it.copy(isLoading = false, notFound = true) } }
        }
    }

    fun onSelectOfferType(needType: String) {
        _state.update { it.copy(offerType = needType, offerError = null) }
    }

    fun onOfferMessageChange(value: String) {
        _state.update { it.copy(offerMessage = value) }
    }

    fun submitOffer() {
        val s = _state.value
        val needType = s.offerType ?: return
        if (s.offerMessage.isBlank()) return

        _state.update { it.copy(isSubmittingOffer = true, offerError = null) }
        viewModelScope.launch {
            repository.submitOffer(campaignId, needType, s.offerMessage.trim())
                .onSuccess { _state.update { it.copy(isSubmittingOffer = false, offerSent = true) } }
                .onFailure { error ->
                    _state.update { it.copy(isSubmittingOffer = false, offerError = error.message ?: offerFailedError) }
                }
        }
    }

    fun onOpenReport() {
        _state.update { it.copy(isReportOpen = true, reportError = null) }
    }

    fun onCancelReport() {
        _state.update { it.copy(isReportOpen = false) }
    }

    fun submitReport(reason: String, details: String?) {
        _state.update { it.copy(isReportSubmitting = true, reportError = null) }
        viewModelScope.launch {
            repository.reportCampaign(campaignId, reason, details)
                .onSuccess { _state.update { it.copy(isReportSubmitting = false, isReportOpen = false, reportSent = true) } }
                .onFailure { error -> _state.update { it.copy(isReportSubmitting = false, reportError = error.message) } }
        }
    }

    companion object {
        const val offerFailedError = "offerFailed"
    }
}

class AidDetailViewModelFactory(
    private val campaignId: String,
    private val repository: AidRepository,
) : ViewModelProvider.Factory {
    @Suppress("UNCHECKED_CAST")
    override fun <T : ViewModel> create(modelClass: Class<T>): T = AidDetailViewModel(campaignId, repository) as T
}
