package one.zrp.social.mobile.data

import com.google.gson.JsonPrimitive
import one.zrp.social.mobile.network.ApiClient
import one.zrp.social.mobile.network.IceServerConfig

/**
 * The real ICE servers a call needs - see TurnCredentialsApi's own KDoc.
 * Falls back to the same public Google STUN-only servers
 * page.tsx's own FALLBACK_ICE_SERVERS uses when the fetch itself fails
 * (not just when the route already degrades server-side) - relay-less
 * STUN can still connect two peers on open networks even though a
 * strict NAT/firewall on either side would need the TURN relay this
 * fallback doesn't have.
 */
class CallRepository {
    suspend fun getIceServers(): List<IceServerConfig> = runCatching {
        ApiClient.turnCredentialsApi.getIceServers()
    }.getOrElse {
        listOf(
            IceServerConfig(urls = JsonPrimitive("stun:stun.l.google.com:19302")),
            IceServerConfig(urls = JsonPrimitive("stun:stun1.l.google.com:19302")),
        )
    }
}
