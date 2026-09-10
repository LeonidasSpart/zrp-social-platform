package one.zrp.social.mobile.ui.auth

import android.content.Context
import androidx.compose.foundation.Image
import androidx.compose.foundation.layout.Arrangement
import androidx.compose.foundation.layout.Column
import androidx.compose.foundation.layout.Row
import androidx.compose.foundation.layout.fillMaxSize
import androidx.compose.foundation.layout.fillMaxWidth
import androidx.compose.foundation.layout.height
import androidx.compose.foundation.layout.padding
import androidx.compose.foundation.layout.size
import androidx.compose.foundation.layout.imePadding
import androidx.compose.foundation.rememberScrollState
import androidx.compose.foundation.text.KeyboardOptions
import androidx.compose.foundation.verticalScroll
import androidx.compose.material.icons.Icons
import androidx.compose.material.icons.filled.Visibility
import androidx.compose.material.icons.filled.VisibilityOff
import androidx.compose.material3.Button
import androidx.compose.material3.ButtonDefaults
import androidx.compose.material3.CircularProgressIndicator
import androidx.compose.material3.ExperimentalMaterial3Api
import androidx.compose.material3.Icon
import androidx.compose.material3.IconButton
import androidx.compose.material3.MaterialTheme
import androidx.compose.material3.OutlinedTextField
import androidx.compose.material3.Text
import androidx.compose.material3.TextButton
import androidx.compose.runtime.Composable
import androidx.compose.runtime.getValue
import androidx.compose.runtime.mutableStateOf
import androidx.compose.runtime.remember
import androidx.compose.runtime.saveable.rememberSaveable
import androidx.compose.runtime.setValue
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.res.painterResource
import androidx.compose.ui.res.stringResource
import androidx.compose.ui.text.input.KeyboardType
import androidx.compose.ui.text.input.PasswordVisualTransformation
import androidx.compose.ui.text.input.VisualTransformation
import androidx.compose.ui.unit.dp
import one.zrp.social.mobile.R
import one.zrp.social.mobile.ui.theme.ZrpRed

/**
 * The mobile app's own sign-in screen - a real Compose UI calling the
 * real backend (POST /mobile/auth/login), not a copy of the website's
 * /login page and not a WebView pointed at it.
 */
