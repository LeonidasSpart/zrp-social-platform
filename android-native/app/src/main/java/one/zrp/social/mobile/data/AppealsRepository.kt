package one.zrp.social.mobile.data

import one.zrp.social.mobile.network.Appeal
import one.zrp.social.mobile.network.AppealsResponse
import one.zrp.social.mobile.network.ApiClient
import one.zrp.social.mobile.network.CreateAppealRequest
import one.zrp.social.mobile.network.zrpErrorMessage
import retrofit2.HttpException

/**
 * Backs the real Moderation Appeals feature - see AppealsApi's own
 * KDoc. GET returns both what's eligible for appeal and what's already
 * been filed in one call, matching the real route exactly (it does the
 * same two-query fetch server-side rather than exposing two endpoints).
 */
class AppealsRepository {
    suspend fun getAppeals(): Result<AppealsResponse> = safeCall("Couldn't load your appeals.") {
        ApiClient.appealsApi.getAppeals()
    }

    suspend fun createAppeal(reportId: String, message: String): Result<Appeal> =
        safeCall("Failed to submit your appeal. Please try again.") {
            ApiClient.appealsApi.createAppeal(CreateAppealRequest(reportId, message))
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
