package one.zrp.social.mobile.ui.auth

import androidx.compose.foundation.layout.Arrangement
import androidx.compose.foundation.layout.Box
import androidx.compose.foundation.layout.Column
import androidx.compose.foundation.layout.Row
import androidx.compose.foundation.layout.fillMaxSize
import androidx.compose.foundation.layout.fillMaxWidth
import androidx.compose.foundation.layout.height
import androidx.compose.foundation.layout.imePadding
import androidx.compose.foundation.layout.padding
import androidx.compose.foundation.layout.size
import androidx.compose.foundation.rememberScrollState
import androidx.compose.foundation.text.KeyboardOptions
import androidx.compose.foundation.verticalScroll
import androidx.compose.material.icons.Icons
import androidx.compose.material.icons.filled.Check
import androidx.compose.material.icons.filled.Close
import androidx.compose.material.icons.filled.Visibility
import androidx.compose.material.icons.filled.VisibilityOff
import androidx.compose.material3.Button
import androidx.compose.material3.ButtonDefaults
import androidx.compose.material3.CircularProgressIndicator
import androidx.compose.material3.ExperimentalMaterial3Api
import androidx.compose.material3.Icon
import androidx.compose.material3.IconButton
import androidx.compose.material3.MaterialTheme
import androidx.compose.material3.OutlinedButton
import androidx.compose.material3.OutlinedTextField
import androidx.compose.material3.Text
import androidx.compose.material3.TextButton
import androidx.compose.runtime.Composable
import androidx.compose.runtime.collectAsState
import androidx.compose.runtime.getValue
import androidx.compose.runtime.mutableStateOf
import androidx.compose.runtime.remember
import androidx.compose.runtime.setValue
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.res.stringResource
import androidx.compose.ui.text.input.KeyboardType
import androidx.compose.ui.text.input.PasswordVisualTransformation
import androidx.compose.ui.text.input.VisualTransformation
import androidx.compose.ui.unit.dp
import androidx.lifecycle.viewmodel.compose.viewModel
import one.zrp.social.mobile.R
import one.zrp.social.mobile.data.AuthRepository
import one.zrp.social.mobile.ui.theme.ZrpRed

/**
 * The mobile app's own account-creation screen - a real Compose UI
 * calling the same real, shared POST /auth/register and GET
 * /auth/check-username the website's own /signup page uses (no
 * mobile-specific registration endpoint exists, since creating an
 * account needs no session cookie). Google sign-up shares
 * GoogleSignInButton with LoginScreen - the same find-or-create backend
 * call handles both a new and a returning account (see
 * /mobile/auth/google's own comment), so there's no separate "sign up
 * with Google" request to make. Apple sign-up remains a disclosed
 * follow-up.
 */
