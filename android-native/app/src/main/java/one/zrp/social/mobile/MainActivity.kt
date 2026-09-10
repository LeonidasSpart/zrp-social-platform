package one.zrp.social.mobile

import android.Manifest
import android.os.Build
import android.os.Bundle
import androidx.activity.compose.rememberLauncherForActivityResult
import androidx.activity.compose.setContent
import androidx.activity.enableEdgeToEdge
import androidx.activity.result.contract.ActivityResultContracts
import androidx.appcompat.app.AppCompatActivity
import androidx.compose.foundation.layout.fillMaxSize
import androidx.compose.material3.Surface
import androidx.compose.material3.windowsizeclass.ExperimentalMaterial3WindowSizeClassApi
import androidx.compose.material3.windowsizeclass.WindowSizeClass
import androidx.compose.material3.windowsizeclass.calculateWindowSizeClass
import androidx.compose.runtime.Composable
import androidx.compose.runtime.LaunchedEffect
import androidx.compose.runtime.collectAsState
import androidx.compose.runtime.getValue
import androidx.compose.runtime.mutableStateOf
import androidx.compose.runtime.remember
import androidx.compose.runtime.setValue
import androidx.compose.ui.Modifier
import androidx.compose.ui.platform.LocalContext
import androidx.lifecycle.viewmodel.compose.viewModel
import one.zrp.social.mobile.data.AuthRepository
import one.zrp.social.mobile.data.GoogleSignInAttemptMarker
import one.zrp.social.mobile.ui.auth.AuthUiState
import one.zrp.social.mobile.ui.auth.AuthViewModel
import one.zrp.social.mobile.ui.auth.AuthViewModelFactory
import one.zrp.social.mobile.ui.auth.ForgotPasswordScreen
import one.zrp.social.mobile.ui.auth.LoginScreen
import one.zrp.social.mobile.ui.auth.SignupScreen
import one.zrp.social.mobile.ui.navigation.ZrpNavHost
import one.zrp.social.mobile.ui.onboarding.OnboardingScreen
import one.zrp.social.mobile.ui.theme.ZrpSocialTheme

private enum class LoggedOutScreen { LOGIN, SIGNUP, FORGOT_PASSWORD }

// AppCompatActivity, not ComponentActivity - AppCompatDelegate's per-app
// language switch (LanguageSettingsScreen) only reliably reapplies the
// new locale's string resources on Activity.recreate() via
// AppCompatActivity's own attachBaseContext wrapping on pre-Android-13
// devices; a plain ComponentActivity silently keeps the old language's
// resources after recreate() there, even though the stored preference
// is correct - the "unreliable" symptom real-device reports described.
class MainActivity : AppCompatActivity() {
    @OptIn(ExperimentalMaterial3WindowSizeClassApi::class)
    override fun onCreate(savedInstanceState: Bundle?) {
        super.onCreate(savedInstanceState)
        enableEdgeToEdge()
        setContent {
            // Real window-width detection (tablet/large-screen two-pane
            // messaging - see WindowSize.kt's own isTwoPane KDoc), not a
            // fixed dp guess. This Activity now declares configChanges
            // (see AndroidManifest.xml's own comment on why - it's load-
            // bearing for Google Sign-In, not just rotation smoothness),
            // so a rotation/fold/multi-window resize no longer recreates
            // it - but calculateWindowSizeClass() reads LocalConfiguration
            // reactively, so this still recomputes correctly on every
            // such change; nothing here needed to change for that.
            val windowSizeClass = calculateWindowSizeClass(this)
            ZrpSocialApp(windowSizeClass = windowSizeClass)
        }
    }
}

