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
import one.zrp.social.mobile.network.AdminUpgradeRequest

data class AdminUpgradeRequestsUiState(
    val isLoading: Boolean = true,
    val statusFilter: String = "pending",
    val requests: List<AdminUpgradeRequest> = emptyList(),
    val updatingId: String? = null,
    // Shared by approve and deny, same as the withdrawals queue.
    val pendingActionId: String? = null,
    val pendingAction: String? = null,
    val error: String? = null,
)

/**
 * Ported from src/app/admin/upgrade-requests/page.tsx - the queue of
 * plan upgrades users have asked for. Approving writes requestedPlan
 * straight onto the requester's account, which is what grants the paid
 * tier; denying only closes the request.
 *
 * The wire values are the real lowercase UpgradeRequest ones
 * ("pending"/"approved"/"denied") and the action is "approve"/"deny",
 * not the "approve"/"reject" pair the moderation queues use - matched
 * case-for-case against the route rather than normalised.
 *
 * Both decisions go through the confirm dialog: approving grants paid
 * access, and neither can be taken back from here (the route only ever
 * accepts a request that's still pending).
 */
class AdminUpgradeRequestsViewModel(private val repository: AdminRepository) : ViewModel() {
    private val _state = MutableStateFlow(AdminUpgradeRequestsUiState())
    val state: StateFlow<AdminUpgradeRequestsUiState> = _state.asStateFlow()

    fun load() {
        val filter = _state.value.statusFilter
        _state.update { it.copy(isLoading = true, error = null) }
        viewModelScope.launch {
            repository.getUpgradeRequests(filter)
                .onSuccess { requests -> _state.update { it.copy(isLoading = false, requests = requests) } }
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
            repository.reviewUpgradeRequest(id, action)
                .onSuccess {
                    _state.update { it.copy(updatingId = null) }
                    load()
                }
                .onFailure { error -> _state.update { it.copy(updatingId = null, error = error.message) } }
        }
    }

    fun consumeError() = _state.update { it.copy(error = null) }
}

class AdminUpgradeRequestsViewModelFactory(private val repository: AdminRepository) : ViewModelProvider.Factory {
    @Suppress("UNCHECKED_CAST")
    override fun <T : ViewModel> create(modelClass: Class<T>): T = AdminUpgradeRequestsViewModel(repository) as T
}
