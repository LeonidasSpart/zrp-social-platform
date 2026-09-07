package one.zrp.social.mobile.network

import com.google.gson.JsonElement
import retrofit2.http.GET

// Metered's standard TURN/STUN credential shape. urls is a bare JsonElement
// rather than String/List<String> because RTCIceServer.urls is a JS union
// type (string | string[]) - Metered's own real responses use a single
// string per entry, but nothing guarantees that stays true, and a plain
// Gson-mapped String field would throw on an array. See
// IceServerConfig.urlList() for the actual normalization.
data class IceServerConfig(
    val urls: JsonElement? = null,
    val username: String? = null,
    val credential: String? = null,
) {
    fun urlList(): List<String> = when {
        urls == null || urls.isJsonNull -> emptyList()
        urls.isJsonArray -> urls.asJsonArray.mapNotNull { if (it.isJsonPrimitive) it.asString else null }
        urls.isJsonPrimitive -> listOf(urls.asString)
        else -> emptyList()
    }
}

/**
 * The same real TURN/STUN credentials src/app/messages/[username]/
 * page.tsx's own getIceServers() fetches before starting or accepting a
 * call - GET /api/turn-credentials proxies Metered's TURN service
 * server-side (session-gated, rate-limited) so the provider's API key
 * never reaches this client.
 */
interface TurnCredentialsApi {
    @GET("turn-credentials")
    suspend fun getIceServers(): List<IceServerConfig>
}
