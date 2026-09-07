package one.zrp.social.mobile.network

import io.socket.client.IO
import io.socket.client.Socket
import one.zrp.social.mobile.data.TokenStore

/**
 * The same real-time layer the website's src/lib/socket-client.ts uses -
 * server.js runs Socket.IO at path "/api/socket.io" on the same origin as
 * the REST API, authenticating the handshake by parsing the raw Cookie
 * header for a valid NextAuth session JWT (see server.js's own io.use()
 * middleware comment). ApiClient's sessionCookieInterceptor already
 * proves this app carries that exact cookie on every REST call, so the
 * same value is attached here as an extraHeader instead of a payload
 * field - nothing server-side needed to change for a native client.
 *
 * transports is forced to "websocket" only, matching socket-client.ts
 * exactly (autoConnect there is the default the JS client already used;
 * this app instead connects/disconnects explicitly, tied to whichever
 * screen currently needs a live conversation - see ConversationViewModel).
 *
 * No Origin header is set on purpose. server.js's cors.origin allowlist
 * (SOCKET_ALLOWED_ORIGINS) exists for browser and Capacitor-WebView
 * clients, which always send one; a plain OkHttp-backed handshake like
 * this one sends none at all, which the underlying `cors` middleware
 * simply doesn't gate on the same way REST calls from this app already
 * don't carry - or need - an Origin either.
 *
 * A fresh Socket is created per connect() call rather than kept as a
 * single app-wide singleton: the session cookie is baked into the
 * handshake headers at creation time, and re-using one Socket across a
 * logout/login would silently keep authenticating as the previous
 * account. The cost is skipping web's own cross-screen connection reuse
 * (getSocket() in socket-client.ts) - an honest, documented simplification,
 * not a functional gap, since every screen still disconnects cleanly on
 * its own instead of leaking a handshake for a screen that's gone.
 */
object ZrpSocket {
    private const val SOCKET_URL = "https://zrp.one"
    private const val SOCKET_PATH = "/api/socket.io"

    fun connect(tokenStore: TokenStore): Socket {
        val token = tokenStore.getSessionToken()
        val cookieName = tokenStore.getCookieName()

        val options = IO.Options()
        options.path = SOCKET_PATH
        options.transports = arrayOf("websocket")
        options.reconnection = true
        if (token != null) {
            options.extraHeaders = mapOf("Cookie" to listOf("$cookieName=$token"))
        }

        val socket = IO.socket(SOCKET_URL, options)
        socket.connect()
        return socket
    }
}
