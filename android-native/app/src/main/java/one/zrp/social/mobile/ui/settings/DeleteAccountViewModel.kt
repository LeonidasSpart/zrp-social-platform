package one.zrp.social.mobile.ui.settings

import androidx.lifecycle.ViewModel
import androidx.lifecycle.viewModelScope
import kotlinx.coroutines.flow.MutableStateFlow
import kotlinx.coroutines.flow.StateFlow
import kotlinx.coroutines.flow.asStateFlow
import kotlinx.coroutines.flow.update
import kotlinx.coroutines.launch
import one.zrp.social.mobile.data.SettingsRepository

data class DeleteAccountUiState(
    val isLoading: Boolean = true,
    val isScheduled: Boolean = false,
    val scheduledFor: String? = null,
    val isSubmitting: Boolean = false,
    val error: String? = null,
    val infoMessage: String? = null,
    val deleted: Boolean = false,
)

/**
 * The same 30-day scheduled deletion flow as
 * src/app/settings/delete/page.tsx: request (schedules in 30 days, or
 * cancels an already-pending request - one toggle endpoint), then a
 * separate typed-confirmation step that deletes immediately.
 */
class DeleteAccountViewModel(private val repository: SettingsRepository) : ViewModel() {
    private val _state = MutableStateFlow(DeleteAccountUiState())
    val state: StateFlow<DeleteAccountUiState> = _state.asStateFlow()

    init { load() }

    private fun load() {
        viewModelScope.launch {
            _state.update { it.copy(isLoading = true) }
            repository.getDeletionStatus()
                .onSuccess { status ->
                    _state.update {
                        it.copy(
                            isLoading = false,
                            isScheduled = status.scheduledFor != null,
                            scheduledFor = status.scheduledFor,
                        )
                    }
                }
                .onFailure { error ->
                    _state.update { it.copy(isLoading = false, error = error.message) }
                }
        }
    }

    fun toggleScheduledDeletion() {
        if (_state.value.isSubmitting) return
        _state.update { it.copy(isSubmitting = true, error = null, infoMessage = null) }
        viewModelScope.launch {
            repository.toggleScheduledDeletion()
                .onSuccess { response ->
                    val nowScheduled = !_state.value.isScheduled
                    _state.update {
                        it.copy(
                            isSubmitting = false,
                            isScheduled = nowScheduled,
                            scheduledFor = response.deletionDate,
                            infoMessage = response.message,
                        )
                    }
                }
                .onFailure { error -> _state.update { it.copy(isSubmitting = false, error = error.message) } }
        }
    }

    // The caller (DeleteAccountScreen) only invokes this once the user has
    // typed "DELETE" - it shows its own real, translated validation error
    // and never calls through otherwise, so no redundant check is needed here.
    fun confirmDeletion() {
        if (_state.value.isSubmitting) return
        _state.update { it.copy(isSubmitting = true, error = null) }
        viewModelScope.launch {
            repository.confirmDeletion()
                .onSuccess { _state.update { it.copy(isSubmitting = false, deleted = true) } }
                .onFailure { error -> _state.update { it.copy(isSubmitting = false, error = error.message) } }
        }
    }
}
