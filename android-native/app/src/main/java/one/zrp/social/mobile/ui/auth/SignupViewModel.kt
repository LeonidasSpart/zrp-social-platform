package one.zrp.social.mobile.ui.auth

import androidx.lifecycle.ViewModel
import androidx.lifecycle.ViewModelProvider
import androidx.lifecycle.viewModelScope
import kotlinx.coroutines.Job
import kotlinx.coroutines.delay
import kotlinx.coroutines.flow.MutableStateFlow
import kotlinx.coroutines.flow.StateFlow
import kotlinx.coroutines.flow.asStateFlow
import kotlinx.coroutines.flow.update
import kotlinx.coroutines.launch
import one.zrp.social.mobile.data.AuthRepository
import one.zrp.social.mobile.data.ResendVerificationResult

enum class UsernameStatus { IDLE, CHECKING, AVAILABLE, TAKEN, INVALID }

/**
 * Which resend-verification message to show, translated by the
 * Composable (a plain ViewModel can't resolve Android string
 * resources) - mirrors SignupPage's own three-way branch exactly.
 */
enum class ResendMessageKind { SUCCESS, ALREADY_VERIFIED, ERROR }

data class SignupUiState(
    val name: String = "",
    val username: String = "",
    val email: String = "",
    val password: String = "",
    val usernameStatus: UsernameStatus = UsernameStatus.IDLE,
    val usernameSuggestions: List<String> = emptyList(),
    val isSubmitting: Boolean = false,
    val error: String? = null,
    // Set once registration succeeds - matches signup/page.tsx's own
    // registeredEmail: a real credentials signup always lands here,
    // since a fresh account starts unverified and the post-registration
    // sign-in attempt is expected to fail (see submit()).
    val registeredEmail: String? = null,
    val isResending: Boolean = false,
    val resendMessageKind: ResendMessageKind? = null,
)

private val USERNAME_REGEX = Regex("^[a-zA-Z0-9_]+$")

/**
 * Backs the native Signup screen - the same real POST /auth/register
 * and GET /auth/check-username the website's own /signup page calls,
 * with the same client-side validation mirroring the server's own
 * rules (3-20 chars, letters/numbers/underscores; password >= 6 chars)
 * so a doomed submission never reaches the network. Google/Apple
 * sign-up (real, live options on web's own signup page) are a
 * separate, disclosed follow-up - they need a native OAuth SDK
 * integration this slice doesn't add.
 */
class SignupViewModel(
    private val repository: AuthRepository,
    private val authViewModel: AuthViewModel,
) : ViewModel() {
    private val _state = MutableStateFlow(SignupUiState())
    val state: StateFlow<SignupUiState> = _state.asStateFlow()

    private var usernameCheckJob: Job? = null

    fun onNameChange(name: String) {
        _state.update { it.copy(name = name) }
    }

    fun onUsernameChange(username: String) {
        _state.update { it.copy(username = username, error = null) }

        usernameCheckJob?.cancel()
        val trimmed = username.trim()

        if (trimmed.isEmpty()) {
            _state.update { it.copy(usernameStatus = UsernameStatus.IDLE, usernameSuggestions = emptyList()) }
            return
        }

        if (trimmed.length < 3 || trimmed.length > 20 || !USERNAME_REGEX.matches(trimmed)) {
            _state.update { it.copy(usernameStatus = UsernameStatus.INVALID, usernameSuggestions = emptyList()) }
            return
        }

        _state.update { it.copy(usernameStatus = UsernameStatus.CHECKING) }
        usernameCheckJob = viewModelScope.launch {
            delay(400)
            repository.checkUsername(trimmed)
                .onSuccess { result ->
                    _state.update {
                        it.copy(
                            usernameStatus = if (result.available) UsernameStatus.AVAILABLE else UsernameStatus.TAKEN,
                            usernameSuggestions = result.suggestions,
                        )
                    }
                }
                .onFailure {
                    _state.update { it.copy(usernameStatus = UsernameStatus.IDLE) }
                }
        }
    }

    fun onSelectSuggestion(suggestion: String) {
        onUsernameChange(suggestion)
    }

    fun onEmailChange(email: String) {
        _state.update { it.copy(email = email, error = null) }
    }

    fun onPasswordChange(password: String) {
        _state.update { it.copy(password = password, error = null) }
    }

    fun submit() {
        val current = _state.value
        if (current.usernameStatus == UsernameStatus.TAKEN) {
            _state.update { it.copy(error = "That username is taken. Pick a suggestion below or try another.") }
            return
        }
        if (current.isSubmitting) return

        _state.update { it.copy(isSubmitting = true, error = null) }
        viewModelScope.launch {
            repository.register(
                name = current.name.trim().ifEmpty { null },
                username = current.username.trim(),
                email = current.email.trim(),
                password = current.password,
            ).onSuccess {
                // Every newly registered account starts unverified, and
                // the shared verifyCredentials() (used by both web's
                // NextAuth authorize() and this app's own /mobile/auth/
                // login) deliberately refuses to sign in an unverified
                // user - so this attempt failing is the expected outcome
                // for every credentials signup, not a rare edge case.
                // refreshLoggedInState() covers the unexpected case
                // where it doesn't fail.
                repository.login(current.email.trim(), current.password)
                authViewModel.refreshLoggedInState()
                _state.update { it.copy(isSubmitting = false, registeredEmail = current.email.trim()) }
            }.onFailure { error ->
                _state.update {
                    it.copy(isSubmitting = false, error = error.message ?: "Registration failed. Please try again later.")
                }
            }
        }
    }

    fun resendVerification() {
        val email = _state.value.registeredEmail ?: return
        if (_state.value.isResending) return

        _state.update { it.copy(isResending = true, resendMessageKind = null) }
        viewModelScope.launch {
            val result = repository.resendVerification(email)
            val kind = when (result) {
                ResendVerificationResult.SENT -> ResendMessageKind.SUCCESS
                ResendVerificationResult.ALREADY_VERIFIED -> ResendMessageKind.ALREADY_VERIFIED
                ResendVerificationResult.FAILED -> ResendMessageKind.ERROR
            }
            _state.update { it.copy(isResending = false, resendMessageKind = kind) }
        }
    }
}

class SignupViewModelFactory(
    private val repository: AuthRepository,
    private val authViewModel: AuthViewModel,
) : ViewModelProvider.Factory {
    @Suppress("UNCHECKED_CAST")
    override fun <T : ViewModel> create(modelClass: Class<T>): T {
        return SignupViewModel(repository, authViewModel) as T
    }
}
