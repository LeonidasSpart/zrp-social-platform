package one.zrp.social.mobile.util

import androidx.compose.runtime.Composable
import androidx.compose.ui.res.stringResource
import one.zrp.social.mobile.R
import one.zrp.social.mobile.data.ZrpErrors

/**
 * Repositories and ViewModels across the app have no Context to
 * resolve a localized string themselves (see AuthViewModel's own
 * SessionExpired/GoogleInterrupted comments for the same constraint),
 * so a handful of purely client-side failures - a network exception
 * with no server response, blank-field validation, a password
 * mismatch - end up as fixed English literals sitting in an
 * `error: String?`/`message: String` field. Those literals then render
 * as-is via `Text(state.error)` in every language, since they were
 * never real translation keys to begin with and the automated
 * completeness test has no way to see them.
 *
 * This maps that fixed, known set of literals back to the real,
 * translated string resource at the one place that DOES have a
 * Context - the Composable render site - and returns every other
 * message (a genuine, server-provided error, which must never be
 * silently altered) completely unchanged. Wrap any existing
 * `Text(someState.error)` as `Text(localizedError(someState.error) ?: "")`
 * to pick this up; it is always a safe, additive no-op for messages it
 * doesn't recognize.
 */
@Composable
fun localizedError(message: String?): String? = when (message) {
    null -> null
    ZrpErrors.NETWORK -> stringResource(R.string.auth_err_network)
    "Something went wrong. Please try again." -> stringResource(R.string.auth_err_try_again)
    "Registration failed. Please try again later." -> stringResource(R.string.auth_registration_failed)
    "Enter your email or username and password." -> stringResource(R.string.auth_enter_email_username_password)
    "That username is taken. Pick a suggestion below or try another." -> stringResource(R.string.auth_username_taken_hint)
    "Please fill in all fields." -> stringResource(R.string.settings_err_fill_all_fields)
    "New password must be at least 6 characters." -> stringResource(R.string.settings_err_password_min_length)
    "New passwords don't match." -> stringResource(R.string.settings_err_passwords_dont_match)
    "Password updated successfully." -> stringResource(R.string.settings_success_password_updated)
    "AI service temporarily unavailable" -> stringResource(R.string.ai_service_unavailable)
    "Couldn't play this track." -> stringResource(R.string.music_couldnt_play_track)
    else -> message
}
