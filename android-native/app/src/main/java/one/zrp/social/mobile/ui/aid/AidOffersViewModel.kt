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
import one.zrp.social.mobile.network.HelpOffer

data class AidOffersUiState(
    val isLoading: Boolean = true,
    val offers: List<HelpOffer> = emptyList(),
    val busyOfferId: String? = null,
)

/**
 * Review Offers - ported from CampaignOffersPage.tsx: the organizer
 * triaging offers on their own campaign against the real GET
 * /help/{id}/offer and PUT /help/offers/{id} endpoints. Same status
 * transitions as web: PENDING can go to ACKNOWLEDGED/FULFILLED/
 * DECLINED, ACKNOWLEDGED can only go to FULFILLED.
 */
class AidOffersViewModel(
    private val campaignId: String,
    private val repository: AidRepository,
) : ViewModel() {
    private val _state = MutableStateFlow(AidOffersUiState())
    val state: StateFlow<AidOffersUiState> = _state.asStateFlow()

    init {
        load()
    }

    private fun load() {
        _state.update { it.copy(isLoading = true) }
        viewModelScope.launch {
            repository.getOffers(campaignId)
                .onSuccess { offers -> _state.update { it.copy(isLoading = false, offers = offers) } }
                .onFailure { _state.update { it.copy(isLoading = false) } }
        }
    }

    fun updateStatus(offerId: String, status: String) {
        _state.update { it.copy(busyOfferId = offerId) }
        viewModelScope.launch {
            repository.updateOfferStatus(offerId, status)
            _state.update { it.copy(busyOfferId = null) }
            load()
        }
    }
}

class AidOffersViewModelFactory(
    private val campaignId: String,
    private val repository: AidRepository,
) : ViewModelProvider.Factory {
    @Suppress("UNCHECKED_CAST")
    override fun <T : ViewModel> create(modelClass: Class<T>): T = AidOffersViewModel(campaignId, repository) as T
}
