package one.zrp.social.mobile.network

import retrofit2.http.Body
import retrofit2.http.GET
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

data class SessionUser(
    val id: String?,
    val username: String?,
    val name: String?,
    val avatarUrl: String?,
    val badgeType: String?,
    val role: String?,
    val plan: String?,
)

data class SessionResponse(
    val user: SessionUser?,
    val expires: String?,
)

interface AuthApi {
    // Relative to ApiClient's https://zrp.one/api/ base URL - this is
    // POST https://zrp.one/api/mobile/auth/login.
    @POST("mobile/auth/login")
    suspend fun login(@Body request: LoginRequest): LoginResponse

    // NextAuth's own built-in endpoint, not one ZRP wrote - it reads
    // whatever session cookie is attached (ApiClient's interceptor
    // attaches the mobile-issued one) and returns the same session.user
    // shape the website's own client-side useSession() sees. This is
    // how the native app resolves "who am I" - specifically its own
    // username - without persisting identity separately on-device or
    // duplicating that resolution logic server-side.
    @GET("auth/session")
    suspend fun getSession(): SessionResponse
}
