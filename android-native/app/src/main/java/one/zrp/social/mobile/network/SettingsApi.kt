package one.zrp.social.mobile.network

import okhttp3.MultipartBody
import retrofit2.http.Body
import retrofit2.http.GET
import retrofit2.http.Multipart
import retrofit2.http.POST
import retrofit2.http.PUT
import retrofit2.http.Part

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

// ─── Solana receiving wallet (PUT /user, solanaWallet-only body) ────
// The real route only ever touches a field present as a key in the
// request body (see its own comment), so this is a second, separate
// Retrofit method with its own single-field body - sending it
// alongside name/bio/etc. in ProfileUpdateRequest would needlessly
// couple two independent web forms (the main profile form and its own
// separate "Solana Wallet" form/button) into one native save action.
data class UpdateWalletRequest(val solanaWallet: String)

data class UpdateWalletResponse(val solanaWallet: String?)

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

// ─── Avatar/banner (POST update-avatar, POST update-cover) ─────────────
// Both routes are real, live, and reachable from src/app/profile/
// [username]/page.tsx's own avatar/banner camera-overlay buttons - a
// plain multipart POST straight to our backend (which does the real
// UploadThing upload server-side via UTApi), not the presigned-URL
// client flow src/app/settings/page.tsx's avatar picker uses for the
// same field. Picking this simpler, equally-real path avoids routing
// a small (<=5MB) image through the heavier two-step protocol
// MediaUploader.kt exists for. avatar's response nests success/
// avatarUrl; cover's own response has no success field at all - a real
// inconsistency between the two routes, matched here rather than
// invented away.
data class AvatarUpdateResponse(val success: Boolean? = null, val avatarUrl: String?)
data class CoverUpdateResponse(val coverUrl: String?)

// ─── Email preferences (GET/PUT /user/email-preferences) ────────────
// The real route stores these as a loose `emailPreferences Json?`
// field on User (prisma/schema.prisma), not a dedicated table - GET
// returns whatever's stored merged with these same six defaults
// server-side, and PUT accepts any subset of the six keys as a
// partial update (the route merges it against the stored/current
// object itself), which is why the request body below is a plain Map
// rather than a fixed data class - sending just the one toggled key,
// matching EmailPreferences.tsx's own per-toggle PUT exactly, rather
// than resending all six every time.
data class EmailPreferences(
    val mentions: Boolean = true,
    val messages: Boolean = true,
    val likes: Boolean = true,
    val comments: Boolean = true,
    val follows: Boolean = true,
    val reposts: Boolean = true,
)

data class EmailPreferencesUpdateResponse(val success: Boolean, val preferences: EmailPreferences)

/**
 * Settings/Account mutations - the same PUT/POST endpoints the web
 * settings hub (src/app/settings/page.tsx) and its delete-account page
 * call, none of them reinvented. Deliberately scoped to the fields this
 * slice's native screens actually edit (profile text fields, Solana
 * receiving wallet, username, password, email, privacy toggles, account
 * deletion, avatar/banner, email notification preferences) - the
 * custom-URL/professional-category pickers and data export are real
 * backend features this slice does not yet cover natively (see
 * SettingsRepository's KDoc).
 */
interface SettingsApi {
    @PUT("user")
    suspend fun updateProfile(@Body request: ProfileUpdateRequest): ProfileUpdateResponse

    @PUT("user")
    suspend fun updateWallet(@Body request: UpdateWalletRequest): UpdateWalletResponse

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

    @Multipart
    @POST("user/update-avatar")
    suspend fun updateAvatar(@Part file: MultipartBody.Part): AvatarUpdateResponse

    @Multipart
    @POST("user/update-cover")
    suspend fun updateCover(@Part file: MultipartBody.Part): CoverUpdateResponse

    @GET("user/email-preferences")
    suspend fun getEmailPreferences(): EmailPreferences

    @PUT("user/email-preferences")
    suspend fun updateEmailPreferences(@Body request: Map<String, Boolean>): EmailPreferencesUpdateResponse
}
