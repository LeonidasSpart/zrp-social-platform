package one.zrp.social.mobile.ui.auth

import android.content.Context
import android.util.Log
import androidx.lifecycle.ViewModel
import androidx.lifecycle.viewModelScope
import kotlinx.coroutines.flow.MutableStateFlow
import kotlinx.coroutines.flow.StateFlow
import kotlinx.coroutines.flow.asStateFlow
import kotlinx.coroutines.launch
import one.zrp.social.mobile.data.AuthRepository
import one.zrp.social.mobile.data.GoogleAuth
import one.zrp.social.mobile.data.GoogleSignInAttemptMarker
import one.zrp.social.mobile.data.GoogleSignInCancelledException
import one.zrp.social.mobile.data.PushRepository
import one.zrp.social.mobile.network.MobileUser

sealed interface AuthUiState {
    data object LoggedOut : AuthUiState

    // needsOnboarding starts false even on a signed-in cold start whose
    // user is still unknown - see checkOnboardingStatus()'s own comment
    // for why a network round trip never blocks the first paint here.
    data class LoggedIn(val user: MobileUser?, val needsOnboarding: Boolean = false) : AuthUiState
}

sealed interface LoginFormState {
    data object Idle : LoginFormState

    // Password and Google sign-in are distinct variants - not one shared
    // Submitting - so each of LoginScreen's two buttons can show a
    // spinner only for the action it was actually asked to perform,
    // while still sharing one Error/Idle/SessionExpired surface for
    // both (see login()/loginWithGoogle()'s own comments).
    data object Submitting : LoginFormState
    data object SubmittingGoogle : LoginFormState
    data class Error(val message: String) : LoginFormState

    // Distinct from Error(message) because this ViewModel has no
    // Context to resolve a localized string itself - LoginScreen
    // renders this as the real, translated auth_err_session_expired,
    // matching web's own /login?error=session_expired.
    data object SessionExpired : LoginFormState

