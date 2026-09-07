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

data class NewTicketUiState(
    val subject: String = "",
    val category: String = "GENERAL",
    val message: String = "",
    val isSubmitting: Boolean = false,
    val error: String? = null,
)

/**
 * ZRP Support - ported from src/app/support/page.tsx: submit a new
 * ticket. Subject/message are HTML `required` inputs on web (no
 * client-side error copy of their own), so this mirrors that with a
 * plain non-empty check rather than inventing a validation message.
 *
 * support_err_create_failed and support_loading stay real, extracted,
 * but deliberately unused translations: the former is web's own
 * fallback for an empty `error.error`, but the real route
 * (src/app/api/support/tickets/route.ts) always returns a real
 * message on every failure path it has; the latter is web's
 * session-loading text, matching every other native screen's own
 * spinner-only (no accompanying text) loading convention.
 */
class NewTicketViewModel(private val repository: SupportRepository) : ViewModel() {
    private val _state = MutableStateFlow(NewTicketUiState())
    val state: StateFlow<NewTicketUiState> = _state.asStateFlow()

    fun onSubjectChange(value: String) = _state.update { it.copy(subject = value) }
    fun onCategoryChange(value: String) = _state.update { it.copy(category = value) }
    fun onMessageChange(value: String) = _state.update { it.copy(message = value) }

    fun submit(onSuccess: () -> Unit) {
        val s = _state.value
        if (s.subject.isBlank() || s.message.isBlank() || s.isSubmitting) return

        _state.update { it.copy(isSubmitting = true, error = null) }
        viewModelScope.launch {
            repository.createTicket(s.subject.trim(), s.category, s.message.trim())
                .onSuccess {
                    _state.update { it.copy(isSubmitting = false) }
                    onSuccess()
                }
                .onFailure { error -> _state.update { it.copy(isSubmitting = false, error = error.message) } }
        }
    }
}

class NewTicketViewModelFactory(private val repository: SupportRepository) : ViewModelProvider.Factory {
    @Suppress("UNCHECKED_CAST")
    override fun <T : ViewModel> create(modelClass: Class<T>): T = NewTicketViewModel(repository) as T
}
