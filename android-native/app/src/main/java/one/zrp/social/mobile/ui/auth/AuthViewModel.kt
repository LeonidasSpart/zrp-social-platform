package one.zrp.social.mobile.ui.auth

import androidx.lifecycle.ViewModel
import androidx.lifecycle.viewModelScope
import kotlinx.coroutines.flow.MutableStateFlow
import kotlinx.coroutines.flow.StateFlow
import kotlinx.coroutines.flow.asStateFlow
import kotlinx.coroutines.launch
import one.zrp.social.mobile.data.AuthRepository
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
class AuthViewModel(private val authRepository: AuthRepository) : ViewModel() {
    private val _authState = MutableStateFlow<AuthUiState>(
        if (authRepository.isLoggedIn()) AuthUiState.LoggedIn(user = null) else AuthUiState.LoggedOut
    )
    val authState: StateFlow<AuthUiState> = _authState.asStateFlow()

    private val _loginForm = MutableStateFlow<LoginFormState>(LoginFormState.Idle)
    val loginForm: StateFlow<LoginFormState> = _loginForm.asStateFlow()

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
                }
                .onFailure { error ->
                    _loginForm.value = LoginFormState.Error(
                        error.message ?: "Something went wrong. Please try again."
                    )
                }
        }
    }

    fun logout() {
        authRepository.logout()
        _authState.value = AuthUiState.LoggedOut
    }
}
