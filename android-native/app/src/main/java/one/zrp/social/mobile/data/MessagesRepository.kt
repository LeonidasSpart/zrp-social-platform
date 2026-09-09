package one.zrp.social.mobile.data

import one.zrp.social.mobile.network.AddParticipantsRequest
import one.zrp.social.mobile.network.ApiClient
import one.zrp.social.mobile.network.ChatMessage
import one.zrp.social.mobile.network.ConversationDetail
import one.zrp.social.mobile.network.ConversationSummary
import one.zrp.social.mobile.network.CreateGroupRequest
import one.zrp.social.mobile.network.EditMessageRequest
import one.zrp.social.mobile.network.GroupConversationSummary
import one.zrp.social.mobile.network.MessageReactionRequest
import one.zrp.social.mobile.network.MessageReactionResponse
import one.zrp.social.mobile.network.MessagesPage
import one.zrp.social.mobile.network.SendGroupMessageRequest
import one.zrp.social.mobile.network.SendMessageRequest
import one.zrp.social.mobile.network.UpdateGroupRequest
import one.zrp.social.mobile.network.zrpErrorMessage
import retrofit2.HttpException

class MessagesRepository {
    suspend fun getConversations(): Result<List<ConversationSummary>> = runCatching {
        ApiClient.messagesApi.getConversations()
    }

    suspend fun getConversationMessages(userId: String): Result<List<ChatMessage>> = runCatching {
        ApiClient.messagesApi.getConversationMessages(userId)
    }

    // beforeMessageId is the oldest message currently held locally -
    // the cursor contract (see MessagesPage's KDoc) returns the real
    // page immediately preceding it, chronological-ascending within
    // that page, ready to prepend as-is.
    suspend fun getOlderMessages(userId: String, beforeMessageId: String): Result<MessagesPage> = runCatching {
        ApiClient.messagesApi.getOlderConversationMessages(userId, cursor = beforeMessageId)
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

    suspend fun getUnreadCount(): Result<Int> = runCatching {
        ApiClient.messagesApi.getUnreadCount().count
    }

    // ─── Group conversations ──────────────────────────────────────────
    suspend fun getGroupConversations(): Result<List<GroupConversationSummary>> = runCatching {
        ApiClient.messagesApi.getGroupConversations()
    }

    suspend fun createGroup(name: String, participantIds: List<String>): Result<ConversationDetail> {
        return try {
            Result.success(ApiClient.messagesApi.createGroupConversation(CreateGroupRequest(name, participantIds)))
        } catch (e: HttpException) {
            Result.failure(Exception(e.zrpErrorMessage() ?: "Couldn't create this group. Please try again."))
        } catch (e: Exception) {
            Result.failure(Exception("Couldn't reach ZRP. Check your connection and try again."))
        }
    }

    suspend fun getConversationDetail(conversationId: String): Result<ConversationDetail> {
        return try {
            Result.success(ApiClient.messagesApi.getConversationDetail(conversationId))
        } catch (e: HttpException) {
            Result.failure(Exception(e.zrpErrorMessage() ?: "Couldn't load this group."))
        } catch (e: Exception) {
            Result.failure(Exception("Couldn't reach ZRP. Check your connection and try again."))
        }
    }

    suspend fun updateConversation(conversationId: String, name: String? = null, avatarUrl: String? = null): Result<ConversationDetail> {
        return try {
            Result.success(ApiClient.messagesApi.updateConversation(conversationId, UpdateGroupRequest(name, avatarUrl)))
        } catch (e: HttpException) {
            Result.failure(Exception(e.zrpErrorMessage() ?: "Couldn't save this group. Please try again."))
        } catch (e: Exception) {
            Result.failure(Exception("Couldn't reach ZRP. Check your connection and try again."))
        }
    }

    suspend fun getGroupMessages(conversationId: String, cursor: String? = null): Result<MessagesPage> = runCatching {
        ApiClient.messagesApi.getGroupMessages(conversationId, cursor = cursor)
    }

    suspend fun sendGroupMessage(
        conversationId: String,
        content: String,
        replyToId: String? = null,
        imageUrl: String? = null,
    ): Result<ChatMessage> {
        return try {
            Result.success(
                ApiClient.messagesApi.sendGroupMessage(conversationId, SendGroupMessageRequest(content, imageUrl, replyToId)),
            )
        } catch (e: HttpException) {
            Result.failure(Exception(e.zrpErrorMessage() ?: "Couldn't send this message. Please try again."))
        } catch (e: Exception) {
            Result.failure(Exception("Couldn't reach ZRP. Check your connection and try again."))
        }
    }

    suspend fun addParticipants(conversationId: String, participantIds: List<String>): Result<ConversationDetail> {
        return try {
            Result.success(ApiClient.messagesApi.addParticipants(conversationId, AddParticipantsRequest(participantIds)))
        } catch (e: HttpException) {
            Result.failure(Exception(e.zrpErrorMessage() ?: "Couldn't add those members. Please try again."))
        } catch (e: Exception) {
            Result.failure(Exception("Couldn't reach ZRP. Check your connection and try again."))
        }
    }

    suspend fun removeParticipant(conversationId: String, targetUserId: String): Result<Unit> {
        return try {
            ApiClient.messagesApi.removeParticipant(conversationId, targetUserId)
            Result.success(Unit)
        } catch (e: HttpException) {
            Result.failure(Exception(e.zrpErrorMessage() ?: "Couldn't remove this member. Please try again."))
        } catch (e: Exception) {
            Result.failure(Exception("Couldn't reach ZRP. Check your connection and try again."))
        }
    }
}
