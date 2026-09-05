package one.zrp.social.mobile.network

import retrofit2.http.Body
import retrofit2.http.GET
import retrofit2.http.POST
import retrofit2.http.Path

data class MessageReaction(
    val id: String,
    val emoji: String,
    val user: PostAuthor,
)

data class ChatMessage(
    val id: String,
    val content: String,
    val imageUrl: String?,
    val senderId: String,
    val receiverId: String,
    val read: Boolean,
    val createdAt: String,
    val sender: PostAuthor,
    // Present on the send-message response, absent on the conversation
    // history fetch - see MessagesApi's own KDoc.
    val receiver: PostAuthor?,
    val replyTo: ChatMessage?,
    val reactions: List<MessageReaction> = emptyList(),
)

data class ConversationSummary(
    val partner: PostAuthor,
    val lastMessage: ChatMessage,
    val unreadCount: Int,
)

data class SendMessageRequest(
    val content: String,
    val receiverId: String,
)

/**
 * The same real direct-message system the website uses - GET
 * /messages (one row per conversation partner, most recent message +
 * unread count - a Postgres DISTINCT ON query server-side, not a
 * client-side reduction over full history) and GET /messages/{userId}
 * (full history with that partner; the server also marks their
 * messages read as a side effect, matching the website's own behavior).
 *
 * No native Socket.io client yet: the website pushes new messages over
 * a live socket connection, but that needs its own real protocol work
 * (handshake, auth, reconnection) and this sandboxed environment has
 * no way to test a live socket connection's actual correctness before
 * merging - unlike a REST call, a subtly wrong socket integration can
 * fail silently. ConversationViewModel instead polls this same real
 * endpoint on an interval as an honest, fully-testable substitute for
 * push delivery until native sockets are built and verified.
 */
interface MessagesApi {
    @GET("messages")
    suspend fun getConversations(): List<ConversationSummary>

    @GET("messages/{userId}")
    suspend fun getConversationMessages(@Path("userId") userId: String): List<ChatMessage>

    @POST("messages")
    suspend fun sendMessage(@Body request: SendMessageRequest): ChatMessage
}
