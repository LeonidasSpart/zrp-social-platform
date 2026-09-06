package one.zrp.social.mobile.ui.settings

import androidx.lifecycle.ViewModel
import androidx.lifecycle.viewModelScope
import kotlinx.coroutines.flow.MutableStateFlow
import kotlinx.coroutines.flow.StateFlow
import kotlinx.coroutines.flow.asStateFlow
import kotlinx.coroutines.flow.update
import kotlinx.coroutines.launch
import one.zrp.social.mobile.data.SettingsRepository

data class AccountSettingsUiState(
    val isLoading: Boolean = true,
    val currentEmail: String = "",
    val currentUsername: String = "",
    val usernameCooldownDays: Int = 0,
    val joinedAt: String? = null,
    val newUsername: String = "",
    val isUpdatingUsername: Boolean = false,
    val usernameError: String? = null,
    val usernameSuccess: String? = null,
    val newEmail: String = "",
    val emailPassword: String = "",
    val isUpdatingEmail: Boolean = false,
    val emailError: String? = null,
    val emailSuccess: String? = null,
)

/**
 * The Account category screen - account info, username change (PUT
 * /api/user/username), and email change (PUT /api/user/email, which
 * only ever sends a verification link rather than switching the email
 * immediately, exactly like the website's own flow).
 */
class AccountSettingsViewModel(private val repository: SettingsRepository) : ViewModel() {
    private val _state = MutableStateFlow(AccountSettingsUiState())
    val state: StateFlow<AccountSettingsUiState> = _state.asStateFlow()

    init { load() }

    private fun load() {
        viewModelScope.launch {
            _state.update { it.copy(isLoading = true) }
            val session = repository.getOwnSession().getOrNull()
            val username = session?.username
            var joinedAt: String? = null
            if (username != null) {
                repository.getProfile(username).onSuccess { joinedAt = it.createdAt }
            }
            val cooldown = repository.getUsernameStatus().getOrNull()?.cooldownDays ?: 0
            _state.update {
                it.copy(
                    isLoading = false,
                    currentEmail = session?.email ?: "Not available",
                    currentUsername = username.orEmpty(),
                    newUsername = username.orEmpty(),
                    usernameCooldownDays = cooldown,
                    joinedAt = joinedAt,
                )
            }
        }
    }

    fun onNewUsernameChange(value: String) = _state.update {
        it.copy(newUsername = value.lowercase(), usernameError = null, usernameSuccess = null)
    }

    fun updateUsername() {
        val current = _state.value
        if (current.isUpdatingUsername) return

        if (current.newUsername.length < 3) {
            _state.update { it.copy(usernameError = "Username must be at least 3 characters.") }
            return
        }
        if (current.newUsername == current.currentUsername) {
            _state.update { it.copy(usernameError = "That's already your username.") }
            return
        }
        if (current.usernameCooldownDays > 0) {
            _state.update { it.copy(usernameError = "You can change your username again in ${current.usernameCooldownDays} days.") }
            return
        }

        _state.update { it.copy(isUpdatingUsername = true, usernameError = null) }
        viewModelScope.launch {
            repository.updateUsername(current.newUsername)
                .onSuccess { response ->
                    _state.update {
                        it.copy(
                            isUpdatingUsername = false,
                            currentUsername = response.user.username,
                            newUsername = response.user.username,
                            usernameCooldownDays = 30,
                            usernameSuccess = "Username updated successfully.",
                        )
                    }
                }
                .onFailure { error ->
                    _state.update { it.copy(isUpdatingUsername = false, usernameError = error.message) }
                }
        }
    }

    fun onNewEmailChange(value: String) = _state.update { it.copy(newEmail = value, emailError = null, emailSuccess = null) }
    fun onEmailPasswordChange(value: String) = _state.update { it.copy(emailPassword = value, emailError = null) }

    fun updateEmail() {
        val current = _state.value
        if (current.isUpdatingEmail) return
        if (current.newEmail.isBlank() || current.emailPassword.isBlank()) {
            _state.update { it.copy(emailError = "Please fill in both fields.") }
            return
        }

        _state.update { it.copy(isUpdatingEmail = true, emailError = null) }
        viewModelScope.launch {
            repository.updateEmail(current.emailPassword, current.newEmail)
                .onSuccess { response ->
                    _state.update {
                        it.copy(
                            isUpdatingEmail = false,
                            newEmail = "",
                            emailPassword = "",
                            emailSuccess = response.message,
                        )
                    }
                }
                .onFailure { error ->
                    _state.update { it.copy(isUpdatingEmail = false, emailError = error.message) }
                }
        }
    }
}
