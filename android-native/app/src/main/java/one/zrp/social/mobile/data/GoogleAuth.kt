package one.zrp.social.mobile.data

import android.content.Context
import androidx.credentials.CredentialManager
import androidx.credentials.GetCredentialRequest
import androidx.credentials.exceptions.GetCredentialCancellationException
import androidx.credentials.exceptions.GetCredentialException
import androidx.credentials.exceptions.NoCredentialException
import com.google.android.libraries.identity.googleid.GetGoogleIdOption
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
    suspend fun requestIdToken(context: Context): Result<String> {
        val option = GetGoogleIdOption.Builder()
            .setFilterByAuthorizedAccounts(false)
            .setServerClientId(BuildConfig.GOOGLE_WEB_CLIENT_ID)
            .build()
        val request = GetCredentialRequest.Builder()
            .addCredentialOption(option)
            .build()

        return try {
            val result = CredentialManager.create(context).getCredential(context, request)
            val credential = GoogleIdTokenCredential.createFrom(result.credential.data)
            Result.success(credential.idToken)
        } catch (e: GetCredentialCancellationException) {
            Result.failure(GoogleSignInCancelledException())
        } catch (e: GoogleIdTokenParsingException) {
            Result.failure(Exception("Couldn't verify that Google account. Please try again."))
        } catch (e: NoCredentialException) {
            // The device has no Google account configured (or none the
            // account picker could offer) - Credential Manager's own
            // signal for this, distinct from every other failure mode
            // below. Previously fell into the generic catch-all and
            // told the user to "check your connection", which sent
            // real device testing down the wrong troubleshooting path
            // for what was actually a missing-account (or, before
            // GOOGLE_WEB_CLIENT_ID was configured in CI, a build
            // misconfiguration Credential Manager reports the same way)
            // rather than a network problem.
            Result.failure(Exception("No Google account found on this device. Add a Google account in your device settings and try again."))
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
}
