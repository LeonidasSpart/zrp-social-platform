package one.zrp.social.mobile.data

import one.zrp.social.mobile.network.ApiClient
import one.zrp.social.mobile.network.ChatMessage
import one.zrp.social.mobile.network.ConversationSummary
import one.zrp.social.mobile.network.SendMessageRequest
import one.zrp.social.mobile.network.zrpErrorMessage
import retrofit2.HttpException

class MessagesRepository {
    suspend fun getConversations(): Result<List<ConversationSummary>> = runCatching {
        ApiClient.messagesApi.getConversations()
    }

    suspend fun getConversationMessages(userId: String): Result<List<ChatMessage>> = runCatching {
        ApiClient.messagesApi.getConversationMessages(userId)
    }

    suspend fun sendMessage(receiverId: String, content: String): Result<ChatMessage> {
        return try {
            Result.success(ApiClient.messagesApi.sendMessage(SendMessageRequest(content, receiverId)))
        } catch (e: HttpException) {
            Result.failure(Exception(e.zrpErrorMessage() ?: "Couldn't send this message. Please try again."))
        } catch (e: Exception) {
            Result.failure(Exception("Couldn't reach ZRP. Check your connection and try again."))
        }
    }
}
