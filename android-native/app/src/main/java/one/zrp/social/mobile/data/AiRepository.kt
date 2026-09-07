package one.zrp.social.mobile.data

import one.zrp.social.mobile.network.AiChatRequest
import one.zrp.social.mobile.network.AiChatResponse
import one.zrp.social.mobile.network.ApiClient
import one.zrp.social.mobile.network.zrpErrorMessage
import retrofit2.HttpException

/**
 * ZRP AI - see AiApi's own KDoc for the real contract and the
 * non-streaming-mode decision. Every real failure this route can
 * return (401, 400 empty message, 429 daily limit with its own
 * specific "Daily limit reached (N messages)..." text, 503 when
 * DeepSeek itself is unavailable) already arrives as a plain
 * {"error": "..."} body, so zrpErrorMessage() surfaces the server's
 * own specific message directly - the same pattern as every other
 * repository that needs the real reason rather than a generic one.
 */
class AiRepository {
    suspend fun sendMessage(message: String, conversationId: String?): Result<AiChatResponse> {
        return try {
            val request = AiChatRequest(message = message, conversationId = conversationId, stream = false)
            Result.success(ApiClient.aiApi.chat(request))
        } catch (e: HttpException) {
            Result.failure(Exception(e.zrpErrorMessage() ?: "AI service temporarily unavailable"))
        } catch (e: Exception) {
            Result.failure(Exception("Couldn't reach ZRP. Check your connection and try again."))
        }
    }
}
