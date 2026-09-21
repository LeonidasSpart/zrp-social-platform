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
import one.zrp.social.mobile.network.AdminSubscriptionRow

data class AdminSubscriptionsUiState(
    val isLoading: Boolean = true,
    val search: String = "",
    val planFilter: String = "ALL",
    val statusFilter: String = "ALL",
    val subscriptions: List<AdminSubscriptionRow> = emptyList(),
    val page: Int = 1,
    val totalPages: Int = 1,
    val error: String? = null,
)

/**
 * Ported from src/app/admin/subscriptions/page.tsx (GET
 * /admin/subscriptions) - the authoritative record of every user's paid
 * entitlement, never just User.plan. See AdminSubscriptionRow's own KDoc
 * for why the base query is User, not Subscription, and what the
 * synthetic PAID/FREE/NO_SUBSCRIPTION status values mean.
 *
 * requireAdmin server-side (real ADMIN role only, never MODERATOR) -
 * this whole section is gated off `isAdmin` the same way the financial
 * queues and internal ops tools are (see AdminDashboardScreen's own
 * KDoc), not shown to staff at all.
 *
 * The website's own page also renders a KPI overview (paid/free counts,
 * revenue, expiring-soon) computed over the *unfiltered* table - this
 * screen doesn't port that: it's a search/filter/detail console, and
 * every one of those numbers is one tap away already (Dashboard's own
 * stat cards, or the Payments/Withdrawals queues for revenue/failed
 * payments specifically).
 */
class AdminSubscriptionsViewModel(private val repository: AdminRepository) : ViewModel() {
    private val _state = MutableStateFlow(AdminSubscriptionsUiState())
    val state: StateFlow<AdminSubscriptionsUiState> = _state.asStateFlow()

    fun load() {
        val s = _state.value
        _state.update { it.copy(isLoading = true, error = null) }
        viewModelScope.launch {
            repository.getSubscriptions(s.search, s.page, s.planFilter, s.statusFilter)
                .onSuccess { response ->
                    _state.update {
                        it.copy(
                            isLoading = false,
                            subscriptions = response.subscriptions,
                            totalPages = response.pagination.totalPages,
                        )
                    }
                }
                .onFailure { error -> _state.update { it.copy(isLoading = false, error = error.message) } }
        }
    }

    fun setSearch(value: String) = _state.update { it.copy(search = value) }

    fun submitSearch() {
        _state.update { it.copy(page = 1) }
        load()
    }

    fun setPlanFilter(plan: String) {
        if (plan == _state.value.planFilter) return
        _state.update { it.copy(planFilter = plan, page = 1) }
        load()
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

    fun consumeError() = _state.update { it.copy(error = null) }
}

class AdminSubscriptionsViewModelFactory(private val repository: AdminRepository) : ViewModelProvider.Factory {
    @Suppress("UNCHECKED_CAST")
    override fun <T : ViewModel> create(modelClass: Class<T>): T = AdminSubscriptionsViewModel(repository) as T
}
