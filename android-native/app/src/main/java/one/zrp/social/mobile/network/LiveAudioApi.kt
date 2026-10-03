package one.zrp.social.mobile.network

import retrofit2.http.Body
import retrofit2.http.GET
import retrofit2.http.POST
import retrofit2.http.Path
import retrofit2.http.Query

data class LiveAudioHost(
    val id: String,
    val username: String,
    val name: String?,
    val avatarUrl: String?,
    val badgeType: String?,
)

data class LiveAudioCommunitySummary(val id: String, val name: String, val slug: String)

/** One row of GET /live-audio/rooms - the discovery list. */
data class LiveAudioRoomSummary(
    val id: String,
    val title: String,
    val description: String?,
    val category: String?,
    // "PUBLIC" | "COMMUNITY" | "PRIVATE"
    val visibility: String,
    val startedAt: String?,
    val host: LiveAudioHost,
    val community: LiveAudioCommunitySummary?,
    val listenerCount: Int,
)

data class LiveAudioRoomsPage(val rooms: List<LiveAudioRoomSummary>, val nextCursor: String?)

/** The raw Prisma row returned by create/detail/start - src/lib/live-audio/room-service.ts. */
data class LiveAudioRoom(
    val id: String,
    val hostId: String,
    val communityId: String?,
    val title: String,
    val description: String?,
    val category: String?,
    // "SCHEDULED" | "LIVE" | "ENDED" | "CANCELLED"
    val status: String,
    val visibility: String,
    val scheduledAt: String?,
    val startedAt: String?,
    val endedAt: String?,
    val createdAt: String,
    val updatedAt: String,
    // Host-configurable chat slow mode, 0 = off (live-chat/chat-service.ts);
    // updated live by `live-chat:slow-mode-changed`.
    val slowModeSeconds: Int = 0,
    // Running aggregate of every reaction tap in this room
    // (live-reactions/reaction-service.ts); updated live by
    // `live-reaction:tap`'s roomReactionCount.
    val reactionCount: Int = 0,
)

data class CreateLiveAudioRoomResponse(val room: LiveAudioRoom)

data class CreateLiveAudioRoomRequest(
    val title: String,
    val description: String? = null,
    val category: String? = null,
    // "PUBLIC" | "COMMUNITY" | "PRIVATE"
    val visibility: String = "PUBLIC",
    val communityId: String? = null,
    // ISO date string - a future value creates a SCHEDULED room instead
    // of one that's LIVE immediately.
    val scheduledAt: String? = null,
)

/** One entry in a room's participant list - GET /live-audio/rooms/{id}. */
data class LiveAudioParticipant(
    // "HOST" | "MODERATOR" | "SPEAKER" | "LISTENER"
    val role: String,
    val isMuted: Boolean,
    val joinedAt: String,
    val user: LiveAudioHost,
)

data class LiveAudioRoomDetail(
    val room: LiveAudioRoom,
    val participants: List<LiveAudioParticipant>,
    // Only nonzero for the caller when they're HOST/MODERATOR - never
    // trust this as "there ARE no requests" if 0 and not room authority,
    // the server simply always reports 0 to non-authority callers.
    val pendingRequestCount: Int,
    // "HOST" | "MODERATOR" | "SPEAKER" | "LISTENER" | null - null means
    // the caller isn't (or is no longer) a participant.
    val myRole: String?,
)

/** POST /live-audio/rooms/{id}/join - real-time connection to be minted via LiveKit.connect(livekitUrl, token). */
data class LiveAudioJoinParticipant(val role: String)
data class LiveAudioJoinResponse(
    val participant: LiveAudioJoinParticipant,
    val token: String,
    val livekitUrl: String,
)

/** POST /live-audio/rooms/{id}/token - reissue for the caller's CURRENT role (call after a role-changed event affecting me, or on reconnect). */
data class LiveAudioTokenResponse(val token: String, val livekitUrl: String)

data class LiveAudioUserIdRequest(val userId: String)
data class LiveAudioMuteRequest(val userId: String, val muted: Boolean)
data class LiveAudioRemoveRequest(val userId: String, val reason: String? = null)

data class LiveAudioSuccessResponse(val success: Boolean)

// ─── Real-time (Socket.IO `live-audio:*` events, src/lib/live-audio/
// room-service.ts's own emitToLiveAudioRoom/emitToUser calls) ─────────

