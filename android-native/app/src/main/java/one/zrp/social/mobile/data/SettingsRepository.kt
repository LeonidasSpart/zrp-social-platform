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
import one.zrp.social.mobile.network.UpdateWalletRequest
import one.zrp.social.mobile.network.UpdateWalletResponse
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
 *   website), the Solana receiving-wallet field (for direct tips - see
 *   updateWallet's own KDoc for why this is fine to edit natively
 *   despite the standing payment-restriction policy), privacy toggles
 *   (public likes/following, private account), account deletion
 *   (30-day schedule/cancel + confirm).
 * - NOT yet native (genuinely backend-supported, left for a follow-up
 *   slice rather than faked): avatar upload and the professional-
 *   profile category picker (both need the same native UploadThing/
 *   media-upload path already deferred for posts, DMs and story
 *   creation), custom profile URL (plan-gated, its own small slice),
 *   data export (needs a FileProvider + share-sheet path of its own),
 *   email notification preferences, support tickets, and appeals.
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

    /**
     * Sets the account's own Solana address for *receiving* tips
     * directly (settings.solanaWalletTitle: "Solana Wallet (for direct
     * tips)"). This edits account metadata, not a payment: no money
     * moves, no purchase is initiated, and the route itself
     * (src/app/api/user/route.ts) only ever validates the address is a
     * well-formed Solana public key before storing it. It's the same
     * kind of payout-address field CreatorRepository's own withdraw()
     * already sends natively (a walletAddress string for a payout
     * request) - the standing native-payment-policy.ts restriction
     * blocks initiating a payment IN (tips, premium purchases, plan
     * upgrades, Aid contributions), never editing where a payment OUT
     * should later land.
     *
     * settings_err_wallet_update_failed stays a real, extracted, but
     * deliberately unused translation - it's web's own client-side
     * fallback for when a failed response's `error` field is itself
     * falsy, but this route (src/app/api/user/route.ts) always returns
     * a real one on every failure path it has (400 "Invalid Solana
     * wallet address", 401 "Unauthorized"), so zrpErrorMessage()
     * already surfaces the real reason and this repository's own
     * generic fallback below only ever covers an actual network
     * failure, matching every other method in this class.
     */
    suspend fun updateWallet(solanaWallet: String): Result<UpdateWalletResponse> =
        safeCall("Couldn't update your wallet address. Please try again.") {
            ApiClient.settingsApi.updateWallet(UpdateWalletRequest(solanaWallet))
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
