package one.zrp.social.mobile.data

import android.content.Context
import androidx.credentials.CredentialManager
import androidx.credentials.GetCredentialRequest
import androidx.credentials.exceptions.GetCredentialCancellationException
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
        } catch (e: Exception) {
            Result.failure(Exception("Couldn't reach Google. Check your connection and try again."))
        }
    }
}
