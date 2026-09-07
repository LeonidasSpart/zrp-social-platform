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
    // Both nullable, and neither is ever read by the UI (ConversationScreen
    // renders from senderId/receiverId plus the screen's own nav params
    // instead) - kept only because the real REST responses carry them.
    // Nullable because the real-time "receive-message"/"message-sent"
    // socket push carries a deliberately minimal payload with neither
    // field (see server.js's send-message handler) - the same partial
    // state ChatInterface.tsx itself renders with until its own next
    // 5-second poll fills the row in, not a native-only gap.
    val sender: PostAuthor?,
    val receiver: PostAuthor?,
    val replyTo: ChatMessage?,
    val reactions: List<MessageReaction> = emptyList(),
)

// The minimal shape server.js's send-message handler actually relays
// over "receive-message"/"message-sent" - see the handler's own
// `message = { id, senderId, receiverId, content, createdAt, read }`
// literal. Deserialized separately from ChatMessage (rather than trying
// to force the same type) since Gson would otherwise leave sender,
// receiver, edited, replyTo and reactions silently absent for a type
// that, on the REST fetch path, always has them.
data class SocketMessagePreview(
    val id: String,
    val senderId: String,
    val receiverId: String,
    val content: String,
    val createdAt: String,
    val read: Boolean,
) {
    fun toChatMessage() = ChatMessage(
        id = id,
        content = content,
        imageUrl = null,
        senderId = senderId,
        receiverId = receiverId,
        read = read,
        edited = false,
        createdAt = createdAt,
        sender = null,
        receiver = null,
        replyTo = null,
        reactions = emptyList(),
    )
}

// "edit-message"/"message-reaction" relays already carry the exact shape
// their own originating REST call returned (see edit/[id]/route.ts and
// reaction/[id]/route.ts), so those two are deserialized straight into
// ChatMessage/MessageReaction - only delete/read/typing need their own
// minimal shape below.
data class SocketMessageEditedPayload(val message: ChatMessage)
data class SocketMessageDeletedPayload(val messageId: String)
data class SocketMessageReadPayload(val messageId: String)
data class SocketReactionUpdatedPayload(val messageId: String, val reactions: List<MessageReaction>)
data class SocketTypingPayload(val userId: String, val isTyping: Boolean)

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
