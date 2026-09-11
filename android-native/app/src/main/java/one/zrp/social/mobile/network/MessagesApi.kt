package one.zrp.social.mobile.network

import retrofit2.http.Body
import retrofit2.http.DELETE
import retrofit2.http.GET
import retrofit2.http.PATCH
import retrofit2.http.POST
import retrofit2.http.PUT
import retrofit2.http.Path
import retrofit2.http.Query

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
    // Nullable because prisma/schema.prisma's own Message.receiverId is
    // nullable now (see its KDoc) - a real GROUP message has no single
    // receiver at all, so this is always null on those rows. Every
    // existing 1:1 message keeps a real, non-null value here.
    val receiverId: String?,
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

// The "conversation-deleted" relay server.js sends to both parties of a
// deleted 1:1 conversation (see its own delete-conversation handler KDoc)
// - withUserId is whichever side this client wasn't, i.e. the partner
// whose row should now disappear from the list. Received here so a
// conversation deleted from another client (web, or this same account's
// other device) also drops off this screen's list live, not just after
// the next full refresh.
data class SocketConversationDeletedPayload(val withUserId: String)
data class SocketMessageReadPayload(val messageId: String)
data class SocketReactionUpdatedPayload(val messageId: String, val reactions: List<MessageReaction>)
data class SocketTypingPayload(val userId: String, val isTyping: Boolean)

// server.js's own real userStatus Map, broadcast to every connected
// client on "user-status" (connect/disconnect - see the handler's own
// comment on why this isn't scoped to a room) and answerable on demand
// per-userId via "get-status". status is always literally "online" or
// "offline" - never any other value.
data class SocketUserStatusPayload(val userId: String, val status: String)

// The real cursor-aware envelope GET /messages/{userId} switches to the
// moment a client sends cursor and/or limit (see the route's own
// comment on why: the bare-array shape below stays byte-for-byte
// identical for every client that never asks for a page, so this is
// additive, not a breaking contract change). Used only by
// getOlderConversationMessages - the initial/poll fetch keeps using the
// plain array endpoint, unchanged.
data class MessagesPage(
    val items: List<ChatMessage>,
    val nextCursor: String?,
)

data class ConversationSummary(
    val partner: PostAuthor,
    val lastMessage: ChatMessage,
    val unreadCount: Int,
)

data class SendMessageRequest(
    val content: String,
    val receiverId: String,
    val imageUrl: String? = null,
    val replyToId: String? = null,
)

data class EditMessageRequest(val content: String)

data class MessageReactionRequest(val emoji: String)

// action is "added"/"removed"/"changed" - see the route's own comment
// on why a message carries at most one reaction per person (switching
// emoji replaces it), unlike a post's Reaction model which allows
// several distinct emoji from the same person.
data class MessageReactionResponse(val action: String, val reactions: List<MessageReaction>)

// ─── Group conversations (claude/group-chat-schema's real backend) ───
// GET /api/conversations - one row per GROUP conversation this user
// currently belongs to (see src/lib/conversations.ts's own
// getUserGroupConversations KDoc). lastMessage is null only for a
// brand-new group nobody has sent into yet. Deliberately its own type
// rather than reusing ConversationSummary above: that one's `partner`
// has no group equivalent (a group has many participants, not one),
// and unlike a 1:1 row this also carries participantCount - the two
// shapes genuinely differ, not just in name.
data class GroupConversationSummary(
    val id: String,
    val name: String?,
    val avatarUrl: String?,
    val participantCount: Int,
    val lastMessage: ChatMessage?,
    val unreadCount: Int,
)

// "OWNER" or "MEMBER" - see prisma/schema.prisma's own
// ConversationParticipantRole enum. Kept as a raw String (not a Kotlin
// enum) the same way ChatMessage's other server-controlled string
// fields already are in this file - one fewer place a not-yet-seen
// server value could throw a deserialization exception outright.
data class ConversationParticipantDto(
    val id: String,
    val conversationId: String,
    val userId: String,
    val role: String,
    val joinedAt: String,
    val lastReadAt: String?,
    val user: PostAuthor,
)

