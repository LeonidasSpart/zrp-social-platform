package one.zrp.social.mobile.ui.auth

import android.content.Context
import androidx.compose.foundation.Image
import androidx.compose.foundation.background
import androidx.compose.foundation.layout.Arrangement
import androidx.compose.foundation.layout.Box
import androidx.compose.foundation.layout.Column
import androidx.compose.foundation.layout.Row
import androidx.compose.foundation.layout.Spacer
import androidx.compose.foundation.layout.fillMaxSize
import androidx.compose.foundation.layout.fillMaxWidth
import androidx.compose.foundation.layout.height
import androidx.compose.foundation.layout.padding
import androidx.compose.foundation.layout.size
import androidx.compose.foundation.shape.CircleShape
import androidx.compose.material.icons.Icons
import androidx.compose.material.icons.filled.MailOutline
import androidx.compose.material3.Button
import androidx.compose.material3.ButtonDefaults
import androidx.compose.material3.HorizontalDivider
import androidx.compose.material3.Icon
import androidx.compose.material3.MaterialTheme
import androidx.compose.material3.OutlinedButton
import androidx.compose.material3.Surface
import androidx.compose.material3.Text
import androidx.compose.material3.TextButton
import androidx.compose.runtime.Composable
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.geometry.Offset
import androidx.compose.ui.graphics.Brush
import androidx.compose.ui.graphics.Color
import androidx.compose.ui.platform.LocalContext
import androidx.compose.ui.platform.LocalUriHandler
import androidx.compose.ui.res.painterResource
import androidx.compose.ui.res.stringResource
import androidx.compose.ui.semantics.contentDescription
import androidx.compose.ui.semantics.semantics
import androidx.compose.ui.text.font.FontWeight
import androidx.compose.ui.text.style.TextAlign
import androidx.compose.ui.unit.dp
import androidx.compose.ui.unit.sp
import one.zrp.social.mobile.R
import one.zrp.social.mobile.ui.theme.IconSize
import one.zrp.social.mobile.ui.theme.Spacing
import one.zrp.social.mobile.ui.theme.TouchTarget
import one.zrp.social.mobile.ui.theme.ZrpDeepBlack
import one.zrp.social.mobile.ui.theme.ZrpRed
import one.zrp.social.mobile.ui.theme.ZrpWhite

/**
 * The very first screen a logged-out user sees - a landing/chooser
 * screen matching the reference design's "Welcome" mock, in front of
 * the existing credential-entry LoginScreen/SignupScreen (which are
 * unchanged and still do all the real work). Previously the app opened
 * straight into the login form with no equivalent screen at all.
 *
 * Google sign-in is wired directly here (reusing the exact same
 * AuthViewModel.loginWithGoogle call LoginScreen already makes - see
 * GoogleSignInButton's own KDoc on why that round trip must be driven
 * from viewModelScope, not a composable-scoped coroutine) so a returning
 * user isn't forced through the password form first. Apple is NOT
 * offered here: the reference mock shows an Apple icon, but this native
 * app has no Sign in with Apple implementation at all (web supports it;
 * Android never has) - a real, pre-existing gap, documented rather than
 * faked with a dead button. See the redesign's feature-parity report.
 */
