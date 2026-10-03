package one.zrp.social.mobile.network

import retrofit2.http.Body
import retrofit2.http.DELETE
import retrofit2.http.GET
import retrofit2.http.POST
import retrofit2.http.Path
import retrofit2.http.Query

// ─── Gifts + coin wallet (src/lib/live-gifts/gift-service.ts) ────────

/**
 * One row of GET /live/gifts - the server-owned catalog (only enabled
 * gifts are ever returned there). Display name is resolved client-side
 * from [key] (see ui/live/LiveGiftDisplay.kt), never sent by the server.
 */
data class LiveGift(
    val id: String,
    val key: String,
    val priceCoins: Int,
    val iconUrl: String?,
    val animationUrl: String?,
    val enabled: Boolean,
    val sortOrder: Int,
)

data class LiveGiftCatalogResponse(val gifts: List<LiveGift>)

/** GET /wallet/coins/balance - an integer coin count (never fractional). */
data class CoinBalanceResponse(val balance: Int)

/**
 * POST /live-{audio,video}/rooms/{id}/gifts. [idempotencyKey] is a
 * client-generated UUID reused across retries of the SAME logical send,
 * so a request that committed server-side but whose response was lost
 * can never be charged twice (the retry gets duplicate_transaction).
 */
data class SendLiveGiftRequest(val giftKey: String, val quantity: Int, val idempotencyKey: String)

data class SentLiveGift(
    val transactionId: String,
    val giftKey: String,
    val quantity: Int,
    val totalCoins: Int,
    val senderId: String,
    val recipientId: String,
    val createdAt: String,
)

data class SendLiveGiftResponse(val success: Boolean, val gift: SentLiveGift)

data class CreatorGiftDefinitionSummary(val key: String, val iconUrl: String?)

data class CreatorGiftSender(val id: String, val username: String, val name: String?, val avatarUrl: String?)

/**
 * One row of GET /creator/gifts (getGiftHistoryForCreator). Money fields
 * arrive as plain numbers (jsonWithDecimals), matching every other
 * creator-earnings surface in this app.
 */
data class CreatorGiftTransaction(
    val id: String,
    val quantity: Int,
    val unitPriceCoins: Int,
    val totalCoins: Int,
    val creatorAmount: Double,
    val createdAt: String,
    val liveAudioRoomId: String?,
    val liveVideoRoomId: String?,
    val giftDefinition: CreatorGiftDefinitionSummary,
    val sender: CreatorGiftSender,
)

data class CreatorGiftsResponse(val gifts: List<CreatorGiftTransaction>)

// ─── Chat (src/lib/live-chat/chat-service.ts) ─────────────────────────

data class LiveChatAuthor(val id: String, val username: String, val name: String?, val avatarUrl: String?)

/** One row of GET .../chat - newest first, soft-deleted rows already excluded server-side. */
data class LiveChatHistoryMessage(
    val id: String,
    val body: String,
    val createdAt: String,
    val author: LiveChatAuthor,
)

data class LiveChatPage(val messages: List<LiveChatHistoryMessage>, val nextCursor: String?)

data class SendLiveChatRequest(val body: String)

data class SentLiveChatMessage(val id: String, val authorId: String, val body: String, val createdAt: String)

data class SendLiveChatResponse(val success: Boolean, val message: SentLiveChatMessage)

data class LiveChatMuteRequest(val userId: String, val muted: Boolean)

data class LiveChatSlowModeRequest(val seconds: Int)

// ─── Reactions (src/lib/live-reactions/reaction-service.ts) ───────────

/** [count] batches several rapid taps into one request; the server caps a single request at 20. */
data class LiveReactionRequest(val count: Int)

data class LiveReactionResponse(val success: Boolean, val roomReactionCount: Int)

// ─── Replay (src/lib/live-replay/replay-service.ts) ──────────────────

/** Only EGRESS_COMPLETE, non-deleted recordings are ever listed - [mediaUrl] is never speculative. */
data class LiveRecording(
    val id: String,
    val mediaUrl: String?,
    val durationSeconds: Int?,
    val startedAt: String,
    val endedAt: String?,
)

data class LiveRecordingsResponse(val recordings: List<LiveRecording>)

data class StartLiveRecordingResponse(val success: Boolean, val recordingId: String, val egressId: String)

data class LiveSuccessResponse(val success: Boolean)

// ─── Real-time payloads (same per-room Socket.IO channel the room's own
// live-audio:*/live-video:* events arrive on - see socket-emit.ts's
// emitToLiveAudioRoom/emitToLiveVideoRoom) ──────────────────────────

