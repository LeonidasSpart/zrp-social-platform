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
import one.zrp.social.mobile.network.AdminWithdrawal

data class AdminWithdrawalsUiState(
    val isLoading: Boolean = true,
    val statusFilter: String = "PENDING",
    val withdrawals: List<AdminWithdrawal> = emptyList(),
    val updatingId: String? = null,
    // The confirm dialog is shared by approve and reject, so it carries
    // which one it's confirming alongside the row it applies to.
    val pendingActionId: String? = null,
    val pendingAction: String? = null,
    val error: String? = null,
)

/**
 * The creator earnings payout queue (GET /admin/withdrawals) - the one
 * financial admin surface the website has no page for yet, so this is
 * the first client of these routes. Not to be confused with
 * /admin/help-withdrawals, the separate HELP-campaign fund release the
 * web admin nav does carry.
 *
 * Approving executes a real on-chain USDC transfer to the creator's
 * wallet and records the signature; rejecting releases the reserved
 * amount back to their balance. Both are irreversible from here and
 * both are ADMIN-only server-side, so neither fires without the confirm
 * dialog. Only a PENDING row can be actioned at all - the route claims
 * the row with a conditional update and 409s if another admin got there
 * first - so rows in any other status are read-only here.
 *
 * The route returns the whole queue for one status with no pagination,
 * so this screen filters but doesn't page.
 */
class AdminWithdrawalsViewModel(private val repository: AdminRepository) : ViewModel() {
    private val _state = MutableStateFlow(AdminWithdrawalsUiState())
    val state: StateFlow<AdminWithdrawalsUiState> = _state.asStateFlow()

    fun load() {
        val filter = _state.value.statusFilter
        _state.update { it.copy(isLoading = true, error = null) }
        viewModelScope.launch {
            repository.getWithdrawals(filter)
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
                repository.approveWithdrawal(id)
            } else {
                repository.rejectWithdrawal(id)
            }
            result
                .onSuccess {
                    _state.update { it.copy(updatingId = null) }
                    load()
                }
                .onFailure { error ->
                    // A failed transfer still changes the row's status
                    // server-side (PENDING -> FAILED, with the amount
                    // released back to the creator), so the queue is
                    // reloaded here too rather than left showing a row
                    // that no longer exists in this filter. The error is
                    // re-set after load(), which clears it on its way
                    // out - the route's own message ("the withdrawal
                    // amount has been returned to the creator's
                    // balance") is the whole point of this branch and
                    // has to survive the refresh.
                    _state.update { it.copy(updatingId = null) }
                    load()
                    _state.update { it.copy(error = error.message) }
                }
        }
    }

    fun consumeError() = _state.update { it.copy(error = null) }
}

class AdminWithdrawalsViewModelFactory(private val repository: AdminRepository) : ViewModelProvider.Factory {
    @Suppress("UNCHECKED_CAST")
    override fun <T : ViewModel> create(modelClass: Class<T>): T = AdminWithdrawalsViewModel(repository) as T
}
