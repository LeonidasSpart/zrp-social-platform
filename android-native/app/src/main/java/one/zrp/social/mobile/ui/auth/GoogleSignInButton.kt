package one.zrp.social.mobile.ui.auth

import androidx.compose.foundation.layout.Column
import androidx.compose.foundation.layout.fillMaxWidth
import androidx.compose.foundation.layout.height
import androidx.compose.foundation.layout.padding
import androidx.compose.foundation.layout.size
import androidx.compose.material3.CircularProgressIndicator
import androidx.compose.material3.Icon
import androidx.compose.material3.MaterialTheme
import androidx.compose.material3.OutlinedButton
import androidx.compose.material3.Text
import androidx.compose.runtime.Composable
import androidx.compose.runtime.getValue
import androidx.compose.runtime.mutableStateOf
import androidx.compose.runtime.remember
import androidx.compose.runtime.rememberCoroutineScope
import androidx.compose.runtime.setValue
import androidx.compose.ui.Modifier
import androidx.compose.ui.graphics.Color
import androidx.compose.ui.platform.LocalContext
import androidx.compose.ui.res.painterResource
import androidx.compose.ui.res.stringResource
import androidx.compose.ui.unit.dp
import kotlinx.coroutines.launch
import one.zrp.social.mobile.R
import one.zrp.social.mobile.data.GoogleAuth
import one.zrp.social.mobile.data.GoogleSignInCancelledException

/**
 * Shared between LoginScreen and SignupScreen - both a returning user
 * and a new one authenticate the same way (find-or-create is handled
 * server-side, see /mobile/auth/google's own comment), so there's only
 * one Google button implementation, not two. Owns the Credential
 * Manager round trip itself; the caller only receives a real ID token
 * on success (onIdToken), matching how onLogin/viewModel.submit() are
 * only ever invoked with already-validated input.
 */
@Composable
fun GoogleSignInButton(enabled: Boolean, onIdToken: (String) -> Unit) {
    val context = LocalContext.current
    val scope = rememberCoroutineScope()
    var loading by remember { mutableStateOf(false) }
    var error by remember { mutableStateOf<String?>(null) }

    Column(modifier = Modifier.fillMaxWidth()) {
        OutlinedButton(
            onClick = {
                if (loading) return@OutlinedButton
                error = null
                loading = true
                scope.launch {
                    GoogleAuth.requestIdToken(context)
                        .onSuccess { token -> onIdToken(token) }
                        .onFailure { failure ->
                            if (failure !is GoogleSignInCancelledException) {
                                error = failure.message ?: "Something went wrong. Please try again."
                            }
                        }
                    loading = false
                }
            },
            enabled = enabled && !loading,
            modifier = Modifier
                .fillMaxWidth()
                .height(50.dp)
                .padding(top = 12.dp),
        ) {
            if (loading) {
                CircularProgressIndicator(modifier = Modifier.size(20.dp), strokeWidth = 2.dp)
            } else {
                Icon(
                    painter = painterResource(id = R.drawable.ic_google),
                    contentDescription = null,
                    tint = Color.Unspecified,
                    modifier = Modifier.size(20.dp),
                )
                Text(
                    text = stringResource(R.string.auth_continue_with_google),
                    modifier = Modifier.padding(start = 12.dp),
                )
            }
        }

        val currentError = error
        if (currentError != null) {
            Text(
                text = currentError,
                color = MaterialTheme.colorScheme.error,
                style = MaterialTheme.typography.bodyMedium,
                modifier = Modifier.padding(top = 8.dp),
            )
        }
    }
}
