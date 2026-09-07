package one.zrp.social.mobile.ui.support

import androidx.lifecycle.ViewModel
import androidx.lifecycle.ViewModelProvider
import androidx.lifecycle.viewModelScope
import kotlinx.coroutines.flow.MutableStateFlow
import kotlinx.coroutines.flow.StateFlow
import kotlinx.coroutines.flow.asStateFlow
import kotlinx.coroutines.flow.update
import kotlinx.coroutines.launch
import one.zrp.social.mobile.data.SupportRepository
import one.zrp.social.mobile.network.SupportTicketSummary

data class SupportTicketsUiState(
    val isLoading: Boolean = true,
    val tickets: List<SupportTicketSummary> = emptyList(),
    val deletingId: String? = null,
    val error: String? = null,
)

/**
 * ZRP Support - ported from src/app/support/tickets/page.tsx: the
 * caller's own ticket list, with delete only exposed (both here and
 * on the real route) while a ticket is RESOLVED or CLOSED.
 *
 * load() is called by the Screen itself (on first composition and
 * again every time this destination is freshly recomposed after
 * returning from either the create-ticket form or a ticket's own
 * detail screen via popBackStack) rather than from init - a reply
 * that changes a ticket's status, or a newly created ticket, would
 * otherwise never show up without navigating away and back again.
 *
 * support_tickets_loading_tickets and support_tickets_err_delete_failed
 * stay real, extracted, but deliberately unused translations: the
 * former is web's own list-loading text, matching every other native
 * screen's own spinner-only loading convention; the latter is web's
 * fallback for an empty `error.error` on a failed delete, but the
 * real route (src/app/api/support/tickets/[id]/route.ts) always
 * returns a real message on every failure path it has.
 */
class SupportTicketsViewModel(private val repository: SupportRepository) : ViewModel() {
    private val _state = MutableStateFlow(SupportTicketsUiState())
    val state: StateFlow<SupportTicketsUiState> = _state.asStateFlow()

    fun load() {
        _state.update { it.copy(isLoading = true, error = null) }
        viewModelScope.launch {
            repository.getTickets()
                .onSuccess { tickets -> _state.update { it.copy(isLoading = false, tickets = tickets) } }
                .onFailure { error -> _state.update { it.copy(isLoading = false, error = error.message) } }
        }
    }

    fun deleteTicket(id: String) {
        _state.update { it.copy(deletingId = id, error = null) }
        viewModelScope.launch {
            repository.deleteTicket(id)
                .onSuccess {
                    _state.update { it.copy(deletingId = null, tickets = it.tickets.filterNot { t -> t.id == id }) }
                }
                .onFailure { error ->
                    _state.update { it.copy(deletingId = null, error = error.message) }
                }
        }
    }

    fun consumeError() = _state.update { it.copy(error = null) }
}

class SupportTicketsViewModelFactory(private val repository: SupportRepository) : ViewModelProvider.Factory {
    @Suppress("UNCHECKED_CAST")
    override fun <T : ViewModel> create(modelClass: Class<T>): T = SupportTicketsViewModel(repository) as T
}
