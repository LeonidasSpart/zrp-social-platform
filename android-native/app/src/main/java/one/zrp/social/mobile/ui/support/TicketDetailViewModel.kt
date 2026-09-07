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
import one.zrp.social.mobile.network.SupportTicketDetail

data class TicketDetailUiState(
    val isLoading: Boolean = true,
    val ticket: SupportTicketDetail? = null,
    val notFound: Boolean = false,
    val replyMessage: String = "",
    val isSending: Boolean = false,
    val error: String? = null,
)

/**
 * ZRP Support - ported from src/app/support/tickets/[id]/page.tsx:
 * one ticket's full thread + reply form, gated on status exactly like
 * the real route (blocked once RESOLVED/CLOSED).
 */
class TicketDetailViewModel(
    private val ticketId: String,
    private val repository: SupportRepository,
) : ViewModel() {
    private val _state = MutableStateFlow(TicketDetailUiState())
    val state: StateFlow<TicketDetailUiState> = _state.asStateFlow()

    init { load() }

    fun load() {
        _state.update { it.copy(isLoading = true, notFound = false) }
        viewModelScope.launch {
            repository.getTicket(ticketId)
                .onSuccess { ticket -> _state.update { it.copy(isLoading = false, ticket = ticket) } }
                .onFailure { _state.update { it.copy(isLoading = false, notFound = true) } }
        }
    }

    fun onReplyMessageChange(value: String) = _state.update { it.copy(replyMessage = value) }

    fun sendReply() {
        val s = _state.value
        if (s.replyMessage.isBlank() || s.isSending) return
        _state.update { it.copy(isSending = true, error = null) }
        viewModelScope.launch {
            repository.replyToTicket(ticketId, s.replyMessage.trim())
                .onSuccess {
                    _state.update { it.copy(isSending = false, replyMessage = "") }
                    load()
                }
                .onFailure { error -> _state.update { it.copy(isSending = false, error = error.message) } }
        }
    }
}

class TicketDetailViewModelFactory(
    private val ticketId: String,
    private val repository: SupportRepository,
) : ViewModelProvider.Factory {
    @Suppress("UNCHECKED_CAST")
    override fun <T : ViewModel> create(modelClass: Class<T>): T = TicketDetailViewModel(ticketId, repository) as T
}
