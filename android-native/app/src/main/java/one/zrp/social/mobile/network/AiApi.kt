package one.zrp.social.mobile.network

import retrofit2.http.Body
import retrofit2.http.POST

data class AiChatRequest(
    val message: String,
    val conversationId: String? = null,
    val stream: Boolean = false,
)

data class AiChatMessage(
    val id: String,
    val role: String,
    val content: String,
)

data class AiChatResponse(
    val message: AiChatMessage,
    val conversationId: String,
    val remaining: Int,
)

/**
 * ZRP AI - the same real POST /api/ai/chat route the website's own
 * AIChat.tsx calls (DeepSeek-backed, per-plan daily message limits
 * enforced server-side via AIDailyUsage). Web always sends
 * `stream: true` and reads Server-Sent Event chunks off the raw
 * fetch() response body; this wraps the exact same route with
 * `stream: false` instead, which the route already fully supports as
 * its own real non-streaming branch (a single buffered JSON response
 * once DeepSeek finishes, using the identical rate-limit/persistence
 * logic as the streaming path). This is a deliberate, documented
 * native simplification - this codebase has never built a raw
 * OkHttp/Retrofit SSE reader for any other feature, and the UI
 * difference is only whether the reply appears token-by-token or all
 * at once (a brief loading state instead), not a functional gap: the
 * conversation, the daily counter, and every real constraint are
 * identical either way.
 */
interface AiApi {
    @POST("ai/chat")
    suspend fun chat(@Body request: AiChatRequest): AiChatResponse
}
