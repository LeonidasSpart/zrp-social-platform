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
import one.zrp.social.mobile.network.AdminHelpWithdrawal

data class AdminHelpWithdrawalsUiState(
    val isLoading: Boolean = true,
    val statusFilter: String = "PENDING",
    val withdrawals: List<AdminHelpWithdrawal> = emptyList(),
    val updatingId: String? = null,
    // The confirm dialog is shared by approve and reject, so it carries
    // which one it's confirming alongside the row it applies to.
    val pendingActionId: String? = null,
    val pendingAction: String? = null,
    val error: String? = null,
)

/**
 * The HELP-campaign fund release queue (GET /admin/help-withdrawals) - see
 * AdminWithdrawalsViewModel's own KDoc for how this differs from the
 * creator earnings payout queue at /admin/withdrawals: the payee here is
 * a campaign organizer drawing down a specific HelpCampaign's balance,
 * not a creator's own earnings.
 *
 * Approving executes a real on-chain USDC transfer to the organizer's
 * wallet and records the signature; rejecting (or a failed transfer)
 * releases the reserved amount back to the campaign's available balance.
 * Both are irreversible from here and both are ADMIN-only server-side, so
 * neither fires without the confirm dialog. Only a PENDING row can be
 * actioned at all - the route claims the row with a conditional update
 * and 409s if another admin got there first - so rows in any other
 * status are read-only here.
 *
 * The route returns the whole queue for one status with no pagination,
 * so this screen filters but doesn't page.
 */
class AdminHelpWithdrawalsViewModel(private val repository: AdminRepository) : ViewModel() {
    private val _state = MutableStateFlow(AdminHelpWithdrawalsUiState())
    val state: StateFlow<AdminHelpWithdrawalsUiState> = _state.asStateFlow()

    fun load() {
        val filter = _state.value.statusFilter
        _state.update { it.copy(isLoading = true, error = null) }
        viewModelScope.launch {
            repository.getHelpWithdrawals(filter)
                .onSuccess { withdrawals ->
                    _state.update { it.copy(isLoading = false, withdrawals = withdrawals) }
                }
                .onFailure { error -> _state.update { it.copy(isLoading = false, error = error.message) } }
        }
    }

    fun setStatusFilter(status: String) {
        if (status == _state.value.statusFilter) return
        _state.update { it.copy(statusFilter = status) }
        load()
    }

    fun requestAction(id: String, action: String) =
        _state.update { it.copy(pendingActionId = id, pendingAction = action) }

    fun cancelAction() = _state.update { it.copy(pendingActionId = null, pendingAction = null) }

    fun confirmAction() {
        val id = _state.value.pendingActionId ?: return
        val action = _state.value.pendingAction ?: return
        _state.update { it.copy(pendingActionId = null, pendingAction = null, updatingId = id, error = null) }
        viewModelScope.launch {
            val result = if (action == "approve") {
                repository.approveHelpWithdrawal(id)
            } else {
                repository.rejectHelpWithdrawal(id)
            }
            result
                .onSuccess {
                    _state.update { it.copy(updatingId = null) }
                    load()
                }
                .onFailure { error ->
                    // A failed transfer still changes the row's status
                    // server-side (PENDING -> FAILED, with the amount
                    // released back to the campaign's balance), so the
                    // queue is reloaded here too rather than left showing
                    // a row that no longer exists in this filter. The
                    // error is re-set after load(), which clears it on
                    // its way out - the route's own message is the whole
                    // point of this branch and has to survive the refresh.
                    _state.update { it.copy(updatingId = null) }
                    load()
                    _state.update { it.copy(error = error.message) }
                }
        }
    }

    fun consumeError() = _state.update { it.copy(error = null) }
}

class AdminHelpWithdrawalsViewModelFactory(private val repository: AdminRepository) : ViewModelProvider.Factory {
    @Suppress("UNCHECKED_CAST")
    override fun <T : ViewModel> create(modelClass: Class<T>): T = AdminHelpWithdrawalsViewModel(repository) as T
}
