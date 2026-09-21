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
import one.zrp.social.mobile.network.AdminSubscriptionDetail
import one.zrp.social.mobile.network.AdminSubscriptionDetailUser

data class AdminSubscriptionDetailUiState(
    val isLoading: Boolean = true,
    val user: AdminSubscriptionDetailUser? = null,
    val subscription: AdminSubscriptionDetail? = null,
    val notFound: Boolean = false,
    val actionBusy: Boolean = false,
    // Grant/extend dialog - plan is restricted to pro/business/enterprise
    // server-side (never free, see GrantSubscriptionRequest's own note).
    val grantDialogOpen: Boolean = false,
    val grantPlan: String = "pro",
    val grantInterval: String = "monthly",
    // Cancel dialog - reason is optional free text.
    val cancelDialogOpen: Boolean = false,
    val cancelReason: String = "",
    val restoreDialogOpen: Boolean = false,
    val error: String? = null,
)

/**
 * Ported from src/app/admin/subscriptions/[userId]/page.tsx (GET
 * /admin/subscriptions/{userId}) - one user's full billing record plus
 * the three admin controls (grant/extend, cancel, restore). See
 * AdminSubscriptionsViewModel's own KDoc for the ADMIN-only gate this
 * whole section sits behind.
 *
 * `subscription` is null exactly when this user has never had a
 * Subscription row created - a genuinely free user, or a legacy-paid
 * user (per User.plan) who still needs the one-time reconciliation this
 * screen's own Grant/extend action performs. That's a real empty state,
 * not a load failure - `notFound` is reserved for the user themselves
 * not existing (the route's own 404).
 *
 * All three actions (grant/cancel/restore) reload the detail afterward
 * rather than patching the response in by hand, matching every other
 * write-then-reload admin screen in this module (AdminRepository's own
 * KDoc) - each route answers with just {success, subscriptionId,
 * periodEnd?}, not the full updated record.
 */
class AdminSubscriptionDetailViewModel(
    private val userId: String,
    private val repository: AdminRepository,
) : ViewModel() {
    private val _state = MutableStateFlow(AdminSubscriptionDetailUiState())
    val state: StateFlow<AdminSubscriptionDetailUiState> = _state.asStateFlow()

    fun load() {
        _state.update { it.copy(isLoading = true, notFound = false, error = null) }
        viewModelScope.launch {
            repository.getSubscriptionDetail(userId)
                .onSuccess { response ->
                    _state.update {
                        it.copy(isLoading = false, user = response.user, subscription = response.subscription)
                    }
                }
                .onFailure { error ->
                    // The route 404s with "User not found" when the id
                    // itself is wrong (deleted since the list was loaded,
                    // or a stale deep link) - distinct from every other
                    // failure, which keeps the retry affordance instead.
                    val notFound = error.message?.contains("not found", ignoreCase = true) == true
                    _state.update { it.copy(isLoading = false, notFound = notFound, error = if (notFound) null else error.message) }
                }
        }
    }

    fun openGrantDialog() = _state.update { it.copy(grantDialogOpen = true, grantPlan = "pro", grantInterval = "monthly") }
    fun closeGrantDialog() = _state.update { it.copy(grantDialogOpen = false) }
    fun setGrantPlan(plan: String) = _state.update { it.copy(grantPlan = plan) }
    fun setGrantInterval(interval: String) = _state.update { it.copy(grantInterval = interval) }

    fun confirmGrant() {
        val plan = _state.value.grantPlan
        val interval = _state.value.grantInterval
        _state.update { it.copy(grantDialogOpen = false, actionBusy = true, error = null) }
        viewModelScope.launch {
            repository.grantSubscription(userId, plan, interval)
                .onSuccess { load() }
                .onFailure { error -> _state.update { it.copy(actionBusy = false, error = error.message) } }
        }
    }

    fun openCancelDialog() = _state.update { it.copy(cancelDialogOpen = true, cancelReason = "") }
    fun closeCancelDialog() = _state.update { it.copy(cancelDialogOpen = false) }
    fun setCancelReason(reason: String) = _state.update { it.copy(cancelReason = reason) }

    fun confirmCancel() {
        val reason = _state.value.cancelReason.trim().ifBlank { null }
        _state.update { it.copy(cancelDialogOpen = false, actionBusy = true, error = null) }
        viewModelScope.launch {
            repository.cancelSubscription(userId, reason)
                .onSuccess { load() }
                .onFailure { error -> _state.update { it.copy(actionBusy = false, error = error.message) } }
        }
    }

    fun openRestoreDialog() = _state.update { it.copy(restoreDialogOpen = true) }
    fun closeRestoreDialog() = _state.update { it.copy(restoreDialogOpen = false) }

    fun confirmRestore() {
        _state.update { it.copy(restoreDialogOpen = false, actionBusy = true, error = null) }
        viewModelScope.launch {
            repository.restoreSubscription(userId)
                .onSuccess { load() }
                .onFailure { error -> _state.update { it.copy(actionBusy = false, error = error.message) } }
        }
    }

    fun consumeError() = _state.update { it.copy(error = null) }
}

class AdminSubscriptionDetailViewModelFactory(
    private val userId: String,
    private val repository: AdminRepository,
) : ViewModelProvider.Factory {
    @Suppress("UNCHECKED_CAST")
    override fun <T : ViewModel> create(modelClass: Class<T>): T =
        AdminSubscriptionDetailViewModel(userId, repository) as T
}
