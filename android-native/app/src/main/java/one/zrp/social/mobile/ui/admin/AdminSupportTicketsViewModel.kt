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
import one.zrp.social.mobile.network.AdminSupportStats
import one.zrp.social.mobile.network.AdminSupportTicket

data class AdminSupportTicketsUiState(
    val isLoading: Boolean = true,
    val tickets: List<AdminSupportTicket> = emptyList(),
    val stats: AdminSupportStats? = null,
    // "" is the real "no filter" value the website's own <select>
    // options use - it's sent as an empty query param and read as
    // falsy server-side, not as a literal status.
    val statusFilter: String = "",
    val priorityFilter: String = "",
    val page: Int = 1,
    val totalPages: Int = 1,
    val error: String? = null,
)

/**
 * Ported from src/app/admin/support/page.tsx - every user's support
 * ticket, filtered by status/priority, plus the counts from the real
 * GET /admin/support/tickets/stats route (which the website has but
 * doesn't currently surface on that page).
 *
 * This is the ADMIN view of all tickets, a separate feature from the
 * caller's own tickets in ui/support - and unlike most of this admin
 * panel it is full-ADMIN-only: every /api/admin/support/tickets route
 * uses requireAdmin, and the web page itself refuses anything but
 * role === 'ADMIN'. The screen's own isAdmin gate mirrors that; the
 * server enforces it regardless.
 */
class AdminSupportTicketsViewModel(private val repository: AdminRepository) : ViewModel() {
    private val _state = MutableStateFlow(AdminSupportTicketsUiState())
    val state: StateFlow<AdminSupportTicketsUiState> = _state.asStateFlow()

    fun load() {
        val current = _state.value
        _state.update { it.copy(isLoading = true, error = null) }
        viewModelScope.launch {
            repository.getSupportTickets(
                status = current.statusFilter,
                priority = current.priorityFilter,
                // No category filter on the website's own page either -
                // the route supports it, so the call carries the
                // parameter, always empty (= unfiltered) from here.
                category = "",
                page = current.page,
            )
                .onSuccess { response ->
                    _state.update {
                        it.copy(
                            isLoading = false,
                            tickets = response.tickets,
                            totalPages = response.pagination.pages.coerceAtLeast(1),
                        )
                    }
                }
                .onFailure { error -> _state.update { it.copy(isLoading = false, error = error.message) } }
        }
        viewModelScope.launch {
            repository.getSupportTicketStats()
                .onSuccess { stats -> _state.update { it.copy(stats = stats) } }
        }
    }

    fun setStatusFilter(status: String) {
        if (status == _state.value.statusFilter) return
        _state.update { it.copy(statusFilter = status, page = 1) }
        load()
    }

    fun setPriorityFilter(priority: String) {
        if (priority == _state.value.priorityFilter) return
        _state.update { it.copy(priorityFilter = priority, page = 1) }
        load()
    }

    fun setPage(page: Int) {
        if (page < 1 || page > _state.value.totalPages) return
        _state.update { it.copy(page = page) }
        load()
    }

    fun consumeError() = _state.update { it.copy(error = null) }
}

class AdminSupportTicketsViewModelFactory(private val repository: AdminRepository) : ViewModelProvider.Factory {
    @Suppress("UNCHECKED_CAST")
    override fun <T : ViewModel> create(modelClass: Class<T>): T = AdminSupportTicketsViewModel(repository) as T
}
