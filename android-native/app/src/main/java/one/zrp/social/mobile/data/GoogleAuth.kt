package one.zrp.social.mobile.data

import android.content.Context
import android.util.Log
import androidx.credentials.CredentialManager
import androidx.credentials.GetCredentialRequest
import androidx.credentials.exceptions.GetCredentialCancellationException
import androidx.credentials.exceptions.GetCredentialException
import androidx.credentials.exceptions.NoCredentialException
import com.google.android.libraries.identity.googleid.GetGoogleIdOption
import com.google.android.libraries.identity.googleid.GetSignInWithGoogleOption
import com.google.android.libraries.identity.googleid.GoogleIdTokenCredential
import com.google.android.libraries.identity.googleid.GoogleIdTokenParsingException
import one.zrp.social.mobile.BuildConfig

class GoogleSignInCancelledException : Exception()

/**
 * Native Google Sign-In via Android's Credential Manager - the account
 * picker returns a signed Google ID token directly, no browser redirect
 * (see build.gradle's own comment on why this differs from the
 * Capacitor app's system-browser nativeGoogleSignIn()). The token is
 * verified server-side by POST /mobile/auth/google against the same
 * GOOGLE_CLIENT_ID web's own GoogleProvider trusts - this class does no
 * verification of its own, it only obtains the token.
 */
object GoogleAuth {

    /**
     * Two requests, deliberately, because they fail for different reasons.
     *
     * GetGoogleIdOption is the quiet one: it asks Credential Manager for
     * an ID token and, even with setFilterByAuthorizedAccounts(false),
     * it can answer NoCredentialException on a device that plainly does
     * have Google accounts signed in - a provider that has not finished
     * syncing, a work profile, a restricted profile, an account the
     * picker declines to offer. That is exactly the report we had:
     * "Google Sign-In couldn't find an account to use" from testers with
     * several accounts configured.
     *
     * GetSignInWithGoogleOption is the explicit one, the request behind
     * a literal "Sign in with Google" button. It launches the account
     * chooser rather than asking whether a credential is already
     * available, so it succeeds in most of the cases above. It is
     * Google's own documented fallback for this exact situation, and it
     * is second here only because it always shows UI - the quiet path
     * is a better first experience when it works.
     */
    private suspend fun requestWith(
        context: Context,
        request: GetCredentialRequest,
    ): String {
        val result = CredentialManager.create(context).getCredential(context, request)
        return GoogleIdTokenCredential.createFrom(result.credential.data).idToken
    }

    suspend fun requestIdToken(context: Context): Result<String> {
        val serverClientId = BuildConfig.GOOGLE_WEB_CLIENT_ID

        // Checked before the call, not inferred from the failure. With an
        // empty server client id Credential Manager answers
        // NoCredentialException - the same exception a device with no
        // usable account produces - and the old code reported that as
        // "make sure a Google account is set up on this device". That
        // sent real-device testing after the tester's Google accounts
        // when the actual cause was a build with the GOOGLE_WEB_CLIENT_ID
        // repo secret missing (see .github/workflows/
        // android-native-build.yml, which passes it to Gradle). This
        // case is knowable up front, so it says what it is.
        if (serverClientId.isBlank()) {
            Log.e(
                "GoogleAuth",
                "GOOGLE_WEB_CLIENT_ID is empty in this build - the GOOGLE_WEB_CLIENT_ID " +
                    "repo secret was not passed to Gradle. Google Sign-In cannot work in " +
                    "this APK/AAB; email sign-in is unaffected.",
            )
            return Result.failure(
                Exception("Google Sign-In isn't available in this build. Please use email sign-in.")
            )
        }

        val quiet = GetCredentialRequest.Builder()
            .addCredentialOption(
                GetGoogleIdOption.Builder()
                    .setFilterByAuthorizedAccounts(false)
                    .setServerClientId(serverClientId)
                    .build()
            )
            .build()

        val explicit = GetCredentialRequest.Builder()
            .addCredentialOption(
                GetSignInWithGoogleOption.Builder(serverClientId).build()
            )
            .build()

        return try {
            val token = requestWith(context, quiet)
            // Deliberately logged on success too, not just failure - see
            // this class's own KDoc and AuthViewModel.loginWithGoogle's
            // comment on why "the picker closed, then silence" is
            // otherwise indistinguishable between three very different
            // points of failure (Credential Manager itself, the
            // /mobile/auth/google call, or the app's own post-login
            // navigation). Length only, never the token itself.
            Log.d("GoogleAuth", "ID token obtained via GetGoogleIdOption (quiet), length=${token.length}")
            Result.success(token)
        } catch (e: GetCredentialCancellationException) {
            Result.failure(GoogleSignInCancelledException())
        } catch (e: NoCredentialException) {
            Log.w(
                "GoogleAuth",
                "No credential from GetGoogleIdOption - retrying with the explicit " +
                    "Sign in with Google chooser.",
                e,
            )
            try {
                val token = requestWith(context, explicit)
                Log.d("GoogleAuth", "ID token obtained via GetSignInWithGoogleOption (explicit), length=${token.length}")
                Result.success(token)
            } catch (retry: GetCredentialCancellationException) {
                Result.failure(GoogleSignInCancelledException())
            } catch (retry: GoogleIdTokenParsingException) {
                Result.failure(Exception("Couldn't verify that Google account. Please try again."))
            } catch (retry: GetCredentialException) {
                // Both paths refused. Either the device genuinely has no
                // usable Google account, or this build's signing
                // certificate has no matching Android OAuth client in the
                // same Google Cloud project as serverClientId, or
                // serverClientId is not a Web-type client in that project
                // (see /api/mobile/auth/google/route.ts on why the last
                // one is easy to get wrong). This layer cannot tell those
                // apart, so the message no longer asserts which it is.
                Log.e(
                    "GoogleAuth",
                    "Both credential requests failed. Configured GOOGLE_WEB_CLIENT_ID: " +
                        serverClientId,
                    retry,
                )
                Result.failure(Exception(noAccountMessage(serverClientId)))
            }
        } catch (e: GoogleIdTokenParsingException) {
            Result.failure(Exception("Couldn't verify that Google account. Please try again."))
        } catch (e: GetCredentialException) {
            // Every other Credential Manager-level failure (provider
            // configuration, interrupted, unsupported) - still not a
            // network problem, so this gets its own message rather than
            // sharing the generic one below.
            Result.failure(Exception("Google Sign-In isn't available right now. Please try again or use email instead."))
        } catch (e: Exception) {
            // Genuinely anything else (a real IOException reaching
            // Google's own servers, etc.) - the only case this message
            // is actually accurate for.
            Result.failure(Exception("Couldn't reach Google. Check your connection and try again."))
        }
    }

    /**
     * The configured client id is not a secret (OAuth client IDs are
     * public identifiers, unlike a client secret) and an Internal
     * Testing tester has no logcat, so debug builds still carry it in
     * the visible message - it turns "is the secret set?" into something
     * a tester can answer from the screen. A release build shows the
     * plain sentence: a shipped app must not put build configuration in
     * front of an ordinary user.
     */
    private fun noAccountMessage(serverClientId: String): String {
        val base = "Google Sign-In couldn't find an account to use. " +
            "Make sure a Google account is set up on this device, or try email sign-in instead."
        return if (BuildConfig.DEBUG) "$base (diagnostic: client ID = $serverClientId)" else base
    }
}