@OptIn(ExperimentalMaterial3Api::class)
@Composable
fun LoginScreen(
    formState: LoginFormState,
    onLogin: (identifier: String, password: String) -> Unit,
    onGoogleSignIn: (Context) -> Unit,
    onSignUp: () -> Unit,
    onForgotPassword: () -> Unit,
) {
    var identifier by rememberSaveable { mutableStateOf("") }
    var password by rememberSaveable { mutableStateOf("") }
    var passwordVisible by remember { mutableStateOf(false) }
    // Password and Google sign-in are distinct LoginFormState variants
    // (see AuthViewModel's own comment) so each button's spinner
    // reflects only the action it was actually asked to perform, while
    // formBusy still disables the whole form during either.
    val passwordSubmitting = formState is LoginFormState.Submitting
    val googleSubmitting = formState is LoginFormState.SubmittingGoogle
    val isSubmitting = passwordSubmitting || googleSubmitting

    Column(
        modifier = Modifier
            .fillMaxSize()
            .verticalScroll(rememberScrollState())
            .imePadding()
            .padding(horizontal = 32.dp),
        horizontalAlignment = Alignment.CenterHorizontally,
        verticalArrangement = Arrangement.Center,
    ) {
        Image(
            painter = painterResource(id = R.mipmap.ic_launcher_foreground),
            contentDescription = stringResource(R.string.app_name),
            modifier = Modifier.size(72.dp),
        )

        Text(
            text = stringResource(R.string.auth_sign_in),
            style = MaterialTheme.typography.titleLarge,
            modifier = Modifier.padding(top = 16.dp),
        )
        Text(
            text = stringResource(R.string.auth_sign_in_subtitle),
            style = MaterialTheme.typography.bodyMedium,
            color = MaterialTheme.colorScheme.onSurfaceVariant,
            modifier = Modifier.padding(top = 4.dp, bottom = 32.dp),
        )

        OutlinedTextField(
            value = identifier,
            onValueChange = { identifier = it },
            label = { Text(stringResource(R.string.auth_email_or_username)) },
            singleLine = true,
            enabled = !isSubmitting,
            keyboardOptions = KeyboardOptions(keyboardType = KeyboardType.Email),
            modifier = Modifier.fillMaxWidth(),
        )

        OutlinedTextField(
            value = password,
            onValueChange = { password = it },
            label = { Text(stringResource(R.string.auth_password)) },
            singleLine = true,
            enabled = !isSubmitting,
            visualTransformation = if (passwordVisible) VisualTransformation.None else PasswordVisualTransformation(),
            keyboardOptions = KeyboardOptions(keyboardType = KeyboardType.Password),
            trailingIcon = {
                IconButton(onClick = { passwordVisible = !passwordVisible }) {
                    // Web's own login page has no show/hide-password toggle
                    // at all, so there's no web string to source this from -
                    // translated as native-only supporting copy instead.
                    Icon(
                        imageVector = if (passwordVisible) Icons.Filled.VisibilityOff else Icons.Filled.Visibility,
                        contentDescription = stringResource(if (passwordVisible) R.string.action_hide_password else R.string.action_show_password),
                    )
                }
            },
            modifier = Modifier
                .fillMaxWidth()
                .padding(top = 12.dp),
        )

        Row(modifier = Modifier.fillMaxWidth(), horizontalArrangement = Arrangement.End) {
            TextButton(onClick = onForgotPassword) {
                Text(stringResource(R.string.auth_forgot_password))
            }
        }

        if (formState is LoginFormState.Error) {
            Text(
                text = formState.message,
                color = MaterialTheme.colorScheme.error,
                style = MaterialTheme.typography.bodyMedium,
                modifier = Modifier.padding(top = 12.dp),
            )
        } else if (formState is LoginFormState.SessionExpired) {
            Text(
                text = stringResource(R.string.auth_err_session_expired),
                color = MaterialTheme.colorScheme.error,
                style = MaterialTheme.typography.bodyMedium,
                modifier = Modifier.padding(top = 12.dp),
            )
        }

        Button(
            onClick = { onLogin(identifier, password) },
            enabled = !isSubmitting,
            colors = ButtonDefaults.buttonColors(containerColor = ZrpRed),
            modifier = Modifier
                .fillMaxWidth()
                .padding(top = 24.dp)
                .height(50.dp),
        ) {
            if (passwordSubmitting) {
                CircularProgressIndicator(
                    modifier = Modifier.size(20.dp),
                    color = MaterialTheme.colorScheme.onPrimary,
                    strokeWidth = 2.dp,
                )
                Text(
                    text = stringResource(R.string.auth_signing_in),
                    modifier = Modifier.padding(start = 8.dp),
                )
            } else {
                Text(stringResource(R.string.auth_sign_in))
            }
        }

        Text(
            text = stringResource(R.string.auth_or),
            style = MaterialTheme.typography.bodySmall,
            color = MaterialTheme.colorScheme.onSurfaceVariant,
            modifier = Modifier.padding(top = 16.dp),
        )

        GoogleSignInButton(enabled = !isSubmitting, loading = googleSubmitting, onClick = onGoogleSignIn)

        Row(modifier = Modifier.padding(top = 16.dp)) {
            Text(
                text = stringResource(R.string.auth_no_account) + " ",
                style = MaterialTheme.typography.bodyMedium,
                color = MaterialTheme.colorScheme.onSurfaceVariant,
            )
            TextButton(onClick = onSignUp) {
                Text(stringResource(R.string.auth_sign_up))
            }
        }
    }
}
