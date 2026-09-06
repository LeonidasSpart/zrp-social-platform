package one.zrp.social.mobile.ui.auth

import androidx.lifecycle.ViewModel
import androidx.lifecycle.viewModelScope
import kotlinx.coroutines.flow.MutableStateFlow
import kotlinx.coroutines.flow.StateFlow
import kotlinx.coroutines.flow.asStateFlow
import kotlinx.coroutines.launch
import one.zrp.social.mobile.data.AuthRepository
import one.zrp.social.mobile.data.PushRepository
import one.zrp.social.mobile.network.MobileUser

sealed interface AuthUiState {
    data object LoggedOut : AuthUiState
    data class LoggedIn(val user: MobileUser?) : AuthUiState
}

sealed interface LoginFormState {
    data object Idle : LoginFormState
    data object Submitting : LoginFormState
    data class Error(val message: String) : LoginFormState
}

/**
 * Single source of truth for "is anyone signed in" (MainActivity's top-
 * level gate between LoginScreen and the main app) and the login
 * form's own submit state. One shared ViewModel rather than two so
 * there's exactly one place that transitions LoggedOut -> LoggedIn.
 */
class AuthViewModel(
    private val authRepository: AuthRepository,
    private val pushRepository: PushRepository = PushRepository(),
) : ViewModel() {
    private val _authState = MutableStateFlow<AuthUiState>(
        if (authRepository.isLoggedIn()) AuthUiState.LoggedIn(user = null) else AuthUiState.LoggedOut
    )
    val authState: StateFlow<AuthUiState> = _authState.asStateFlow()

    private val _loginForm = MutableStateFlow<LoginFormState>(LoginFormState.Idle)
    val loginForm: StateFlow<LoginFormState> = _loginForm.asStateFlow()

    init {
        // Covers the cold-start-already-logged-in case, where login()'s
        // own registration below never runs - e.g. the first app launch
        // after this feature ships, for someone who signed in before it
        // existed.
        if (_authState.value is AuthUiState.LoggedIn) {
            viewModelScope.launch {
                try {
                    pushRepository.registerCurrentToken()
                } catch (_: Exception) {
                }
            }
        }
    }

    fun login(identifier: String, password: String) {
        if (identifier.isBlank() || password.isBlank()) {
            _loginForm.value = LoginFormState.Error("Enter your email or username and password.")
            return
        }

        _loginForm.value = LoginFormState.Submitting
        viewModelScope.launch {
            authRepository.login(identifier, password)
                .onSuccess { user ->
                    _loginForm.value = LoginFormState.Idle
                    _authState.value = AuthUiState.LoggedIn(user)

                    // Best-effort - a failure here (no network, no
                    // notification permission granted yet) shouldn't
                    // block a successful login. onNewToken picks up any
                    // token FCM generates later on.
                    try {
                        pushRepository.registerCurrentToken()
                    } catch (_: Exception) {
                    }
                }
                .onFailure { error ->
                    _loginForm.value = LoginFormState.Error(
                        error.message ?: "Something went wrong. Please try again."
                    )
                }
        }
    }

    // Called after a signup flow's own post-registration login attempt
    // (expected to fail, since a fresh account always starts
    // unverified - see SignupViewModel) in case it unexpectedly
    // succeeds, so the shared top-level gate reflects a real session
    // immediately rather than only on the next app launch.
    fun refreshLoggedInState() {
        if (authRepository.isLoggedIn() && _authState.value !is AuthUiState.LoggedIn) {
            _authState.value = AuthUiState.LoggedIn(user = null)
            viewModelScope.launch {
                try {
                    pushRepository.registerCurrentToken()
                } catch (_: Exception) {
                }
            }
        }
    }

    fun logout() {
        viewModelScope.launch {
            // Unregister this device's token while the session is
            // still valid - once authRepository.logout() clears it,
            // this authenticated call would just 401. Best-effort: if
            // it fails, the token lingers server-side until FCM itself
            // reports it stale on a later send.
            try {
                val token = pushRepository.fetchCurrentToken()
                pushRepository.unregisterToken(token)
            } catch (_: Exception) {
            }

            authRepository.logout()
            _authState.value = AuthUiState.LoggedOut
        }
    }
}
