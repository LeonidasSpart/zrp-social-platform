package one.zrp.social.mobile.data

import one.zrp.social.mobile.network.ApiClient
import one.zrp.social.mobile.network.CreateLiveAudioRoomRequest
import one.zrp.social.mobile.network.CreateLiveAudioRoomResponse
import one.zrp.social.mobile.network.LiveAudioJoinResponse
import one.zrp.social.mobile.network.LiveAudioMuteRequest
import one.zrp.social.mobile.network.LiveAudioRemoveRequest
import one.zrp.social.mobile.network.LiveAudioRoomDetail
import one.zrp.social.mobile.network.LiveAudioRoomsPage
import one.zrp.social.mobile.network.LiveAudioSuccessResponse
import one.zrp.social.mobile.network.LiveAudioTokenResponse
import one.zrp.social.mobile.network.LiveAudioUserIdRequest
import one.zrp.social.mobile.network.zrpErrorMessage
import retrofit2.HttpException

/**
 * ZRP Live Audio - wraps the real REST contract every route enforces
 * server-side (plan gate, role authority, room-state validity - see
 * LiveAudioApi's own KDoc). Every method surfaces the server's own
 * specific error message (a plan-gate rejection, "room has ended",
 * "you don't have permission") rather than a generic failure, since
 * these are exactly the messages a host/listener needs to understand
 * what just happened in a live room.
 */
class LiveAudioRepository {
    suspend fun getOwnUserId(): Result<String?> = runCatching {
        ApiClient.authApi.getSession().user?.id
    }

    suspend fun getRooms(cursor: String?): Result<LiveAudioRoomsPage> = wrap {
        ApiClient.liveAudioApi.getRooms(cursor)
    }

    suspend fun createRoom(request: CreateLiveAudioRoomRequest): Result<CreateLiveAudioRoomResponse> = wrap {
        ApiClient.liveAudioApi.createRoom(request)
    }

    suspend fun getRoom(roomId: String): Result<LiveAudioRoomDetail> = wrap {
        ApiClient.liveAudioApi.getRoom(roomId)
    }

    suspend fun joinRoom(roomId: String): Result<LiveAudioJoinResponse> = wrap {
        ApiClient.liveAudioApi.joinRoom(roomId)
    }

    suspend fun refreshToken(roomId: String): Result<LiveAudioTokenResponse> = wrap {
        ApiClient.liveAudioApi.refreshToken(roomId)
    }

    suspend fun leaveRoom(roomId: String): Result<LiveAudioSuccessResponse> = wrap {
        ApiClient.liveAudioApi.leaveRoom(roomId)
    }

    suspend fun endRoom(roomId: String): Result<LiveAudioSuccessResponse> = wrap {
        ApiClient.liveAudioApi.endRoom(roomId)
    }

    suspend fun startRoom(roomId: String): Result<CreateLiveAudioRoomResponse> = wrap {
        ApiClient.liveAudioApi.startRoom(roomId)
    }

    suspend fun cancelRoom(roomId: String): Result<LiveAudioSuccessResponse> = wrap {
        ApiClient.liveAudioApi.cancelRoom(roomId)
    }

    suspend fun promote(roomId: String, userId: String): Result<LiveAudioSuccessResponse> = wrap {
        ApiClient.liveAudioApi.promote(roomId, LiveAudioUserIdRequest(userId))
    }

    suspend fun demote(roomId: String, userId: String): Result<LiveAudioSuccessResponse> = wrap {
        ApiClient.liveAudioApi.demote(roomId, LiveAudioUserIdRequest(userId))
    }

    suspend fun mute(roomId: String, userId: String, muted: Boolean): Result<LiveAudioSuccessResponse> = wrap {
        ApiClient.liveAudioApi.mute(roomId, LiveAudioMuteRequest(userId, muted))
    }

    suspend fun remove(roomId: String, userId: String, reason: String? = null): Result<LiveAudioSuccessResponse> = wrap {
        ApiClient.liveAudioApi.remove(roomId, LiveAudioRemoveRequest(userId, reason))
    }

    suspend fun requestToSpeak(roomId: String): Result<LiveAudioSuccessResponse> = wrap {
        ApiClient.liveAudioApi.requestToSpeak(roomId)
    }

    suspend fun approveSpeakRequest(roomId: String, userId: String): Result<LiveAudioSuccessResponse> = wrap {
        ApiClient.liveAudioApi.approveSpeakRequest(roomId, LiveAudioUserIdRequest(userId))
    }

    suspend fun rejectSpeakRequest(roomId: String, userId: String): Result<LiveAudioSuccessResponse> = wrap {
        ApiClient.liveAudioApi.rejectSpeakRequest(roomId, LiveAudioUserIdRequest(userId))
    }

    private suspend fun <T> wrap(block: suspend () -> T): Result<T> {
        return try {
            Result.success(block())
        } catch (e: HttpException) {
            Result.failure(Exception(e.zrpErrorMessage() ?: "Something went wrong. Please try again."))
        } catch (e: Exception) {
            Result.failure(Exception(ZrpErrors.NETWORK))
        }
    }
}
