package one.zrp.social.mobile.network

import retrofit2.http.Body
import retrofit2.http.GET
import retrofit2.http.POST
import retrofit2.http.PUT
import retrofit2.http.Query

// ─── Profile completion (PUT /user/profile) ──────────────────────────
// A genuinely different, separate real route from SettingsApi's own
// PUT /user (src/app/api/user/route.ts, updateProfile()'s own
// endpoint) - this is the one src/app/onboarding/page.tsx's own step 0
// actually calls (src/app/api/user/profile/route.ts), with its own
// distinct field set (no `country`). Both routes are real and live;
// native's Settings screen and Onboarding screen each call the one the
// real website itself calls for that screen.
data class OnboardingProfileRequest(
    val name: String,
    val bio: String,
    val location: String,
    val website: String,
)

data class OnboardingProfileResponse(val id: String?)

// ─── Suggested follows (GET /users/suggested) ────────────────────────
data class SuggestedUser(
    val id: String,
    val username: String,
    val name: String?,
    val avatarUrl: String?,
    val badgeType: String?,
)

data class OnboardingCompleteResponse(val success: Boolean? = null)

/**
 * The three real endpoints src/app/onboarding/page.tsx itself calls
 * beyond the shared avatar-upload (SettingsApi.updateAvatar) and
 * follow-toggle (UsersApi.toggleFollow) routes it also reuses - profile
 * completion, suggested-follows, and marking onboarding done.
 */
interface OnboardingApi {
    @PUT("user/profile")
    suspend fun updateProfile(@Body request: OnboardingProfileRequest): OnboardingProfileResponse

    @GET("users/suggested")
    suspend fun getSuggestedUsers(@Query("limit") limit: Int? = null): List<SuggestedUser>

    @POST("user/onboarding-complete")
    suspend fun completeOnboarding(): OnboardingCompleteResponse
}