@OptIn(ExperimentalMaterial3Api::class)
@Composable
fun SignupScreen(authViewModel: AuthViewModel, onSignIn: () -> Unit) {
    val viewModel: SignupViewModel = viewModel(
        factory = remember(authViewModel) { SignupViewModelFactory(AuthRepository(), authViewModel) },
    )
    val state by viewModel.state.collectAsState()
    var passwordVisible by remember { mutableStateOf(false) }

    val registeredEmail = state.registeredEmail
    if (registeredEmail != null) {
        SignupSuccessContent(state = state, registeredEmail = registeredEmail, viewModel = viewModel, onSignIn = onSignIn)
        return
    }

    Column(
        modifier = Modifier
            .fillMaxSize()
            .verticalScroll(rememberScrollState())
            .imePadding()
            .padding(horizontal = 32.dp, vertical = 24.dp),
        horizontalAlignment = Alignment.CenterHorizontally,
        verticalArrangement = Arrangement.Center,
    ) {
        Text(
            text = stringResource(R.string.auth_welcome_title),
            style = MaterialTheme.typography.titleLarge,
        )
        Text(
            text = stringResource(R.string.auth_join_community),
            style = MaterialTheme.typography.bodyMedium,
            color = MaterialTheme.colorScheme.onSurfaceVariant,
            modifier = Modifier.padding(top = 4.dp, bottom = 24.dp),
        )

        OutlinedTextField(
            value = state.name,
            onValueChange = viewModel::onNameChange,
            label = { Text(stringResource(R.string.auth_full_name)) },
            singleLine = true,
            enabled = !state.isSubmitting,
            modifier = Modifier.fillMaxWidth(),
        )

        OutlinedTextField(
            value = state.username,
            onValueChange = viewModel::onUsernameChange,
            label = { Text(stringResource(R.string.auth_username)) },
            singleLine = true,
            enabled = !state.isSubmitting,
            trailingIcon = {
                when (state.usernameStatus) {
                    UsernameStatus.CHECKING -> CircularProgressIndicator(modifier = Modifier.size(18.dp), strokeWidth = 2.dp)
                    UsernameStatus.AVAILABLE -> Icon(Icons.Filled.Check, contentDescription = null, tint = MaterialTheme.colorScheme.primary)
                    UsernameStatus.TAKEN, UsernameStatus.INVALID -> Icon(Icons.Filled.Close, contentDescription = null, tint = MaterialTheme.colorScheme.error)
                    UsernameStatus.IDLE -> {}
                }
            },
            modifier = Modifier
                .fillMaxWidth()
                .padding(top = 12.dp),
        )

        if (state.usernameStatus == UsernameStatus.INVALID && state.username.isNotBlank()) {
            Text(
                // Byte-matches SignupPage.tsx's own hardcoded, untranslated
                // inline hint under the username field.
                text = "3-20 characters, letters/numbers/underscores only",
                color = MaterialTheme.colorScheme.error,
                style = MaterialTheme.typography.labelSmall,
                modifier = Modifier.fillMaxWidth().padding(top = 2.dp),
            )
        }

        if (state.usernameStatus == UsernameStatus.TAKEN) {
            Text(
                text = "That username is taken.",
                color = MaterialTheme.colorScheme.error,
                style = MaterialTheme.typography.labelSmall,
                modifier = Modifier.fillMaxWidth().padding(top = 2.dp),
            )
            if (state.usernameSuggestions.isNotEmpty()) {
                Row(
                    modifier = Modifier.fillMaxWidth().padding(top = 4.dp),
                    horizontalArrangement = Arrangement.spacedBy(8.dp),
                ) {
                    state.usernameSuggestions.forEach { suggestion ->
                        OutlinedButton(onClick = { viewModel.onSelectSuggestion(suggestion) }) {
                            Text(suggestion, style = MaterialTheme.typography.labelMedium)
                        }
                    }
                }
            }
        }

        OutlinedTextField(
            value = state.email,
            onValueChange = viewModel::onEmailChange,
            label = { Text(stringResource(R.string.auth_email)) },
            singleLine = true,
            enabled = !state.isSubmitting,
            keyboardOptions = KeyboardOptions(keyboardType = KeyboardType.Email),
            modifier = Modifier
                .fillMaxWidth()
                .padding(top = 12.dp),
        )

        OutlinedTextField(
            value = state.password,
            onValueChange = viewModel::onPasswordChange,
            label = { Text(stringResource(R.string.auth_create_password)) },
            singleLine = true,
            enabled = !state.isSubmitting,
            visualTransformation = if (passwordVisible) VisualTransformation.None else PasswordVisualTransformation(),
            keyboardOptions = KeyboardOptions(keyboardType = KeyboardType.Password),
            trailingIcon = {
                IconButton(onClick = { passwordVisible = !passwordVisible }) {
                    // English-only on purpose, matching LoginScreen's own
                    // native-only show/hide toggle - the website has no
                    // such control on either its login or signup form.
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
        Text(
            text = stringResource(R.string.auth_password_min_length),
            style = MaterialTheme.typography.labelSmall,
            color = MaterialTheme.colorScheme.onSurfaceVariant,
            modifier = Modifier.fillMaxWidth().padding(top = 2.dp),
        )

        if (state.error != null) {
            Text(
                text = state.error ?: "",
                color = MaterialTheme.colorScheme.error,
                style = MaterialTheme.typography.bodyMedium,
                modifier = Modifier.padding(top = 12.dp),
            )
        }

        Button(
            onClick = { viewModel.submit() },
            enabled = !state.isSubmitting && state.usernameStatus != UsernameStatus.CHECKING,
            colors = ButtonDefaults.buttonColors(containerColor = ZrpRed),
            modifier = Modifier
                .fillMaxWidth()
                .padding(top = 24.dp)
                .height(50.dp),
        ) {
            if (state.isSubmitting) {
                CircularProgressIndicator(
                    modifier = Modifier.size(20.dp),
                    color = MaterialTheme.colorScheme.onPrimary,
                    strokeWidth = 2.dp,
                )
                Text(
                    text = stringResource(R.string.auth_creating_account),
                    modifier = Modifier.padding(start = 8.dp),
                )
            } else {
                Text(stringResource(R.string.auth_create_account))
            }
        }

        Text(
            text = stringResource(R.string.auth_or),
            style = MaterialTheme.typography.bodySmall,
            color = MaterialTheme.colorScheme.onSurfaceVariant,
            modifier = Modifier.padding(top = 16.dp),
        )

        GoogleSignInButton(
            enabled = !state.isSubmitting,
            onIdToken = { idToken -> authViewModel.loginWithGoogle(idToken) },
        )

        Row(modifier = Modifier.padding(top = 16.dp)) {
            Text(
                text = stringResource(R.string.auth_already_have_account) + " ",
                style = MaterialTheme.typography.bodyMedium,
                color = MaterialTheme.colorScheme.onSurfaceVariant,
            )
            TextButton(onClick = onSignIn) {
                Text(stringResource(R.string.auth_sign_in))
            }
        }
    }
}

@Composable
private fun SignupSuccessContent(
    state: SignupUiState,
    registeredEmail: String,
    viewModel: SignupViewModel,
    onSignIn: () -> Unit,
) {
    Box(modifier = Modifier.fillMaxSize().padding(32.dp), contentAlignment = Alignment.Center) {
        Column(horizontalAlignment = Alignment.CenterHorizontally) {
            Text(
                text = stringResource(R.string.auth_signup_success_title),
                style = MaterialTheme.typography.titleLarge,
            )
            Text(
                text = stringResource(R.string.auth_signup_success_body, registeredEmail),
                style = MaterialTheme.typography.bodyMedium,
                color = MaterialTheme.colorScheme.onSurfaceVariant,
                modifier = Modifier.padding(top = 12.dp),
            )

            TextButton(onClick = { viewModel.resendVerification() }, enabled = !state.isResending) {
                Text(
                    if (state.isResending) {
                        stringResource(R.string.auth_resend_verification_sending)
                    } else {
                        stringResource(R.string.auth_resend_verification)
                    },
                )
            }

            val resendKind = state.resendMessageKind
            if (resendKind != null) {
                Text(
                    text = when (resendKind) {
                        ResendMessageKind.SUCCESS -> stringResource(R.string.auth_resend_verification_success)
                        ResendMessageKind.ALREADY_VERIFIED -> stringResource(R.string.auth_resend_verification_already_verified)
                        ResendMessageKind.ERROR -> stringResource(R.string.auth_resend_verification_error)
                    },
                    style = MaterialTheme.typography.labelSmall,
                    color = if (resendKind == ResendMessageKind.SUCCESS) {
                        MaterialTheme.colorScheme.primary
                    } else {
                        MaterialTheme.colorScheme.error
                    },
                )
            }

            TextButton(onClick = onSignIn, modifier = Modifier.padding(top = 16.dp)) {
                Text(stringResource(R.string.auth_sign_in))
            }
        }
    }
}