// GET/PATCH /api/conversations/{id} and the two participants routes'
// own response - the real Conversation row plus its full participant
// list (see PARTICIPANT_INCLUDE in the web route). type is always
// "GROUP" here - a real "DIRECT" Conversation row is never surfaced
// through these group-only screens/endpoints.
data class ConversationDetail(
    val id: String,
    val type: String,
    val name: String?,
    val avatarUrl: String?,
    val createdById: String?,
    val createdAt: String,
    val updatedAt: String,
    val participants: List<ConversationParticipantDto>,
)

data class CreateGroupRequest(
    val name: String,
    val participantIds: List<String>,
    val avatarUrl: String? = null,
)

data class UpdateGroupRequest(val name: String? = null, val avatarUrl: String? = null)

data class AddParticipantsRequest(val participantIds: List<String>)

data class SendGroupMessageRequest(
    val content: String,
    val imageUrl: String? = null,
    val replyToId: String? = null,
)

// The minimal shape server.js's send-group-message handler actually
// relays over "receive-group-message" - see the handler's own
// `message = { id, senderId, conversationId, content, createdAt, read }`
// literal (server.js). Mirrors SocketMessagePreview's own KDoc on why
// this is a separate, deliberately minimal type rather than forcing
// the full REST ChatMessage shape onto a live socket push.
data class SocketGroupMessagePreview(
    val id: String,
    val senderId: String,
    val conversationId: String,
    val content: String,
    val createdAt: String,
    val read: Boolean,
) {
    fun toChatMessage() = ChatMessage(
        id = id,
        content = content,
        imageUrl = null,
        senderId = senderId,
        receiverId = null,
        read = read,
        edited = false,
        createdAt = createdAt,
        sender = null,
        receiver = null,
        replyTo = null,
        reactions = emptyList(),
    )
}

// "typing-group"/"user-typing-group" - the group equivalent of
// SocketTypingPayload above, carrying conversationId since a client's
// socket can have several group rooms joined (see ZrpSocket's own
// one-socket-per-screen convention - in practice this app only ever
// joins one at a time, but the server itself is multi-room-capable).
data class SocketGroupTypingPayload(val conversationId: String, val userId: String, val isTyping: Boolean)

/**
 * The same real direct-message system the website uses - GET
 * /messages (one row per conversation partner, most recent message +
 * unread count - a Postgres DISTINCT ON query server-side, not a
 * client-side reduction over full history) and GET /messages/{userId}
 * (full history with that partner; the server also marks their
 * messages read as a side effect, matching the website's own behavior).
 *
 * ConversationViewModel also holds a real Socket.IO connection (see
 * ZrpSocket) for live push delivery, matching the website's own
 * ChatInterface.tsx - this REST layer's own getConversationMessages
 * poll stays running alongside it as a fallback, the same
 * belt-and-suspenders design the website itself uses.
 */
interface MessagesApi {
    @GET("messages")
    suspend fun getConversations(): List<ConversationSummary>

    @GET("messages/{userId}")
    suspend fun getConversationMessages(@Path("userId") userId: String): List<ChatMessage>

    // The same real endpoint above, but sending `cursor` opts into the
    // route's own paginated envelope (see MessagesPage's KDoc) - how
    // ConversationScreen loads history older than its initial window
    // when scrolling to the top of a long conversation.
    @GET("messages/{userId}")
    suspend fun getOlderConversationMessages(
        @Path("userId") userId: String,
        @Query("cursor") cursor: String,
        @Query("limit") limit: Int = 50,
    ): MessagesPage

    @POST("messages")
    suspend fun sendMessage(@Body request: SendMessageRequest): ChatMessage

    // Either party to the conversation may delete a message - unlike
    // posts/comments, this isn't author-only (see the route's own
    // senderId-or-receiverId check) since there's no per-side "delete
    // for me only" concept in this schema; it deletes the one shared row.
    @DELETE("messages/delete/{id}")
    suspend fun deleteMessage(@Path("id") messageId: String)

