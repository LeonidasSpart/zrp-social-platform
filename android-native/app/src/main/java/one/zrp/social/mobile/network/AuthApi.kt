package one.zrp.social.mobile.network

import retrofit2.http.Body
import retrofit2.http.POST

data class LoginRequest(
    val identifier: String,
    val password: String,
)

data class MobileUser(
    val id: String,
    val username: String,
    val name: String?,
    val avatarUrl: String?,
    val badgeType: String?,
    val role: String,
    val plan: String,
    val onboardingCompleted: Boolean,
)

data class LoginResponse(
    val sessionToken: String,
    val cookieName: String,
    val expiresInSeconds: Long,
    val user: MobileUser,
)

data class ApiErrorBody(val error: String?)

interface AuthApi {
    // Relative to ApiClient's https://zrp.one/api/ base URL - this is
    // POST https://zrp.one/api/mobile/auth/login.
    @POST("mobile/auth/login")
    suspend fun login(@Body request: LoginRequest): LoginResponse
}