data class LiveGiftSentPayload(
    val transactionId: String,
    val senderId: String,
    val giftKey: String,
    val quantity: Int,
    val totalCoins: Int,
)

data class LiveChatMessagePayload(val id: String, val authorId: String, val body: String, val createdAt: String?)

data class LiveChatMessageDeletedPayload(val id: String)

data class LiveChatMuteChangedPayload(val userId: String, val isChatMuted: Boolean)

data class LiveChatSlowModeChangedPayload(val seconds: Int)

data class LiveReactionTapPayload(val userId: String, val count: Int, val roomReactionCount: Int)

data class LiveRecordingStartedPayload(val recordingId: String)

/**
 * ZRP Live interactions shared by Live Audio AND Live Video - every
 * room-scoped route exists identically under both `live-audio/rooms/...`
 * and `live-video/rooms/...` (the route files are one-line wrappers
 * around the same service with roomType "AUDIO"/"VIDEO"), so [kind] is
 * the literal first path segment: "live-audio" or "live-video" (see
 * ui/live/LiveRoomKind.kt). Never any other value.
 *
 * Coin PURCHASE (POST /wallet/coins/purchase) is deliberately absent:
 * the backend rejects it for the native app (rejectNativePayment - the
 * same store-sensitive-payment policy that makes Tips web-only here),
 * so this app only ever reads the balance and spends it.
 */
interface LiveInteractionsApi {
    @GET("live/gifts")
    suspend fun getGiftCatalog(): LiveGiftCatalogResponse

    @GET("wallet/coins/balance")
    suspend fun getCoinBalance(): CoinBalanceResponse

    @GET("creator/gifts")
    suspend fun getCreatorGifts(): CreatorGiftsResponse

    @POST("{kind}/rooms/{id}/gifts")
    suspend fun sendGift(
        @Path("kind") kind: String,
        @Path("id") roomId: String,
        @Body request: SendLiveGiftRequest,
    ): SendLiveGiftResponse

    @GET("{kind}/rooms/{id}/chat")
    suspend fun getChat(
        @Path("kind") kind: String,
        @Path("id") roomId: String,
        @Query("cursor") cursor: String?,
        @Query("limit") limit: Int?,
    ): LiveChatPage

    @POST("{kind}/rooms/{id}/chat")
    suspend fun sendChat(
        @Path("kind") kind: String,
        @Path("id") roomId: String,
        @Body request: SendLiveChatRequest,
    ): SendLiveChatResponse

    @DELETE("{kind}/rooms/{id}/chat/{messageId}")
    suspend fun deleteChat(
        @Path("kind") kind: String,
        @Path("id") roomId: String,
        @Path("messageId") messageId: String,
    ): LiveSuccessResponse

    @POST("{kind}/rooms/{id}/chat/mute")
    suspend fun setChatMute(
        @Path("kind") kind: String,
        @Path("id") roomId: String,
        @Body request: LiveChatMuteRequest,
    ): LiveSuccessResponse

    @POST("{kind}/rooms/{id}/chat/slow-mode")
    suspend fun setSlowMode(
        @Path("kind") kind: String,
        @Path("id") roomId: String,
        @Body request: LiveChatSlowModeRequest,
    ): LiveSuccessResponse

    @POST("{kind}/rooms/{id}/reactions")
    suspend fun sendReaction(
        @Path("kind") kind: String,
        @Path("id") roomId: String,
        @Body request: LiveReactionRequest,
    ): LiveReactionResponse

    @POST("{kind}/rooms/{id}/reminder")
    suspend fun setReminder(@Path("kind") kind: String, @Path("id") roomId: String): LiveSuccessResponse

    @DELETE("{kind}/rooms/{id}/reminder")
    suspend fun cancelReminder(@Path("kind") kind: String, @Path("id") roomId: String): LiveSuccessResponse

    @GET("{kind}/rooms/{id}/replay")
    suspend fun getReplays(@Path("kind") kind: String, @Path("id") roomId: String): LiveRecordingsResponse

    @POST("{kind}/rooms/{id}/replay/start")
    suspend fun startRecording(@Path("kind") kind: String, @Path("id") roomId: String): StartLiveRecordingResponse

    @POST("{kind}/rooms/{id}/replay/stop")
    suspend fun stopRecording(@Path("kind") kind: String, @Path("id") roomId: String): LiveSuccessResponse

    @DELETE("{kind}/rooms/{id}/replay/{recordingId}")
    suspend fun deleteRecording(
        @Path("kind") kind: String,
        @Path("id") roomId: String,
        @Path("recordingId") recordingId: String,
    ): LiveSuccessResponse
}