data class LiveAudioParticipantJoinedPayload(val userId: String, val role: String)
data class LiveAudioParticipantLeftPayload(val userId: String)
data class LiveAudioParticipantRemovedPayload(val userId: String)
data class LiveAudioRoomEndedPayload(val roomId: String)
data class LiveAudioRoleChangedPayload(val userId: String, val role: String)
data class LiveAudioMuteChangedPayload(val userId: String, val isMuted: Boolean)
data class LiveAudioYouWereRemovedPayload(val roomId: String)
data class LiveAudioSpeakerRequestPayload(val roomId: String, val userId: String)

/**
 * ZRP Live Audio - a LiveKit-backed audio room feature (Twitter Spaces/
 * Clubhouse-style), paid-gated to pro/business/enterprise plans server-
 * side (src/lib/live-audio/entitlement.ts - liveAudio in limits.ts).
 * Every route requires a signed-in session (withLiveAudioAuth wraps
 * requireActiveUser() - see src/lib/live-audio/route-helpers.ts) except
 * the discovery list, which also works logged out for PUBLIC rooms.
 *
 * Real-time room state (participants joining/leaving, role/mute
 * changes, the room ending, a speak request) arrives over the existing
 * app-wide Socket.IO connection (ZrpSocket) as `live-audio:*` events -
 * see LiveAudioRoomViewModel's own KDoc for the exact event contract,
 * which mirrors src/lib/live-audio/room-service.ts's own
 * emitToLiveAudioRoom/emitToUser calls verbatim. These REST routes
 * never need polling once a room's socket channel is joined.
 */
interface LiveAudioApi {
    @GET("live-audio/rooms")
    suspend fun getRooms(@Query("cursor") cursor: String?): LiveAudioRoomsPage

    @POST("live-audio/rooms")
    suspend fun createRoom(@Body request: CreateLiveAudioRoomRequest): CreateLiveAudioRoomResponse

    @GET("live-audio/rooms/{id}")
    suspend fun getRoom(@Path("id") roomId: String): LiveAudioRoomDetail

    @POST("live-audio/rooms/{id}/join")
    suspend fun joinRoom(@Path("id") roomId: String): LiveAudioJoinResponse

    @POST("live-audio/rooms/{id}/token")
    suspend fun refreshToken(@Path("id") roomId: String): LiveAudioTokenResponse

    @POST("live-audio/rooms/{id}/leave")
    suspend fun leaveRoom(@Path("id") roomId: String): LiveAudioSuccessResponse

    @POST("live-audio/rooms/{id}/end")
    suspend fun endRoom(@Path("id") roomId: String): LiveAudioSuccessResponse

    @POST("live-audio/rooms/{id}/start")
    suspend fun startRoom(@Path("id") roomId: String): CreateLiveAudioRoomResponse

    @POST("live-audio/rooms/{id}/cancel")
    suspend fun cancelRoom(@Path("id") roomId: String): LiveAudioSuccessResponse

    // Host/moderator invites a listener directly to speak (no prior raised hand).
    @POST("live-audio/rooms/{id}/promote")
    suspend fun promote(@Path("id") roomId: String, @Body request: LiveAudioUserIdRequest): LiveAudioSuccessResponse

    @POST("live-audio/rooms/{id}/demote")
    suspend fun demote(@Path("id") roomId: String, @Body request: LiveAudioUserIdRequest): LiveAudioSuccessResponse

    @POST("live-audio/rooms/{id}/mute")
    suspend fun mute(@Path("id") roomId: String, @Body request: LiveAudioMuteRequest): LiveAudioSuccessResponse

    @POST("live-audio/rooms/{id}/remove")
    suspend fun remove(@Path("id") roomId: String, @Body request: LiveAudioRemoveRequest): LiveAudioSuccessResponse

    @POST("live-audio/rooms/{id}/speak/request")
    suspend fun requestToSpeak(@Path("id") roomId: String): LiveAudioSuccessResponse

    @POST("live-audio/rooms/{id}/speak/approve")
    suspend fun approveSpeakRequest(@Path("id") roomId: String, @Body request: LiveAudioUserIdRequest): LiveAudioSuccessResponse

    @POST("live-audio/rooms/{id}/speak/reject")
    suspend fun rejectSpeakRequest(@Path("id") roomId: String, @Body request: LiveAudioUserIdRequest): LiveAudioSuccessResponse
}
