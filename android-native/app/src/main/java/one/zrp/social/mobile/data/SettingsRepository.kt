package one.zrp.social.mobile.data

import one.zrp.social.mobile.network.ApiClient
import one.zrp.social.mobile.network.DeletionStatusResponse
import one.zrp.social.mobile.network.DeletionToggleResponse
import one.zrp.social.mobile.network.EmailUpdateRequest
import one.zrp.social.mobile.network.MessageResponse
import one.zrp.social.mobile.network.PasswordUpdateRequest
import one.zrp.social.mobile.network.PrivacyResponse
import one.zrp.social.mobile.network.PrivacyUpdateRequest
import one.zrp.social.mobile.network.ProfileUpdateRequest
import one.zrp.social.mobile.network.ProfileUpdateResponse
import one.zrp.social.mobile.network.SessionUser
import one.zrp.social.mobile.network.UserProfile
import one.zrp.social.mobile.network.UsernameStatusResponse
import one.zrp.social.mobile.network.UsernameUpdateRequest
import one.zrp.social.mobile.network.UsernameUpdateResponse
import one.zrp.social.mobile.network.zrpErrorMessage
import retrofit2.HttpException

/**
 * Backs the native Settings/Account screens - real mutations against
 * the same PUT/POST endpoints src/app/settings/page.tsx and
 * src/app/settings/delete/page.tsx call. This is a first, coherent
 * vertical slice of that web hub, not the whole thing:
 *
 * - Covered: account info display, username change, email change,
 *   password change, profile text fields (name/bio/location/country/
 *   website), privacy toggles (public likes/following, private
 *   account), account deletion (30-day schedule/cancel + confirm).
 * - NOT yet native (genuinely backend-supported, left for a follow-up
 *   slice rather than faked): avatar upload and the professional-
 *   profile category picker (both need the same native UploadThing/
 *   media-upload path already deferred for posts, DMs and story
 *   creation), custom profile URL (plan-gated, its own small slice),
 *   data export (needs a FileProvider + share-sheet path of its own),
 *   email notification preferences, support tickets, and appeals.
 * - Deliberately excluded per the standing native store-payment
 *   restriction: monetisation/creator dashboard and the Solana wallet
 *   field, since neither should be editable from a store-distributed
 *   native build without compliant native billing.
 */
class SettingsRepository {
    suspend fun getOwnSession(): Result<SessionUser?> = runCatching {
        ApiClient.authApi.getSession().user
    }

    suspend fun getOwnUsername(): Result<String> = runCatching {
        ApiClient.authApi.getSession().user?.username ?: throw IllegalStateException("Not signed in")
    }

    suspend fun getProfile(username: String): Result<UserProfile> = runCatching {
        ApiClient.usersApi.getProfile(username)
    }

    suspend fun updateProfile(
        name: String,
        bio: String,
        location: String,
        country: String,
        website: String,
    ): Result<ProfileUpdateResponse> = safeCall("Couldn't save your profile. Please try again.") {
        ApiClient.settingsApi.updateProfile(ProfileUpdateRequest(name, bio, location, country, website))
    }

    suspend fun getUsernameStatus(): Result<UsernameStatusResponse> = safeCall("Couldn't check your username status.") {
        ApiClient.settingsApi.getUsernameStatus()
    }

    suspend fun updateUsername(username: String): Result<UsernameUpdateResponse> =
        safeCall("Couldn't update your username. Please try again.") {
            ApiClient.settingsApi.updateUsername(UsernameUpdateRequest(username))
        }

    suspend fun updatePassword(currentPassword: String, newPassword: String): Result<MessageResponse> =
        safeCall("Couldn't update your password. Please try again.") {
            ApiClient.settingsApi.updatePassword(PasswordUpdateRequest(currentPassword, newPassword))
        }

    suspend fun updateEmail(currentPassword: String, newEmail: String): Result<MessageResponse> =
        safeCall("Couldn't send the verification email. Please try again.") {
            ApiClient.settingsApi.updateEmail(EmailUpdateRequest(currentPassword, newEmail))
        }

    suspend fun updatePrivacy(
        publicLikes: Boolean,
        publicFollowing: Boolean,
        isPrivate: Boolean,
    ): Result<PrivacyResponse> = safeCall("Couldn't update your privacy settings. Please try again.") {
        ApiClient.settingsApi.updatePrivacy(PrivacyUpdateRequest(publicLikes, publicFollowing, isPrivate))
    }

    suspend fun getDeletionStatus(): Result<DeletionStatusResponse> = safeCall("Couldn't check your account status.") {
        ApiClient.settingsApi.getDeletionStatus()
    }

    // Same real endpoint as the website's own toggle button: schedules
    // deletion in 30 days if none is pending, or cancels an already-
    // scheduled one - there's no separate cancel endpoint server-side.
    suspend fun toggleScheduledDeletion(): Result<DeletionToggleResponse> =
        safeCall("Couldn't update your deletion request. Please try again.") {
            ApiClient.settingsApi.toggleScheduledDeletion()
        }

    suspend fun confirmDeletion(): Result<MessageResponse> = safeCall("Couldn't delete your account. Please try again.") {
        ApiClient.settingsApi.confirmDeletion()
    }

    private suspend fun <T> safeCall(genericError: String, block: suspend () -> T): Result<T> {
        return try {
            Result.success(block())
        } catch (e: HttpException) {
            Result.failure(Exception(e.zrpErrorMessage() ?: genericError))
        } catch (e: Exception) {
            Result.failure(Exception("Couldn't reach ZRP. Check your connection and try again."))
        }
    }
}