@OptIn(ExperimentalMaterial3WindowSizeClassApi::class)
@Composable
fun ZrpSocialApp(windowSizeClass: WindowSizeClass) {
    // ApiClient.init() already ran in ZrpApplication.onCreate() before
    // this Activity exists, so AuthRepository() is safe to construct
    // here with no context of its own.
    val authViewModel: AuthViewModel = viewModel(
        factory = remember { AuthViewModelFactory(AuthRepository()) },
    )

    val notificationPermissionLauncher = rememberLauncherForActivityResult(
        ActivityResultContracts.RequestPermission(),
    ) { /* Granted or denied, FCM registration itself doesn't depend on
          this - only whether a delivered push actually shows in the
          system tray does (see ZrpFirebaseMessagingService). */ }

    // See GoogleSignInAttemptMarker's own KDoc and AuthViewModel's
    // loginWithGoogle/reportInterruptedGoogleSignIn - this is the one
    // check, run once per fresh app start, that can tell whether the
    // process died mid Google-Sign-In. LaunchedEffect(Unit) re-runs
    // once per fresh Composition (a true cold start, or the rare
    // process-death-and-restore case this exists to catch); it is a
    // no-op on an ordinary configuration-change recreation, since that
    // does not create a new Composition from scratch and the marker is
    // otherwise never left set in the first place.
    val context = LocalContext.current
    LaunchedEffect(Unit) {
        if (GoogleSignInAttemptMarker(context).consumeInterruptedAttempt()) {
            authViewModel.reportInterruptedGoogleSignIn()
        }
    }

    ZrpSocialTheme {
        Surface(modifier = Modifier.fillMaxSize()) {
            val authState by authViewModel.authState.collectAsState()
            val loginForm by authViewModel.loginForm.collectAsState()

            // Android only requires this prompt from API 33 onward, and
            // only once someone is actually signed in - asking before
            // login would be asking for a permission whose whole
            // purpose (showing pushes for an account) doesn't apply yet.
            LaunchedEffect(authState) {
                if (authState is AuthUiState.LoggedIn && Build.VERSION.SDK_INT >= Build.VERSION_CODES.TIRAMISU) {
                    notificationPermissionLauncher.launch(Manifest.permission.POST_NOTIFICATIONS)
                }
            }

            // Captured into a local val rather than switched on directly -
            // authState is a collectAsState() delegate, so each textual
            // reference to it (including inside a `when` branch body) is
            // a fresh read that Kotlin can't smart-cast.
            val currentAuthState = authState
            when (currentAuthState) {
                is AuthUiState.LoggedOut -> {
                    var loggedOutScreen by remember { mutableStateOf(LoggedOutScreen.LOGIN) }
                    when (loggedOutScreen) {
                        LoggedOutScreen.LOGIN -> LoginScreen(
                            formState = loginForm,
                            onLogin = { identifier, password -> authViewModel.login(identifier, password) },
                            onGoogleSignIn = { context -> authViewModel.loginWithGoogle(context) },
                            onSignUp = { loggedOutScreen = LoggedOutScreen.SIGNUP },
                            onForgotPassword = { loggedOutScreen = LoggedOutScreen.FORGOT_PASSWORD },
                        )
                        LoggedOutScreen.SIGNUP -> SignupScreen(
                            authViewModel = authViewModel,
                            onSignIn = { loggedOutScreen = LoggedOutScreen.LOGIN },
                        )
                        LoggedOutScreen.FORGOT_PASSWORD -> ForgotPasswordScreen(
                            onSignIn = { loggedOutScreen = LoggedOutScreen.LOGIN },
                        )
                    }
                }
                is AuthUiState.LoggedIn -> {
                    if (currentAuthState.needsOnboarding) {
                        OnboardingScreen(
                            onAccountMissing = { authViewModel.logoutWithSessionExpired() },
                            onFinished = { authViewModel.onOnboardingFinished() },
                        )
                    } else {
                        ZrpNavHost(
                            onLogout = { authViewModel.logout() },
                            currentUser = currentAuthState.user,
                            windowSizeClass = windowSizeClass,
                        )
                    }
                }
            }
        }
    }
}
