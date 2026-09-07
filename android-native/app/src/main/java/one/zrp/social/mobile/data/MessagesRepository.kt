package one.zrp.social.mobile.data

import one.zrp.social.mobile.network.ApiClient
import one.zrp.social.mobile.network.ChatMessage
import one.zrp.social.mobile.network.ConversationSummary
import one.zrp.social.mobile.network.EditMessageRequest
import one.zrp.social.mobile.network.MessageReactionRequest
import one.zrp.social.mobile.network.MessageReactionResponse
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

    suspend fun sendMessage(
        receiverId: String,
        content: String,
        replyToId: String? = null,
        imageUrl: String? = null,
    ): Result<ChatMessage> {
        return try {
            Result.success(
                ApiClient.messagesApi.sendMessage(SendMessageRequest(content, receiverId, imageUrl, replyToId)),
            )
        } catch (e: HttpException) {
            Result.failure(Exception(e.zrpErrorMessage() ?: "Couldn't send this message. Please try again."))
        } catch (e: Exception) {
            Result.failure(Exception("Couldn't reach ZRP. Check your connection and try again."))
        }
    }

    suspend fun deleteMessage(messageId: String): Result<Unit> = runCatching {
        ApiClient.messagesApi.deleteMessage(messageId)
    }

    suspend fun editMessage(messageId: String, content: String): Result<ChatMessage> {
        return try {
            Result.success(ApiClient.messagesApi.editMessage(messageId, EditMessageRequest(content)))
        } catch (e: HttpException) {
            Result.failure(Exception(e.zrpErrorMessage() ?: "Couldn't save this message. Please try again."))
        } catch (e: Exception) {
            Result.failure(Exception("Couldn't reach ZRP. Check your connection and try again."))
        }
    }

    suspend fun toggleReaction(messageId: String, emoji: String): Result<MessageReactionResponse> = runCatching {
        ApiClient.messagesApi.toggleReaction(messageId, MessageReactionRequest(emoji))
    }
}