    // Set only by reportInterruptedGoogleSignIn(), when
    // GoogleSignInAttemptMarker finds a Google Sign-In attempt that
    // started but never finished in this process - see that class's
    // own KDoc. Same reasoning as SessionExpired above for being its
    // own variant rather than Error(message): LoginScreen renders the
    // real, translated auth_err_google_interrupted string.
    data object GoogleInterrupted : LoginFormState
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
            hydrateSessionUser()
        }
    }

    // Cold start's own LoggedIn(user = null) doesn't know the signed-in
    // user's role/plan/badge (or onboarding status) without a real
    // request - rather than delay the first paint on that, this
    // resolves it just after and fills the real MobileUser in, the same
    // one login()/loginWithGoogle() already populate on a fresh sign-in.
    // Without this, every role-gated screen (Settings' own Admin row,
    // most visibly) stayed permanently blind to who was actually signed
    // in on every cold start that wasn't a fresh login - i.e. almost
    // every real app open. A network failure here leaves user as null
    // rather than forcing a logout, the same soft-fail this replaced.
    // The rare case this trades away is a user who quit mid-onboarding
    // briefly seeing the main app again before being routed back into
    // it on the same cold start.
    private fun hydrateSessionUser() {
        viewModelScope.launch {
            val user = authRepository.getSessionUser() ?: return@launch
            val current = _authState.value
            if (current is AuthUiState.LoggedIn) {
                _authState.value = AuthUiState.LoggedIn(user, needsOnboarding = !user.onboardingCompleted)
            }
        }
    }

    // Called once OnboardingScreen's real POST /user/onboarding-complete
    // (or its Skip, which calls the same route) succeeds, so the shared
    // top-level gate returns to the main app without needing a fresh
    // login.
    fun onOnboardingFinished() {
        val current = _authState.value
        if (current is AuthUiState.LoggedIn) {
            _authState.value = current.copy(needsOnboarding = false)
        }
    }

    // The native equivalent of src/app/onboarding/page.tsx's own
    // recoverFromMissingAccount(): a signed session whose underlying
    // User row is gone (stale/deleted account) can still look
    // "authenticated", so this signs out and surfaces the same real,
    // translated auth.errSessionExpired message web's own
    // /login?error=session_expired shows in that case.
    fun logoutWithSessionExpired() {
        viewModelScope.launch {
            authRepository.logout()
            _authState.value = AuthUiState.LoggedOut
            _loginForm.value = LoginFormState.SessionExpired
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
                    _authState.value = AuthUiState.LoggedIn(user, needsOnboarding = !user.onboardingCompleted)

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

    // Owns the ENTIRE Google sign-in round trip - both the Credential
    // Manager account-picker request and the backend token exchange -
    // launched on viewModelScope rather than a Composable's own
    // rememberCoroutineScope().
    //
    // ⚠️ This is not a style preference. rememberCoroutineScope() is
    // tied to the Composition that created it, which is torn down and
    // rebuilt from scratch whenever the hosting Activity is destroyed
    // and recreated - and CredentialManager.getCredential()'s result is
    // itself tied to the specific Activity instance the request was
    // made from, so a mid-flight recreation orphans the request
    // permanently: the picker closes after the user picks an account,
    // but nothing is left alive to receive the result or show an error.
    // That was the exact production bug - "select an account, then
    // nothing happens" - and MainActivity's own configChanges (see
    // AndroidManifest.xml) removes the most common trigger for it
    // outright. viewModelScope is this fix's second, independent layer:
    // it survives any Activity recreation that still legitimately
    // happens (this ViewModel's store is retained across exactly that),
    // so even then the request completes and its result - success,
    // failure, or cancellation - reaches the (rebuilt) UI normally
    // through the same StateFlow every other auth state change already
    // uses. `context` is used only for the duration of this one
    // suspend call, never stored on the ViewModel.
    fun loginWithGoogle(context: Context) {
        _loginForm.value = LoginFormState.SubmittingGoogle

        // See GoogleSignInAttemptMarker's own KDoc: this is the failure
        // mode neither configChanges nor viewModelScope actually covers -
        // the process itself being killed (aggressive OEM background
        // management) while the account picker has focus, which takes
        // this coroutine and every catch block below down with it before
        // any of them can run. markStarted() persists to disk before the
        // request launches; clear() below only runs if this coroutine
        // gets to finish, so a mark still set on the next cold start
        // (checked in ZrpSocialApp) means exactly that happened.
        val attemptMarker = GoogleSignInAttemptMarker(context)
        attemptMarker.markStarted()
        Log.d("GoogleAuthFlow", "loginWithGoogle: started, attempt marker persisted")

        viewModelScope.launch {
            GoogleAuth.requestIdToken(context)
                .onSuccess { idToken ->
                    Log.d("GoogleAuthFlow", "loginWithGoogle: ID token obtained, calling POST /mobile/auth/google")
                    authRepository.loginWithGoogle(idToken)
                        .onSuccess { user ->
                            Log.d("GoogleAuthFlow", "loginWithGoogle: backend accepted token, session established for userId=${user.id}")
                            _loginForm.value = LoginFormState.Idle
                            _authState.value = AuthUiState.LoggedIn(user, needsOnboarding = !user.onboardingCompleted)
                            try {
                                pushRepository.registerCurrentToken()
                            } catch (_: Exception) {
                            }
                        }
                        .onFailure { error ->
                            // The OkHttp BASIC logging interceptor already
                            // logs this call's method/URL/response code -
                            // check Logcat for "okhttp" around this line
                            // to see the actual HTTP status if this fires.
                            Log.w("GoogleAuthFlow", "loginWithGoogle: backend rejected token: ${error.message}")
                            _loginForm.value = LoginFormState.Error(
                                error.message ?: "Something went wrong. Please try again."
                            )
                        }
                }
                .onFailure { failure ->
                    Log.w("GoogleAuthFlow", "loginWithGoogle: GoogleAuth.requestIdToken failed: ${failure::class.simpleName}: ${failure.message}")
                    // A cancelled picker isn't an error - just stop
                    // showing Submitting, exactly like tapping away from
                    // the password form never shows an error either.
                    _loginForm.value = if (failure is GoogleSignInCancelledException) {
                        LoginFormState.Idle
                    } else {
                        LoginFormState.Error(failure.message ?: "Something went wrong. Please try again.")
                    }
                }
            attemptMarker.clear()
            Log.d("GoogleAuthFlow", "loginWithGoogle: finished, attempt marker cleared")
        }
    }

    // Called once, from ZrpSocialApp's own startup check, when
    // GoogleSignInAttemptMarker finds a mark that was never cleared -
    // see loginWithGoogle's own comment on why that specifically means
    // the process died mid-flow rather than any ordinary failure this
    // ViewModel already surfaces on its own. Only overrides a genuinely
    // idle form so this can never clobber a real in-progress state.
    fun reportInterruptedGoogleSignIn() {
        if (_loginForm.value == LoginFormState.Idle) {
            _loginForm.value = LoginFormState.GoogleInterrupted
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
            hydrateSessionUser()
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
