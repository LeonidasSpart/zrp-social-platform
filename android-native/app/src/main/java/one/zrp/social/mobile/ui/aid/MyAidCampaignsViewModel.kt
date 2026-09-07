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
import one.zrp.social.mobile.network.HelpMyCampaign

data class MyAidCampaignsUiState(
    val isLoading: Boolean = true,
    val campaigns: List<HelpMyCampaign> = emptyList(),
    val withdrawTargetId: String? = null,
    val withdrawAmount: String = "",
    val isWithdrawing: Boolean = false,
    val withdrawError: String? = null,
    val withdrawSuccess: Boolean = false,
)

/**
 * My Campaigns - ported from MyCampaignsPage.tsx: the organizer's own
 * campaigns with a raised/available-balance breakdown and a withdrawal
 * request against GET/POST /help/my-campaigns and /help/{id}/withdraw,
 * the same real payout flow (not a payment-in, so it's fully native
 * per AidRepository's own policy note).
 */
class MyAidCampaignsViewModel(
    private val repository: AidRepository,
) : ViewModel() {
    private val _state = MutableStateFlow(MyAidCampaignsUiState())
    val state: StateFlow<MyAidCampaignsUiState> = _state.asStateFlow()

    init {
        load()
    }

    private fun load() {
        _state.update { it.copy(isLoading = true) }
        viewModelScope.launch {
            repository.getMyCampaigns()
                .onSuccess { page -> _state.update { it.copy(isLoading = false, campaigns = page.campaigns) } }
                .onFailure { _state.update { it.copy(isLoading = false) } }
        }
    }

    fun onStartWithdraw(campaignId: String) {
        _state.update { it.copy(withdrawTargetId = campaignId, withdrawAmount = "", withdrawError = null) }
    }

    fun onCancelWithdraw() {
        _state.update { it.copy(withdrawTargetId = null) }
    }

    fun onWithdrawAmountChange(amount: String) {
        _state.update { it.copy(withdrawAmount = amount) }
    }

    fun confirmWithdraw() {
        val s = _state.value
        val campaignId = s.withdrawTargetId ?: return
        val amount = s.withdrawAmount.toDoubleOrNull()
        if (amount == null || amount <= 0) {
            _state.update { it.copy(withdrawError = invalidAmountError) }
            return
        }

        _state.update { it.copy(isWithdrawing = true, withdrawError = null) }
        viewModelScope.launch {
            repository.requestWithdrawal(campaignId, amount)
                .onSuccess {
                    _state.update { it.copy(isWithdrawing = false, withdrawTargetId = null, withdrawSuccess = true) }
                    load()
                }
                .onFailure { error ->
                    _state.update { it.copy(isWithdrawing = false, withdrawError = error.message ?: withdrawFailedError) }
                }
        }
    }

    companion object {
        const val invalidAmountError = "invalidAmount"
        const val withdrawFailedError = "withdrawFailed"
    }
}

class MyAidCampaignsViewModelFactory(
    private val repository: AidRepository,
) : ViewModelProvider.Factory {
    @Suppress("UNCHECKED_CAST")
    override fun <T : ViewModel> create(modelClass: Class<T>): T = MyAidCampaignsViewModel(repository) as T
}
