package one.zrp.social.mobile.network

import retrofit2.http.Body
import retrofit2.http.DELETE
import retrofit2.http.GET
import retrofit2.http.POST
import retrofit2.http.Path

data class ApiKeyItem(
    val id: String,
    val name: String,
    val lastUsed: String?,
    val expiresAt: String?,
    val createdAt: String,
    val revoked: Boolean = false,
)

data class ApiKeysResponse(val keys: List<ApiKeyItem>)

data class CreateApiKeyRequest(val name: String, val expiresInDays: Int)

// plainKey is the real, only-ever-shown-once secret (zrp_<hex>) - see
// ApiKeysRepository's own KDoc for why this never gets persisted
// anywhere client-side beyond the in-memory UI state that shows it.
data class CreateApiKeyResponse(val key: ApiKeyItem, val plainKey: String, val warning: String)

/**
 * The real API Keys feature (src/app/settings/api-keys/page.tsx +
 * src/app/api/api-keys/route.ts + src/app/api/api-keys/[id]/route.ts) -
 * Business/Enterprise accounts generate bearer tokens for the real
 * GET /api/external/me and /api/external/me/posts routes. GET 403s with
 * a plain error message for an ineligible plan, the same real shape
 * TeamApi's own GET does - ApiKeysRepository turns that into a
 * dedicated "not eligible" outcome rather than a generic load error.
 */
interface ApiKeysApi {
    @GET("api-keys")
    suspend fun getApiKeys(): ApiKeysResponse

    @POST("api-keys")
    suspend fun createApiKey(@Body request: CreateApiKeyRequest): CreateApiKeyResponse

    @DELETE("api-keys/{id}")
    suspend fun revokeApiKey(@Path("id") id: String)
}
