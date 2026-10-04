package one.zrp.social.mobile.network

import retrofit2.http.Body
import retrofit2.http.GET
import retrofit2.http.POST
import retrofit2.http.Path
import retrofit2.http.Query

/**
 * One row of GET /live-video/rooms - same shape as Live Audio's
 * discovery row, except the live head-count is `viewerCount` (see
 * src/lib/live-video/room-service.ts listDiscoverableRooms) rather than
 * Live Audio's `listenerCount`.
 */
data class LiveVideoRoomSummary(
    val id: String,
    val title: String,
    val description: String?,
    val category: String?,
    val visibility: String,
    val startedAt: String?,
    val host: LiveAudioHost,
    val community: LiveAudioCommunitySummary?,
    val viewerCount: Int,
)

data class LiveVideoRoomsPage(val rooms: List<LiveVideoRoomSummary>, val nextCursor: String?)

/**
 * One entry in a Live Video room's participant list. [isCameraOff] is
 * the moderator-forced flag (POST /camera) - NOT "has this person turned
 * their camera on yet"; a participant who simply hasn't enabled their
 * camera has isCameraOff=false but publishes no video track, and the
 * room screen falls back to their avatar in that case.
 */
data class LiveVideoParticipant(
    // "HOST" | "MODERATOR" | "SPEAKER" | "LISTENER"
    val role: String,
    val isMuted: Boolean,
    val isCameraOff: Boolean,
    val joinedAt: String,
    val user: LiveAudioHost,
)

/**
 * GET /live-video/rooms/{id}. The room row has exactly the columns a
 * LiveAudioRoom row has (same lifecycle, same SCHEDULED/LIVE/ENDED/
 * CANCELLED statuses, same slowModeSeconds/reactionCount), so the
 * existing [LiveAudioRoom] type is reused rather than duplicated.
 */
data class LiveVideoRoomDetail(
    val room: LiveAudioRoom,
    val participants: List<LiveVideoParticipant>,
    val pendingRequestCount: Int,
    val myRole: String?,
)

data class LiveVideoCameraRequest(val userId: String, val cameraOff: Boolean)

// Real-time `live-video:*` payloads not shared with Live Audio.
data class LiveVideoCameraChangedPayload(val userId: String, val isCameraOff: Boolean)

/**
 * ZRP Live Video - the camera-tile parallel to [LiveAudioApi]: identical
 * role model (HOST/MODERATOR/SPEAKER/LISTENER), lifecycle and LiveKit
 * token flow, under the same paid entitlement (requireLiveVideoAccess
 * reuses Live Audio's checkLiveAudioAccess). Request/response types that
 * are byte-identical to Live Audio's are reused from LiveAudioApi.kt.
 *
 * Real-time room state arrives as `live-video:*` Socket.IO events on the
 * room's own channel, joined with `join-live-video-room` (server.js) -
 * see LiveVideoRoomViewModel's KDoc for the full event list.
 */
interface LiveVideoApi {
    @GET("live-video/rooms")
    suspend fun getRooms(@Query("cursor") cursor: String?): LiveVideoRoomsPage

    @POST("live-video/rooms")
    suspend fun createRoom(@Body request: CreateLiveAudioRoomRequest): CreateLiveAudioRoomResponse

    @GET("live-video/rooms/{id}")
    suspend fun getRoom(@Path("id") roomId: String): LiveVideoRoomDetail

    @POST("live-video/rooms/{id}/join")
    suspend fun joinRoom(@Path("id") roomId: String): LiveAudioJoinResponse

    @POST("live-video/rooms/{id}/token")
    suspend fun refreshToken(@Path("id") roomId: String): LiveAudioTokenResponse

    @POST("live-video/rooms/{id}/leave")
    suspend fun leaveRoom(@Path("id") roomId: String): LiveAudioSuccessResponse

    @POST("live-video/rooms/{id}/end")
    suspend fun endRoom(@Path("id") roomId: String): LiveAudioSuccessResponse

    @POST("live-video/rooms/{id}/start")
    suspend fun startRoom(@Path("id") roomId: String): CreateLiveAudioRoomResponse

    @POST("live-video/rooms/{id}/cancel")
    suspend fun cancelRoom(@Path("id") roomId: String): LiveAudioSuccessResponse

    @POST("live-video/rooms/{id}/promote")
    suspend fun promote(@Path("id") roomId: String, @Body request: LiveAudioUserIdRequest): LiveAudioSuccessResponse

    @POST("live-video/rooms/{id}/demote")
    suspend fun demote(@Path("id") roomId: String, @Body request: LiveAudioUserIdRequest): LiveAudioSuccessResponse

    @POST("live-video/rooms/{id}/mute")
    suspend fun mute(@Path("id") roomId: String, @Body request: LiveAudioMuteRequest): LiveAudioSuccessResponse

    @POST("live-video/rooms/{id}/camera")
    suspend fun setCamera(@Path("id") roomId: String, @Body request: LiveVideoCameraRequest): LiveAudioSuccessResponse

    @POST("live-video/rooms/{id}/remove")
    suspend fun remove(@Path("id") roomId: String, @Body request: LiveAudioRemoveRequest): LiveAudioSuccessResponse

    @POST("live-video/rooms/{id}/speak/request")
    suspend fun requestToJoin(@Path("id") roomId: String): LiveAudioSuccessResponse

    @POST("live-video/rooms/{id}/speak/approve")
    suspend fun approveJoinRequest(@Path("id") roomId: String, @Body request: LiveAudioUserIdRequest): LiveAudioSuccessResponse

    @POST("live-video/rooms/{id}/speak/reject")
    suspend fun rejectJoinRequest(@Path("id") roomId: String, @Body request: LiveAudioUserIdRequest): LiveAudioSuccessResponse
}