@Composable
fun WelcomeScreen(
    onSignIn: () -> Unit,
    onCreateAccount: () -> Unit,
    onGoogleSignIn: (Context) -> Unit,
) {
    val context = LocalContext.current
    val uriHandler = LocalUriHandler.current

    Box(
        modifier = Modifier
            .fillMaxSize()
            .background(
                Brush.radialGradient(
                    colors = listOf(ZrpRed.copy(alpha = 0.22f), ZrpDeepBlack),
                    center = Offset(0.5f, 0.15f),
                    radius = 1400f,
                ),
            ),
    ) {
        Column(
            modifier = Modifier
                .fillMaxSize()
                .padding(horizontal = Spacing.xl),
            horizontalAlignment = Alignment.CenterHorizontally,
            verticalArrangement = Arrangement.Center,
        ) {
            Image(
                painter = painterResource(id = R.mipmap.ic_launcher_foreground),
                contentDescription = stringResource(R.string.app_name),
                modifier = Modifier.size(96.dp),
            )

            Text(
                text = stringResource(R.string.app_name),
                style = MaterialTheme.typography.displaySmall,
                color = ZrpWhite,
                fontWeight = FontWeight.Black,
                modifier = Modifier.padding(top = Spacing.md),
            )

            Text(
                text = stringResource(R.string.auth_tagline_line1),
                style = MaterialTheme.typography.titleMedium,
                color = ZrpWhite.copy(alpha = 0.85f),
                textAlign = TextAlign.Center,
                modifier = Modifier.padding(top = Spacing.lg),
            )
            Text(
                text = stringResource(R.string.auth_tagline_line2),
                style = MaterialTheme.typography.bodyLarge,
                color = ZrpWhite.copy(alpha = 0.65f),
                textAlign = TextAlign.Center,
            )

            Spacer(Modifier.height(Spacing.xxl))

            Button(
                onClick = onCreateAccount,
                colors = ButtonDefaults.buttonColors(containerColor = ZrpRed),
                modifier = Modifier
                    .fillMaxWidth()
                    .height(TouchTarget.comfortable),
            ) {
                Text(
                    text = stringResource(R.string.auth_create_account),
                    style = MaterialTheme.typography.labelLarge,
                    fontWeight = FontWeight.Bold,
                )
            }

            OutlinedButton(
                onClick = onSignIn,
                colors = ButtonDefaults.outlinedButtonColors(contentColor = ZrpWhite),
                modifier = Modifier
                    .fillMaxWidth()
                    .padding(top = Spacing.md)
                    .height(TouchTarget.comfortable),
            ) {
                Text(
                    text = stringResource(R.string.auth_sign_in),
                    style = MaterialTheme.typography.labelLarge,
                    fontWeight = FontWeight.Bold,
                )
            }

            Text(
                text = stringResource(R.string.auth_or),
                style = MaterialTheme.typography.bodySmall,
                color = ZrpWhite.copy(alpha = 0.5f),
                modifier = Modifier.padding(top = Spacing.lg, bottom = Spacing.md),
            )

            // Confirmed-supported methods only - see this file's own KDoc
            // on why Apple is not one of them.
            Row(horizontalArrangement = Arrangement.spacedBy(Spacing.lg)) {
                WelcomeMethodIcon(
                    contentDescription = stringResource(R.string.auth_continue_with_google),
                    onClick = { onGoogleSignIn(context) },
                ) {
                    Icon(
                        painter = painterResource(id = R.drawable.ic_google),
                        contentDescription = null,
                        tint = Color.Unspecified,
                        modifier = Modifier.size(IconSize.md),
                    )
                }
                WelcomeMethodIcon(
                    contentDescription = stringResource(R.string.auth_continue_with_email),
                    onClick = onSignIn,
                ) {
                    Icon(
                        imageVector = Icons.Filled.MailOutline,
                        contentDescription = null,
                        tint = ZrpWhite,
                        modifier = Modifier.size(IconSize.md),
                    )
                }
            }

            Spacer(Modifier.height(Spacing.xxl))

            Row {
                TextButton(onClick = { uriHandler.openUri("https://zrp.one/privacy") }) {
                    Text(
                        text = stringResource(R.string.auth_footer_privacy),
                        style = MaterialTheme.typography.bodySmall,
                        color = ZrpWhite.copy(alpha = 0.5f),
                    )
                }
                TextButton(onClick = { uriHandler.openUri("https://zrp.one/terms") }) {
                    Text(
                        text = stringResource(R.string.auth_footer_terms),
                        style = MaterialTheme.typography.bodySmall,
                        color = ZrpWhite.copy(alpha = 0.5f),
                    )
                }
                TextButton(onClick = { uriHandler.openUri("https://zrp.one/help") }) {
                    Text(
                        text = stringResource(R.string.nav_help_center),
                        style = MaterialTheme.typography.bodySmall,
                        color = ZrpWhite.copy(alpha = 0.5f),
                    )
                }
            }
        }
    }
}

@Composable
private fun WelcomeMethodIcon(
    contentDescription: String,
    onClick: () -> Unit,
    content: @Composable () -> Unit,
) {
    Surface(
        onClick = onClick,
        shape = CircleShape,
        color = ZrpWhite.copy(alpha = 0.08f),
        modifier = Modifier
            .size(TouchTarget.comfortable)
            .semantics { this.contentDescription = contentDescription },
    ) {
        Box(contentAlignment = Alignment.Center, modifier = Modifier.fillMaxSize()) {
            content()
        }
    }
}
