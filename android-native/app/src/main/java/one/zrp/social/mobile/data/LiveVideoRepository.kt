package one.zrp.social.mobile.data

import one.zrp.social.mobile.network.ApiClient
import one.zrp.social.mobile.network.CreateLiveAudioRoomRequest
import one.zrp.social.mobile.network.CreateLiveAudioRoomResponse
import one.zrp.social.mobile.network.LiveAudioJoinResponse
import one.zrp.social.mobile.network.LiveAudioMuteRequest
import one.zrp.social.mobile.network.LiveAudioRemoveRequest
import one.zrp.social.mobile.network.LiveAudioSuccessResponse
import one.zrp.social.mobile.network.LiveAudioTokenResponse
import one.zrp.social.mobile.network.LiveAudioUserIdRequest
import one.zrp.social.mobile.network.LiveVideoCameraRequest
import one.zrp.social.mobile.network.LiveVideoRoomDetail
import one.zrp.social.mobile.network.LiveVideoRoomsPage
import one.zrp.social.mobile.network.zrpErrorBody
import retrofit2.HttpException

/**
 * Failure from a Live Video room-lifecycle call: the server's own message
 * (shown as-is, exactly like LiveAudioRepository) plus its typed [code],
 * which the room screen needs for one case Live Audio's screen never
 * distinguished - telling "this room hasn't started yet / already ended"
 * (render the scheduled/ended state) apart from a real join failure.
 */
class LiveRoomCallException(message: String, val code: String?) : Exception(message)

/**
 * ZRP Live Video - the same thin wrapper over the real REST contract as
 * [LiveAudioRepository] (see its KDoc), pointed at /live-video/rooms.
 */
class LiveVideoRepository {
    suspend fun getOwnUserId(): Result<String?> = runCatching {
        ApiClient.authApi.getSession().user?.id
    }

    suspend fun getRooms(cursor: String?): Result<LiveVideoRoomsPage> = wrap { ApiClient.liveVideoApi.getRooms(cursor) }

    suspend fun createRoom(request: CreateLiveAudioRoomRequest): Result<CreateLiveAudioRoomResponse> = wrap {
        ApiClient.liveVideoApi.createRoom(request)
    }

    suspend fun getRoom(roomId: String): Result<LiveVideoRoomDetail> = wrap { ApiClient.liveVideoApi.getRoom(roomId) }

    suspend fun joinRoom(roomId: String): Result<LiveAudioJoinResponse> = wrap { ApiClient.liveVideoApi.joinRoom(roomId) }

    suspend fun refreshToken(roomId: String): Result<LiveAudioTokenResponse> = wrap { ApiClient.liveVideoApi.refreshToken(roomId) }

    suspend fun leaveRoom(roomId: String): Result<LiveAudioSuccessResponse> = wrap { ApiClient.liveVideoApi.leaveRoom(roomId) }

    suspend fun endRoom(roomId: String): Result<LiveAudioSuccessResponse> = wrap { ApiClient.liveVideoApi.endRoom(roomId) }

    suspend fun startRoom(roomId: String): Result<CreateLiveAudioRoomResponse> = wrap { ApiClient.liveVideoApi.startRoom(roomId) }

    suspend fun cancelRoom(roomId: String): Result<LiveAudioSuccessResponse> = wrap { ApiClient.liveVideoApi.cancelRoom(roomId) }

    suspend fun promote(roomId: String, userId: String): Result<LiveAudioSuccessResponse> = wrap {
        ApiClient.liveVideoApi.promote(roomId, LiveAudioUserIdRequest(userId))
    }

    suspend fun demote(roomId: String, userId: String): Result<LiveAudioSuccessResponse> = wrap {
        ApiClient.liveVideoApi.demote(roomId, LiveAudioUserIdRequest(userId))
    }

    suspend fun mute(roomId: String, userId: String, muted: Boolean): Result<LiveAudioSuccessResponse> = wrap {
        ApiClient.liveVideoApi.mute(roomId, LiveAudioMuteRequest(userId, muted))
    }

    suspend fun setCamera(roomId: String, userId: String, cameraOff: Boolean): Result<LiveAudioSuccessResponse> = wrap {
        ApiClient.liveVideoApi.setCamera(roomId, LiveVideoCameraRequest(userId, cameraOff))
    }

    suspend fun remove(roomId: String, userId: String, reason: String? = null): Result<LiveAudioSuccessResponse> = wrap {
        ApiClient.liveVideoApi.remove(roomId, LiveAudioRemoveRequest(userId, reason))
    }

    suspend fun requestToJoin(roomId: String): Result<LiveAudioSuccessResponse> = wrap { ApiClient.liveVideoApi.requestToJoin(roomId) }

    suspend fun approveJoinRequest(roomId: String, userId: String): Result<LiveAudioSuccessResponse> = wrap {
        ApiClient.liveVideoApi.approveJoinRequest(roomId, LiveAudioUserIdRequest(userId))
    }

    suspend fun rejectJoinRequest(roomId: String, userId: String): Result<LiveAudioSuccessResponse> = wrap {
        ApiClient.liveVideoApi.rejectJoinRequest(roomId, LiveAudioUserIdRequest(userId))
    }

    private suspend fun <T> wrap(block: suspend () -> T): Result<T> {
        return try {
            Result.success(block())
        } catch (e: HttpException) {
            val body = e.zrpErrorBody()
            Result.failure(LiveRoomCallException(body?.error ?: "Something went wrong. Please try again.", body?.code))
        } catch (e: kotlinx.coroutines.CancellationException) {
            throw e
        } catch (e: Exception) {
            Result.failure(LiveRoomCallException(ZrpErrors.NETWORK, null))
        }
    }
}
