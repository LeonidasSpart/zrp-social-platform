package one.zrp.social.mobile.network

import retrofit2.http.Body
import retrofit2.http.GET
import retrofit2.http.POST
import retrofit2.http.Query

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

// ─── Google Sign-In (POST /mobile/auth/google) ──────────────────────
// Same LoginResponse shape as password login - the backend mints an
// identical session token either way (see the route's own comment).
data class GoogleLoginRequest(val idToken: String)

data class ApiErrorBody(val error: String?, val code: String? = null)

// ─── Registration (POST /auth/register) ────────────────────────────
// Shared with the website - no mobile-specific equivalent exists (only
// login has one, since it's the only step that needs to hand back a
// session token). A fresh account is always created unverified, so
// this never signs the caller in by itself.
data class RegisterRequest(val name: String?, val username: String, val email: String, val password: String)
data class RegisterResponse(val message: String?)

// ─── Live username check (GET /auth/check-username) ─────────────────
data class CheckUsernameResponse(val available: Boolean, val invalid: Boolean? = null, val suggestions: List<String> = emptyList())

// ─── Resend verification (POST /auth/resend-verification) ──────────
data class ResendVerificationRequest(val email: String)

// ─── Forgot password (POST /auth/forgot-password) ───────────────────
// Always returns the same generic 200 message regardless of whether
// the account exists (see the real route's own comment: "For
// security, always return a generic message") - there is no
// success/failure branch to model here beyond a network error.
data class ForgotPasswordRequest(val email: String)
data class ForgotPasswordResponse(val message: String?)

data class SessionUser(
    val id: String?,
    val username: String?,
    val name: String?,
    val email: String?,
    val avatarUrl: String?,
    val badgeType: String?,
    val role: String?,
    val plan: String?,
    // Present on the real session (see the jwt/session callbacks in
    // src/lib/auth.ts) but unused by every screen built before
    // Onboarding - null-safe default so this addition can't break any
    // existing Gson deserialization of a session missing it in a test.
    val onboardingCompleted: Boolean? = null,
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

    @POST("mobile/auth/google")
    suspend fun loginWithGoogle(@Body request: GoogleLoginRequest): LoginResponse

    // NextAuth's own built-in endpoint, not one ZRP wrote - it reads
    // whatever session cookie is attached (ApiClient's interceptor
    // attaches the mobile-issued one) and returns the same session.user
    // shape the website's own client-side useSession() sees. This is
    // how the native app resolves "who am I" - specifically its own
    // username - without persisting identity separately on-device or
    // duplicating that resolution logic server-side.
    @GET("auth/session")
    suspend fun getSession(): SessionResponse

    // Relative to ApiClient's base URL - the same real, shared
    // src/app/api/auth/register route the website's own /signup page
    // calls, since account creation needs no session cookie at all.
    @POST("auth/register")
    suspend fun register(@Body request: RegisterRequest): RegisterResponse

    @GET("auth/check-username")
    suspend fun checkUsername(@Query("username") username: String): CheckUsernameResponse

    @POST("auth/resend-verification")
    suspend fun resendVerification(@Body request: ResendVerificationRequest): RegisterResponse

    @POST("auth/forgot-password")
    suspend fun forgotPassword(@Body request: ForgotPasswordRequest): ForgotPasswordResponse
}
