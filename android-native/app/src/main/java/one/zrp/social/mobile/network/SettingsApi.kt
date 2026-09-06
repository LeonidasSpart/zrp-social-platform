package one.zrp.social.mobile.network

import retrofit2.http.Body
import retrofit2.http.GET
import retrofit2.http.POST
import retrofit2.http.PUT

// ─── Profile edit (PUT /user) ───────────────────────────────────────
// The real route (src/app/api/user/route.ts) only touches fields that
// are actually present as keys in the request body, so this only ever
// sends the fields this slice's Profile screen edits - it never risks
// wiping category/showCategory/solanaWallet, which native doesn't
// expose yet.
data class ProfileUpdateRequest(
    val name: String,
    val bio: String,
    val location: String,
    val country: String,
    val website: String,
)

data class ProfileUpdateResponse(
    val name: String?,
    val bio: String?,
    val location: String?,
    val country: String?,
    val website: String?,
)

// ─── Username (GET+PUT /user/username) ──────────────────────────────
data class UsernameStatusResponse(val username: String, val cooldownDays: Int)

data class UsernameUpdateRequest(val username: String)
data class UsernameUpdateUser(val username: String, val usernameChangedAt: String?)
data class UsernameUpdateResponse(val user: UsernameUpdateUser)

// ─── Password (PUT /user/password) ──────────────────────────────────
data class PasswordUpdateRequest(val currentPassword: String, val newPassword: String)
data class MessageResponse(val message: String)

// ─── Email (PUT /user/email) ─────────────────────────────────────────
data class EmailUpdateRequest(val currentPassword: String, val newEmail: String)

// ─── Privacy (PUT /user/privacy) ────────────────────────────────────
data class PrivacyUpdateRequest(
    val publicLikes: Boolean,
    val publicFollowing: Boolean,
    val isPrivate: Boolean,
)

data class PrivacyResponse(
    val publicLikes: Boolean,
    val publicFollowing: Boolean,
    val isPrivate: Boolean,
)

// ─── Account deletion (GET delete-status, POST delete, POST delete/confirm) ──
data class DeletionStatusResponse(val requestedAt: String?, val scheduledFor: String?)
data class DeletionToggleResponse(val message: String, val deletionDate: String?)

/**
 * Settings/Account mutations - the same PUT/POST endpoints the web
 * settings hub (src/app/settings/page.tsx) and its delete-account page
 * call, none of them reinvented. Deliberately scoped to the fields this
 * slice's native screens actually edit (profile text fields, username,
 * password, email, privacy toggles, account deletion) - avatar upload,
 * the custom-URL/professional-category pickers, monetisation, and
 * email/support preferences are real backend features this slice does
 * not yet cover natively (see SettingsRepository's KDoc).
 */
interface SettingsApi {
    @PUT("user")
    suspend fun updateProfile(@Body request: ProfileUpdateRequest): ProfileUpdateResponse

    @GET("user/username")
    suspend fun getUsernameStatus(): UsernameStatusResponse

    @PUT("user/username")
    suspend fun updateUsername(@Body request: UsernameUpdateRequest): UsernameUpdateResponse

    @PUT("user/password")
    suspend fun updatePassword(@Body request: PasswordUpdateRequest): MessageResponse

    @PUT("user/email")
    suspend fun updateEmail(@Body request: EmailUpdateRequest): MessageResponse

    @PUT("user/privacy")
    suspend fun updatePrivacy(@Body request: PrivacyUpdateRequest): PrivacyResponse

    @GET("user/delete-status")
    suspend fun getDeletionStatus(): DeletionStatusResponse

    @POST("user/delete")
    suspend fun toggleScheduledDeletion(): DeletionToggleResponse

    @POST("user/delete/confirm")
    suspend fun confirmDeletion(): MessageResponse
}
