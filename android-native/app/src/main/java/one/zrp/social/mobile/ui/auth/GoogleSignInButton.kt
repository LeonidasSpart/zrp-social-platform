package one.zrp.social.mobile.ui.auth

import android.content.Context
import androidx.compose.foundation.layout.fillMaxWidth
import androidx.compose.foundation.layout.height
import androidx.compose.foundation.layout.padding
import androidx.compose.foundation.layout.size
import androidx.compose.material3.CircularProgressIndicator
import androidx.compose.material3.Icon
import androidx.compose.material3.OutlinedButton
import androidx.compose.material3.Text
import androidx.compose.runtime.Composable
import androidx.compose.ui.Modifier
import androidx.compose.ui.graphics.Color
import androidx.compose.ui.platform.LocalContext
import androidx.compose.ui.res.painterResource
import androidx.compose.ui.res.stringResource
import androidx.compose.ui.unit.dp
import one.zrp.social.mobile.R

/**
 * Shared between LoginScreen and SignupScreen - both a returning user
 * and a new one authenticate the same way (find-or-create is handled
 * server-side, see /mobile/auth/google's own comment), so there's only
 * one Google button implementation, not two.
 *
 * Deliberately owns no state of its own (no local loading/error): the
 * ENTIRE Google sign-in round trip - the Credential Manager request and
 * the backend token exchange - is driven by AuthViewModel.loginWithGoogle
 * on viewModelScope, not by a coroutine scoped to this composable's own
 * lifetime. See that function's own comment for why that distinction is
 * what actually fixes "select an account, then nothing happens" - a
 * rememberCoroutineScope() here would be torn down (silently discarding
 * an in-flight request) by any Activity recreation, which the system
 * account picker can trigger. `loading` and the error text both come
 * from the caller's shared LoginFormState, the same state password
 * login already drives, so both methods render Submitting/Error
 * identically.
 */
@Composable
fun GoogleSignInButton(enabled: Boolean, loading: Boolean, onClick: (Context) -> Unit) {
    val context = LocalContext.current

    OutlinedButton(
        onClick = { if (!loading) onClick(context) },
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
}