    // The real, permanent whole-conversation delete
    // (src/app/api/messages/conversation/[userId]/route.ts) - the same
    // endpoint the website's ChatContactDrawer already calls. This is a
    // genuine hard delete: every message between the two users in both
    // directions, server-side, plus their attachments' UploadThing
    // cleanup - not a per-device hide. Before this, no client in this app
    // ever called it; only deleteMessage() (one message) existed here.
    @DELETE("messages/conversation/{userId}")
    suspend fun deleteConversation(@Path("userId") userId: String)

    // Sender-only, server-side (src/app/api/messages/edit/[id]/route.ts).
    // Sets edited=true, unlike post/comment edits which have no such flag.
    @PUT("messages/edit/{id}")
    suspend fun editMessage(@Path("id") messageId: String, @Body request: EditMessageRequest): ChatMessage

    @POST("messages/reaction/{id}")
    suspend fun toggleReaction(@Path("id") messageId: String, @Body request: MessageReactionRequest): MessageReactionResponse

    // Backs the bottom nav's unread-messages badge - the real GET
    // /messages/unread endpoint (a Prisma count of unread rows across
    // every conversation), mirroring notifications/unread exactly.
    // Reuses UnreadCountResponse - NotificationsApi.kt's own {count}
    // shape, same package, no separate response type needed. Distinct
    // from ConversationSummary.unreadCount (getConversations() above),
    // which is the real per-conversation figure MessagesScreen's list
    // rows render - this is the cross-conversation total the nav badge
    // needs instead.
    @GET("messages/unread")
    suspend fun getUnreadCount(): UnreadCountResponse

    // ─── Group conversations - GET/POST /api/conversations and below ──
    @GET("conversations")
    suspend fun getGroupConversations(): List<GroupConversationSummary>

    // requestedIds.length + 1 (the creator) must total at least 3 real
    // members and at most 100 - see the route's own MIN_OTHER_PARTICIPANTS/
    // MAX_PARTICIPANTS - surfaced to the UI as a real 400 error, not
    // pre-validated client-side beyond a bare non-empty check.
    @POST("conversations")
    suspend fun createGroupConversation(@Body request: CreateGroupRequest): ConversationDetail

    @GET("conversations/{id}")
    suspend fun getConversationDetail(@Path("id") conversationId: String): ConversationDetail

    // OWNER-only server-side (see the route's own membership.role check) -
    // the UI hides the rename/avatar controls for a non-owner as a
    // convenience, this 403 is the real boundary either way.
    @PATCH("conversations/{id}")
    suspend fun updateConversation(@Path("id") conversationId: String, @Body request: UpdateGroupRequest): ConversationDetail

    // Same real paginated envelope 1:1's own getOlderConversationMessages
    // uses (MessagesPage) - unlike 1:1, GROUP history has no separate
    // unpaginated endpoint, so this one call covers both the initial
    // load (cursor omitted) and every older-history page after it.
    @GET("conversations/{id}/messages")
    suspend fun getGroupMessages(
        @Path("id") conversationId: String,
        @Query("cursor") cursor: String? = null,
        @Query("limit") limit: Int = 50,
    ): MessagesPage

    @POST("conversations/{id}/messages")
    suspend fun sendGroupMessage(@Path("id") conversationId: String, @Body request: SendGroupMessageRequest): ChatMessage

    // Any current member may add - see the route's own KDoc on why this
    // isn't OWNER-only.
    @POST("conversations/{id}/participants")
    suspend fun addParticipants(@Path("id") conversationId: String, @Body request: AddParticipantsRequest): ConversationDetail

    // Self-removal (leaving) is always allowed; removing someone ELSE is
    // OWNER-only server-side - see the route's own isSelf check. The UI
    // only ever calls this with targetUserId == the caller's own id
    // (leave) or, for an OWNER, someone else's (kick) - never pre-checked
    // beyond what the real 403 already enforces.
    @DELETE("conversations/{id}/participants/{userId}")
    suspend fun removeParticipant(@Path("id") conversationId: String, @Path("userId") targetUserId: String)
}
