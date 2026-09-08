package one.zrp.social.mobile.data

import one.zrp.social.mobile.network.ApiClient
import one.zrp.social.mobile.network.ApiKeysResponse
import one.zrp.social.mobile.network.CreateApiKeyRequest
import one.zrp.social.mobile.network.CreateApiKeyResponse
import one.zrp.social.mobile.network.zrpErrorMessage
import retrofit2.HttpException

/** GET /api/api-keys's own two real outcomes - matches TeamLoadOutcome's shape exactly for the identical real reason. */
sealed class ApiKeysLoadOutcome {
    data class Eligible(val response: ApiKeysResponse) : ApiKeysLoadOutcome()
    data class Ineligible(val message: String?) : ApiKeysLoadOutcome()
}

/**
 * Backs the real API Keys feature - see ApiKeysApi's own KDoc. Every
 * write reuses the server's own descriptive error text (the real
 * 10-active-key cap, "name is required", etc.) rather than re-deriving
 * those rules client-side.
 */
class ApiKeysRepository {
    suspend fun getApiKeys(): Result<ApiKeysLoadOutcome> {
        return try {
            Result.success(ApiKeysLoadOutcome.Eligible(ApiClient.apiKeysApi.getApiKeys()))
        } catch (e: HttpException) {
            if (e.code() == 403) {
                Result.success(ApiKeysLoadOutcome.Ineligible(e.zrpErrorMessage()))
            } else {
                Result.failure(Exception(e.zrpErrorMessage() ?: "Couldn't load your API keys."))
            }
        } catch (e: Exception) {
            Result.failure(Exception("Couldn't reach ZRP. Check your connection and try again."))
        }
    }

    suspend fun createApiKey(name: String, expiresInDays: Int): Result<CreateApiKeyResponse> =
        safeCall("Failed to create key.") {
            ApiClient.apiKeysApi.createApiKey(CreateApiKeyRequest(name, expiresInDays))
        }

    suspend fun revokeApiKey(id: String): Result<Unit> =
        safeCall("Failed to revoke key.") {
            ApiClient.apiKeysApi.revokeApiKey(id)
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
