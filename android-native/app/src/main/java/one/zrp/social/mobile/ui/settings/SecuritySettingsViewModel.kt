package one.zrp.social.mobile.ui.settings

import androidx.lifecycle.ViewModel
import androidx.lifecycle.viewModelScope
import kotlinx.coroutines.flow.MutableStateFlow
import kotlinx.coroutines.flow.StateFlow
import kotlinx.coroutines.flow.asStateFlow
import kotlinx.coroutines.flow.update
import kotlinx.coroutines.launch
import one.zrp.social.mobile.data.SettingsRepository

data class SecuritySettingsUiState(
    val currentPassword: String = "",
    val newPassword: String = "",
    val confirmPassword: String = "",
    val isSaving: Boolean = false,
    val error: String? = null,
    val successMessage: String? = null,
)

/** The Security category's password-change form (PUT /api/user/password). */
class SecuritySettingsViewModel(private val repository: SettingsRepository) : ViewModel() {
    private val _state = MutableStateFlow(SecuritySettingsUiState())
    val state: StateFlow<SecuritySettingsUiState> = _state.asStateFlow()

    fun onCurrentPasswordChange(value: String) = _state.update { it.copy(currentPassword = value, error = null) }
    fun onNewPasswordChange(value: String) = _state.update { it.copy(newPassword = value, error = null) }
    fun onConfirmPasswordChange(value: String) = _state.update { it.copy(confirmPassword = value, error = null) }

    fun submit() {
        val current = _state.value
        if (current.isSaving) return

        if (current.currentPassword.isBlank() || current.newPassword.isBlank()) {
            _state.update { it.copy(error = "Please fill in all fields.") }
            return
        }
        if (current.newPassword.length < 6) {
            _state.update { it.copy(error = "New password must be at least 6 characters.") }
            return
        }
        if (current.newPassword != current.confirmPassword) {
            _state.update { it.copy(error = "New passwords don't match.") }
            return
        }

        _state.update { it.copy(isSaving = true, error = null, successMessage = null) }
        viewModelScope.launch {
            repository.updatePassword(current.currentPassword, current.newPassword)
                .onSuccess {
                    _state.update {
                        SecuritySettingsUiState(successMessage = "Password updated successfully.")
                    }
                }
                .onFailure { error ->
                    _state.update { it.copy(isSaving = false, error = error.message) }
                }
        }
    }
}
