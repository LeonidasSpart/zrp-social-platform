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
import one.zrp.social.mobile.network.AdminSupportTicketDetail

data class AdminSupportTicketDetailUiState(
    val isLoading: Boolean = true,
    val ticket: AdminSupportTicketDetail? = null,
    val notFound: Boolean = false,
    // The three editable admin fields, seeded from the ticket on every
    // load and only sent when Update is explicitly submitted - picking a
    // status or priority never writes on its own, same as the website's
    // own <select> + Update button.
    val status: String = "",
    val priority: String = "",
    val assignedTo: String = "",
    val replyMessage: String = "",
    val isInternal: Boolean = false,
    val isSending: Boolean = false,
    val isUpdating: Boolean = false,
    val isResolving: Boolean = false,
    val isDeleting: Boolean = false,
    val deleted: Boolean = false,
    val error: String? = null,
) {
    /** True once the admin has actually changed one of the three fields. */
    val hasPendingChanges: Boolean
        get() {
            val current = ticket ?: return false
            return status != current.status ||
                priority != current.priority ||
                assignedTo != (current.assignedAdmin?.id ?: "")
        }
}

/**
 * Ported from src/app/admin/support/[id]/page.tsx - one ticket's full
 * thread with the admin-side controls: status/priority/assignee (one
 * explicit Update submit, never a one-tap write), a reply that can be
 * public or an internal admin-only note (the route's own `isInternal`
 * flag), the dedicated resolve action with its resolution note, and
 * deletion.
 *
 * Every call underneath is requireAdmin server-side - see
 * AdminSupportTicketsViewModel's own KDoc.
 */
class AdminSupportTicketDetailViewModel(
    private val ticketId: String,
    private val repository: AdminRepository,
) : ViewModel() {
    private val _state = MutableStateFlow(AdminSupportTicketDetailUiState())
    val state: StateFlow<AdminSupportTicketDetailUiState> = _state.asStateFlow()

    init { load() }

    fun load() {
        _state.update { it.copy(isLoading = true, notFound = false) }
        viewModelScope.launch {
            repository.getSupportTicket(ticketId)
                .onSuccess { ticket ->
                    _state.update {
                        it.copy(
                            isLoading = false,
                            ticket = ticket,
                            status = ticket.status,
                            priority = ticket.priority,
                            assignedTo = ticket.assignedAdmin?.id ?: "",
                        )
                    }
                }
                .onFailure { _state.update { it.copy(isLoading = false, notFound = true) } }
        }
    }

    fun setStatus(status: String) = _state.update { it.copy(status = status) }
    fun setPriority(priority: String) = _state.update { it.copy(priority = priority) }
    fun onAssignedToChange(value: String) = _state.update { it.copy(assignedTo = value) }

    fun submitUpdate() {
        val s = _state.value
        if (s.ticket == null || s.isUpdating) return
        _state.update { it.copy(isUpdating = true, error = null) }
        viewModelScope.launch {
            repository.updateSupportTicket(ticketId, s.status, s.priority, s.assignedTo.trim())
                .onSuccess {
                    _state.update { it.copy(isUpdating = false) }
                    load()
                }
                .onFailure { error -> _state.update { it.copy(isUpdating = false, error = error.message) } }
        }
    }

    fun onReplyMessageChange(value: String) = _state.update { it.copy(replyMessage = value) }
    fun setInternal(internal: Boolean) = _state.update { it.copy(isInternal = internal) }

    fun sendReply() {
        val s = _state.value
        if (s.replyMessage.isBlank() || s.isSending) return
        _state.update { it.copy(isSending = true, error = null) }
        viewModelScope.launch {
            repository.replyToSupportTicket(ticketId, s.replyMessage.trim(), s.isInternal)
                .onSuccess {
                    // The reply route moves the ticket to IN_PROGRESS
                    // itself, so the reloaded ticket - not the local
                    // copy - is the truth about its status afterwards.
                    _state.update { it.copy(isSending = false, replyMessage = "", isInternal = false) }
                    load()
                }
                .onFailure { error -> _state.update { it.copy(isSending = false, error = error.message) } }
        }
    }

    fun resolve(resolution: String) {
        if (_state.value.isResolving) return
        _state.update { it.copy(isResolving = true, error = null) }
        viewModelScope.launch {
            repository.resolveSupportTicket(ticketId, resolution.trim())
                .onSuccess {
                    _state.update { it.copy(isResolving = false) }
                    load()
                }
                .onFailure { error -> _state.update { it.copy(isResolving = false, error = error.message) } }
        }
    }

    fun delete() {
        if (_state.value.isDeleting) return
        _state.update { it.copy(isDeleting = true, error = null) }
        viewModelScope.launch {
            repository.deleteSupportTicket(ticketId)
                .onSuccess { _state.update { it.copy(isDeleting = false, deleted = true) } }
                .onFailure { error -> _state.update { it.copy(isDeleting = false, error = error.message) } }
        }
    }

    fun consumeError() = _state.update { it.copy(error = null) }
}

class AdminSupportTicketDetailViewModelFactory(
    private val ticketId: String,
    private val repository: AdminRepository,
) : ViewModelProvider.Factory {
    @Suppress("UNCHECKED_CAST")
    override fun <T : ViewModel> create(modelClass: Class<T>): T =
        AdminSupportTicketDetailViewModel(ticketId, repository) as T
}
