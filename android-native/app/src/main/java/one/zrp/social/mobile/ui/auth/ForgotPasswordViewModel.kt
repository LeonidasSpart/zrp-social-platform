package one.zrp.social.mobile.ui.auth

import androidx.lifecycle.ViewModel
import androidx.lifecycle.ViewModelProvider
import androidx.lifecycle.viewModelScope
import kotlinx.coroutines.flow.MutableStateFlow
import kotlinx.coroutines.flow.StateFlow
import kotlinx.coroutines.flow.asStateFlow
import kotlinx.coroutines.flow.update
import kotlinx.coroutines.launch
import one.zrp.social.mobile.data.AuthRepository

data class ForgotPasswordUiState(
    val email: String = "",
    val isSubmitting: Boolean = false,
    // The real POST /auth/forgot-password route always returns the
    // same generic, hardcoded-English message regardless of whether
    // the account exists ("for security, always return a generic
    // message" - its own comment) - ForgotPasswordPage.tsx shows that
    // raw message as-is, not a translated string, so this stays
    // English in every locale on the real website too. Native matches
    // that real behavior rather than translating a message no real
    // user of any language actually sees translated.
    val successMessage: String? = null,
    // Composable resolves this to the real, translated auth_err_try_again.
    val networkError: Boolean = false,
)

// Copied verbatim from src/app/api/auth/forgot-password/route.ts's own
// success response - only used if that field were ever missing, which
// the real route never does.
private const val FALLBACK_MESSAGE = "If an account exists, you'll receive a reset link"

/**
 * Backs the native Forgot Password screen - the same real
 * POST /auth/forgot-password the website's own /forgot-password page
 * calls. Actually completing the reset (choosing a new password from
 * the emailed link) still happens in the device's browser today - the
 * website's own /reset-password/[token] page is already mobile-
 * responsive and fully functional there. A native in-app completion
 * screen would need a verified Android App Link for the reset-password
 * path on zrp.one to intercept the emailed link instead of opening a
 * browser, which is real, separate infrastructure work (a hosted
 * assetlinks.json plus the app's real release-signing fingerprint),
 * not a smaller gap in this screen.
 */
class ForgotPasswordViewModel(private val repository: AuthRepository) : ViewModel() {
    private val _state = MutableStateFlow(ForgotPasswordUiState())
    val state: StateFlow<ForgotPasswordUiState> = _state.asStateFlow()

    fun onEmailChange(email: String) {
        _state.update { it.copy(email = email) }
    }

    fun submit() {
        if (_state.value.isSubmitting) return
        _state.update { it.copy(isSubmitting = true, successMessage = null, networkError = false) }
        viewModelScope.launch {
            repository.forgotPassword(_state.value.email.trim())
                .onSuccess { message ->
                    _state.update { it.copy(isSubmitting = false, successMessage = message ?: FALLBACK_MESSAGE) }
                }
                .onFailure {
                    _state.update { it.copy(isSubmitting = false, networkError = true) }
                }
        }
    }
}

class ForgotPasswordViewModelFactory(private val repository: AuthRepository) : ViewModelProvider.Factory {
    @Suppress("UNCHECKED_CAST")
    override fun <T : ViewModel> create(modelClass: Class<T>): T {
        return ForgotPasswordViewModel(repository) as T
    }
}
