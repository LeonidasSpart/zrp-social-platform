package one.zrp.social.mobile.data

import android.content.Context
import android.util.Log
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
            // Credential Manager throws this exact exception for several
            // very different real causes, and it does not tell us which:
            // (a) genuinely no Google account is usable on this device,
            // (b) this app's signing certificate has no matching Android
            // OAuth client registered in the "zrp-social" Google Cloud
            // project (confirmed as the actual cause during V4.0.1
            // real-device testing, via google-services.json's own
            // then-empty "oauth_client": []; that cert is registered now
            // - see google-services.json's own committed oauth_client
            // entries), or (c) the value baked into BuildConfig as
            // GOOGLE_WEB_CLIENT_ID (from the GOOGLE_WEB_CLIENT_ID repo
            // secret, see build.gradle's own comment) isn't a valid
            // Web-type OAuth client in that same Google Cloud project -
            // e.g. empty, a typo, or accidentally the website's own
            // GOOGLE_CLIENT_ID from a different project (see
            // /api/mobile/auth/google/route.ts's own comment on why that
            // specific mistake is easy to make and must not happen).
            // A real Internal Testing tester has no adb/logcat access,
            // so the exact configured (non-secret - OAuth client IDs are
            // public identifiers, unlike a client secret) value is
            // included directly in the surfaced message: an empty value
            // here immediately confirms cause (c) without needing a
            // device connected to a computer.
            val configuredClientId = BuildConfig.GOOGLE_WEB_CLIENT_ID.ifBlank { "(not set)" }
            Log.e("GoogleAuth", "Credential Manager returned no credential (NoCredentialException) - see this file's own KDoc. Configured GOOGLE_WEB_CLIENT_ID: $configuredClientId", e)
            Result.failure(
                Exception(
                    "Google Sign-In couldn't find an account to use. Make sure a Google account is set up on this device, or try email sign-in instead. " +
                        "(diagnostic: configured client ID = $configuredClientId)"
                )
            )
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
