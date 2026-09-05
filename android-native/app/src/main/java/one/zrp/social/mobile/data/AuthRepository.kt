package one.zrp.social.mobile.data

import com.google.gson.Gson
import one.zrp.social.mobile.network.ApiErrorBody
import one.zrp.social.mobile.network.ApiClient
import one.zrp.social.mobile.network.LoginRequest
import one.zrp.social.mobile.network.MobileUser
import retrofit2.HttpException

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

    private fun extractErrorMessage(e: HttpException): String? {
        val body = e.response()?.errorBody()?.string() ?: return null
        return try {
            gson.fromJson(body, ApiErrorBody::class.java)?.error
        } catch (_: Exception) {
            null
        }
    }
}
