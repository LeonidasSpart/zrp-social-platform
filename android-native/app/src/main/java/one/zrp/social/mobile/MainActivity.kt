package one.zrp.social.mobile

import android.os.Bundle
import androidx.activity.ComponentActivity
import androidx.activity.compose.setContent
import androidx.activity.enableEdgeToEdge
import androidx.compose.foundation.layout.fillMaxSize
import androidx.compose.material3.Surface
import androidx.compose.runtime.Composable
import androidx.compose.runtime.collectAsState
import androidx.compose.runtime.getValue
import androidx.compose.ui.Modifier
import androidx.lifecycle.viewmodel.compose.viewModel
import one.zrp.social.mobile.data.AuthRepository
import one.zrp.social.mobile.ui.auth.AuthUiState
import one.zrp.social.mobile.ui.auth.AuthViewModel
import one.zrp.social.mobile.ui.auth.AuthViewModelFactory
import one.zrp.social.mobile.ui.auth.LoginScreen
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
    val authViewModel: AuthViewModel = viewModel(factory = AuthViewModelFactory(AuthRepository()))

    ZrpSocialTheme {
        Surface(modifier = Modifier.fillMaxSize()) {
            val authState by authViewModel.authState.collectAsState()
            val loginForm by authViewModel.loginForm.collectAsState()

            when (authState) {
                is AuthUiState.LoggedOut -> LoginScreen(
                    formState = loginForm,
                    onLogin = { identifier, password -> authViewModel.login(identifier, password) },
                )
                is AuthUiState.LoggedIn -> ZrpNavHost()
            }
        }
    }
}
