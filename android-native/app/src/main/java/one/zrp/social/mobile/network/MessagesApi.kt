package one.zrp.social.mobile.network

import retrofit2.http.Body
import retrofit2.http.DELETE
import retrofit2.http.GET
import retrofit2.http.POST
import retrofit2.http.PUT
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
    val edited: Boolean = false,
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
    val replyToId: String? = null,
)

data class EditMessageRequest(val content: String)

data class MessageReactionRequest(val emoji: String)

// action is "added"/"removed"/"changed" - see the route's own comment
// on why a message carries at most one reaction per person (switching
// emoji replaces it), unlike a post's Reaction model which allows
// several distinct emoji from the same person.
data class MessageReactionResponse(val action: String, val reactions: List<MessageReaction>)

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

    // Either party to the conversation may delete a message - unlike
    // posts/comments, this isn't author-only (see the route's own
    // senderId-or-receiverId check) since there's no per-side "delete
    // for me only" concept in this schema; it deletes the one shared row.
    @DELETE("messages/delete/{id}")
    suspend fun deleteMessage(@Path("id") messageId: String)

    // Sender-only, server-side (src/app/api/messages/edit/[id]/route.ts).
    // Sets edited=true, unlike post/comment edits which have no such flag.
    @PUT("messages/edit/{id}")
    suspend fun editMessage(@Path("id") messageId: String, @Body request: EditMessageRequest): ChatMessage

    @POST("messages/reaction/{id}")
    suspend fun toggleReaction(@Path("id") messageId: String, @Body request: MessageReactionRequest): MessageReactionResponse
}
