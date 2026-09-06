package one.zrp.social.mobile

import android.Manifest
import android.os.Build
import android.os.Bundle
import androidx.activity.ComponentActivity
import androidx.activity.compose.rememberLauncherForActivityResult
import androidx.activity.compose.setContent
import androidx.activity.enableEdgeToEdge
import androidx.activity.result.contract.ActivityResultContracts
import androidx.compose.foundation.layout.fillMaxSize
import androidx.compose.material3.Surface
import androidx.compose.runtime.Composable
import androidx.compose.runtime.LaunchedEffect
import androidx.compose.runtime.collectAsState
import androidx.compose.runtime.getValue
import androidx.compose.runtime.mutableStateOf
import androidx.compose.runtime.remember
import androidx.compose.runtime.setValue
import androidx.compose.ui.Modifier
import androidx.lifecycle.viewmodel.compose.viewModel
import one.zrp.social.mobile.data.AuthRepository
import one.zrp.social.mobile.ui.auth.AuthUiState
import one.zrp.social.mobile.ui.auth.AuthViewModel
import one.zrp.social.mobile.ui.auth.AuthViewModelFactory
import one.zrp.social.mobile.ui.auth.LoginScreen
import one.zrp.social.mobile.ui.auth.SignupScreen
import one.zrp.social.mobile.ui.navigation.ZrpNavHost
import one.zrp.social.mobile.ui.theme.ZrpSocialTheme

class MainActivity : ComponentActivity() {
    override fun onCreate(savedInstanceState: Bundle?) {
        super.onCreate(savedInstanceState)
        enableEdgeToEdge()
        setContent {
            ZrpSocialApp()
        }
    }
}

@Composable
fun ZrpSocialApp() {
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

            when (authState) {
                is AuthUiState.LoggedOut -> {
                    var showSignup by remember { mutableStateOf(false) }
                    if (showSignup) {
                        SignupScreen(
                            authViewModel = authViewModel,
                            onSignIn = { showSignup = false },
                        )
                    } else {
                        LoginScreen(
                            formState = loginForm,
                            onLogin = { identifier, password -> authViewModel.login(identifier, password) },
                            onSignUp = { showSignup = true },
                        )
                    }
                }
                is AuthUiState.LoggedIn -> ZrpNavHost(onLogout = { authViewModel.logout() })
            }
        }
    }
}
