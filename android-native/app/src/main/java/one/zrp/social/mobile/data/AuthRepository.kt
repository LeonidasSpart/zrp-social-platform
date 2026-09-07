package one.zrp.social.mobile.data

import com.google.gson.Gson
import one.zrp.social.mobile.network.ApiErrorBody
import one.zrp.social.mobile.network.ApiClient
import one.zrp.social.mobile.network.CheckUsernameResponse
import one.zrp.social.mobile.network.ForgotPasswordRequest
import one.zrp.social.mobile.network.GoogleLoginRequest
import one.zrp.social.mobile.network.LoginRequest
import one.zrp.social.mobile.network.MobileUser
import one.zrp.social.mobile.network.RegisterRequest
import one.zrp.social.mobile.network.ResendVerificationRequest
import retrofit2.HttpException

enum class ResendVerificationResult { SENT, ALREADY_VERIFIED, FAILED }

/**
 * Owns the mobile session: logging in against the real backend,
 * persisting the resulting token, and answering "is someone signed
 * in right now" for MainActivity's auth gate. Deliberately does not
 * attempt to validate the stored token against the server on every
 * app start (that would mean a network round trip before the app can
 * even show a UI) - a locally-present token is treated as signed-in
 * until a real request fails, which real screens from Phase 4 onward
 * will do naturally by calling authenticated endpoints. Reads the same
 * TokenStore instance ApiClient's cookie interceptor uses (via
 * ApiClient.init(context), called once from ZrpApplication) rather
 * than opening a second EncryptedSharedPreferences handle.
 */
class AuthRepository {
    private val tokenStore = ApiClient.getTokenStore()
    private val gson = Gson()

    fun isLoggedIn(): Boolean = tokenStore.getSessionToken() != null

    fun logout() = tokenStore.clearSession()

    suspend fun login(identifier: String, password: String): Result<MobileUser> {
        return try {
            val response = ApiClient.authApi.login(LoginRequest(identifier, password))
            tokenStore.saveSession(response.sessionToken, response.cookieName)
            Result.success(response.user)
        } catch (e: HttpException) {
            Result.failure(Exception(extractErrorMessage(e) ?: "Something went wrong. Please try again."))
        } catch (e: Exception) {
            Result.failure(Exception("Couldn't reach ZRP. Check your connection and try again."))
        }
    }

    // Same session-token persistence as login() - GoogleAuth.requestIdToken
    // has already obtained a real signed Google ID token by this point,
    // this just hands it to the backend for verification + account
    // find-or-create (see /mobile/auth/google's own comment).
    suspend fun loginWithGoogle(idToken: String): Result<MobileUser> {
        return try {
            val response = ApiClient.authApi.loginWithGoogle(GoogleLoginRequest(idToken))
            tokenStore.saveSession(response.sessionToken, response.cookieName)
            Result.success(response.user)
        } catch (e: HttpException) {
            Result.failure(Exception(extractErrorMessage(e) ?: "Something went wrong. Please try again."))
        } catch (e: Exception) {
            Result.failure(Exception("Couldn't reach ZRP. Check your connection and try again."))
        }
    }

    suspend fun checkUsername(username: String): Result<CheckUsernameResponse> = runCatching {
        ApiClient.authApi.checkUsername(username)
    }

    // Cold start's own AuthUiState.LoggedIn(user = null) doesn't know
    // onboarding status yet (see AuthViewModel's own comment on why it
    // never blocks the first paint on a network round trip) - this
    // resolves it afterward from the real session. Fails open (treats
    // an unreachable/error session as "onboarding done") so a transient
    // network error at cold start can never trap an already-onboarded
    // user behind a screen they don't need.
    suspend fun getOnboardingStatus(): Boolean =
        runCatching { ApiClient.authApi.getSession().user?.onboardingCompleted }.getOrNull() ?: true

    // The same real POST /auth/register the website's own /signup page
    // calls - no session is established here (a fresh account is
    // always created unverified), so this never touches tokenStore.
    suspend fun register(name: String?, username: String, email: String, password: String): Result<Unit> {
        return try {
            ApiClient.authApi.register(RegisterRequest(name, username, email, password))
            Result.success(Unit)
        } catch (e: HttpException) {
            Result.failure(Exception(extractErrorMessage(e) ?: "Registration failed. Please try again later."))
        } catch (e: Exception) {
            Result.failure(Exception("Couldn't reach ZRP. Check your connection and try again."))
        }
    }

    // Matches the website's own three-way branch exactly: a real send,
    // an already-verified account (not really an error, but shown the
    // same way web does), or any other failure.
    suspend fun resendVerification(email: String): ResendVerificationResult {
        return try {
            ApiClient.authApi.resendVerification(ResendVerificationRequest(email))
            ResendVerificationResult.SENT
        } catch (e: HttpException) {
            val code = extractErrorCode(e)
            if (code == "ALREADY_VERIFIED") ResendVerificationResult.ALREADY_VERIFIED else ResendVerificationResult.FAILED
        } catch (e: Exception) {
            ResendVerificationResult.FAILED
        }
    }

    // Always succeeds with the same generic message regardless of
    // whether the account exists (the real route's own comment: "For
    // security, always return a generic message") - only a real
    // network failure surfaces as an error here.
    suspend fun forgotPassword(email: String): Result<String?> = runCatching {
        ApiClient.authApi.forgotPassword(ForgotPasswordRequest(email)).message
    }

    private fun extractErrorMessage(e: HttpException): String? {
        val body = e.response()?.errorBody()?.string() ?: return null
        return try {
            gson.fromJson(body, ApiErrorBody::class.java)?.error
        } catch (_: Exception) {
            null
        }
    }

    private fun extractErrorCode(e: HttpException): String? {
        val body = e.response()?.errorBody()?.string() ?: return null
        return try {
            gson.fromJson(body, ApiErrorBody::class.java)?.code
        } catch (_: Exception) {
            null
        }
    }
}
