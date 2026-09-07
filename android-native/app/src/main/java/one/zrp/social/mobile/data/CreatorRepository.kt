package one.zrp.social.mobile.data

import one.zrp.social.mobile.network.ApiClient
import one.zrp.social.mobile.network.CreatorDashboardResponse
import one.zrp.social.mobile.network.CreatorProfile
import one.zrp.social.mobile.network.CreatorProfileResponse
import one.zrp.social.mobile.network.CreatorStudioResponse
import one.zrp.social.mobile.network.CreatorWithdrawRequest
import one.zrp.social.mobile.network.CreatorWithdrawal
import one.zrp.social.mobile.network.UpdateCreatorProfileRequest
import one.zrp.social.mobile.network.zrpErrorMessage
import retrofit2.HttpException

/**
 * ZRP Creator Studio - see CreatorApi's own KDoc for the full real
 * /api/creator/ contract and, importantly, exactly which actions are
 * deliberately NOT wrapped here (tip-sending, premium-post purchase)
 * and why.
 */
class CreatorRepository {
    // GET /api/creator/profile both checks Business/Enterprise
    // eligibility and auto-provisions the profile row on first real
    // fetch for an eligible account - calling this before the
    // dashboard/studio endpoints (rather than racing all three, like
    // dashboard/page.tsx's own useEffect does) means those two calls
    // only ever run once a real profile is confirmed to exist, instead
    // of also having to handle their own separate 404 "not found yet".
    suspend fun getProfile(): Result<CreatorProfileResponse> = runCatching {
        ApiClient.creatorApi.getProfile()
    }

    suspend fun updateProfile(
        tipsEnabled: Boolean? = null,
        tipsMessage: String? = null,
        premiumPostsEnabled: Boolean? = null,
    ): Result<CreatorProfile> {
        return try {
            val request = UpdateCreatorProfileRequest(tipsEnabled, tipsMessage, premiumPostsEnabled)
            Result.success(ApiClient.creatorApi.updateProfile(request).profile)
        } catch (e: HttpException) {
            Result.failure(Exception(e.zrpErrorMessage() ?: "Couldn't update your monetisation settings."))
        } catch (e: Exception) {
            Result.failure(Exception("Couldn't reach ZRP. Check your connection and try again."))
        }
    }

    suspend fun getDashboard(): Result<CreatorDashboardResponse> = runCatching {
        ApiClient.creatorApi.getDashboard()
    }

    suspend fun getStudio(): Result<CreatorStudioResponse> = runCatching {
        ApiClient.creatorApi.getStudio()
    }

    suspend fun withdraw(amount: Double, walletAddress: String): Result<CreatorWithdrawal> {
        return try {
            val request = CreatorWithdrawRequest(amount, walletAddress)
            Result.success(ApiClient.creatorApi.withdraw(request).withdrawal)
        } catch (e: HttpException) {
            Result.failure(Exception(e.zrpErrorMessage() ?: "Couldn't submit the withdrawal. Please try again."))
        } catch (e: Exception) {
            Result.failure(Exception("Couldn't reach ZRP. Check your connection and try again."))
        }
    }
}
