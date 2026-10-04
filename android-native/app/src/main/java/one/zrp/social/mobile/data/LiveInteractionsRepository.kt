package one.zrp.social.mobile.data

import com.google.gson.Gson
import one.zrp.social.mobile.network.ApiClient
import one.zrp.social.mobile.network.CoinBalanceResponse
import one.zrp.social.mobile.network.CreatorGiftsResponse
import one.zrp.social.mobile.network.LiveChatMuteRequest
import one.zrp.social.mobile.network.LiveChatPage
import one.zrp.social.mobile.network.LiveChatSlowModeRequest
import one.zrp.social.mobile.network.LiveGiftCatalogResponse
import one.zrp.social.mobile.network.LiveReactionRequest
import one.zrp.social.mobile.network.LiveReactionResponse
import one.zrp.social.mobile.network.LiveRecordingsResponse
import one.zrp.social.mobile.network.LiveSuccessResponse
import one.zrp.social.mobile.network.SendLiveChatRequest
import one.zrp.social.mobile.network.SendLiveChatResponse
import one.zrp.social.mobile.network.SendLiveGiftRequest
import one.zrp.social.mobile.network.SendLiveGiftResponse
import one.zrp.social.mobile.network.StartLiveRecordingResponse
import retrofit2.HttpException

/**
 * Which of the two parallel ZRP Live backends a room lives on. Every
 * room-scoped interaction route (gifts, chat, reactions, reminders,
 * replay) exists identically under both prefixes, and the room's
 * Socket.IO channel is joined with `join-<prefix>-room`.
 */
enum class LiveRoomKind(val pathSegment: String) {
    AUDIO("live-audio"),
    VIDEO("live-video"),
    ;

    val joinSocketEvent: String get() = "join-$pathSegment-room"
    val leaveSocketEvent: String get() = "leave-$pathSegment-room"
}

/**
 * A typed ZRP Live API failure. Every live route maps its errors through
 * liveAudioErrorResponseBody ({ error, code, retryAfter? }), so [code] is
 * the machine-readable value the UI branches on (insufficient_balance,
 * slow_mode, chat_muted, replay_not_configured, ...) and [serverMessage]
 * is the server's own English text, used only as a last-resort fallback
 * when no translated string exists for [code].
 *
 * [code] is [CODE_NETWORK] when no HTTP response arrived at all - the
 * outcome of the request is then UNKNOWN (it may have committed), which
 * is exactly the case the gift panel's idempotency-key reuse exists for.
 */
class LiveApiException(
    val code: String,
    val status: Int,
    val serverMessage: String?,
    val retryAfterSeconds: Int?,
) : Exception(serverMessage ?: code) {
    companion object {
        const val CODE_NETWORK = "network"
        const val CODE_UNKNOWN = "unknown"
        const val CODE_RATE_LIMITED = "rate_limited"
    }
}

private data class LiveErrorBody(val error: String?, val code: String?, val retryAfter: Int?)

private val liveErrorGson = Gson()

/**
 * Parses an HttpException's body exactly once (see ApiErrors.kt's own
 * KDoc on why the error stream can't be read twice). A 429 from the
 * generic route-level limiter (rateLimit() in src/lib/rate-limit.ts)
 * carries `retryAfter` but no `code`, so it is normalised to
 * rate_limited here rather than surfacing as an unknown error.
 */
internal fun HttpException.toLiveApiException(): LiveApiException {
    val raw = runCatching { response()?.errorBody()?.string() }.getOrNull()
    val body = raw?.let { runCatching { liveErrorGson.fromJson(it, LiveErrorBody::class.java) }.getOrNull() }
    val headerRetryAfter = response()?.headers()?.get("Retry-After")?.toIntOrNull()
    val status = code()
    val resolvedCode = body?.code
        ?: if (status == 429) LiveApiException.CODE_RATE_LIMITED else LiveApiException.CODE_UNKNOWN
    return LiveApiException(
        code = resolvedCode,
        status = status,
        serverMessage = body?.error,
        retryAfterSeconds = body?.retryAfter ?: headerRetryAfter,
    )
}

/**
 * ZRP Live gifts, coin balance, chat, reactions, reminders and replay -
 * one repository for both room kinds (see [LiveRoomKind]). Unlike
 * LiveAudioRepository (which flattens failures to a display string),
 * every failure here is a [LiveApiException] so the UI can branch on
 * the server's typed error code: a slow-mode cooldown needs
 * `retryAfter`, a gift send needs to tell "insufficient balance" apart
 * from "the network dropped and the charge may have gone through", and
 * a reaction tap must stay silent on rate_limited.
 */
class LiveInteractionsRepository {
    suspend fun getGiftCatalog(): Result<LiveGiftCatalogResponse> = wrap { ApiClient.liveInteractionsApi.getGiftCatalog() }

    suspend fun getCoinBalance(): Result<CoinBalanceResponse> = wrap { ApiClient.liveInteractionsApi.getCoinBalance() }

    suspend fun getCreatorGifts(): Result<CreatorGiftsResponse> = wrap { ApiClient.liveInteractionsApi.getCreatorGifts() }

    suspend fun sendGift(kind: LiveRoomKind, roomId: String, giftKey: String, quantity: Int, idempotencyKey: String): Result<SendLiveGiftResponse> = wrap {
        ApiClient.liveInteractionsApi.sendGift(kind.pathSegment, roomId, SendLiveGiftRequest(giftKey, quantity, idempotencyKey))
    }

    suspend fun getChat(kind: LiveRoomKind, roomId: String, cursor: String?, limit: Int? = null): Result<LiveChatPage> = wrap {
        ApiClient.liveInteractionsApi.getChat(kind.pathSegment, roomId, cursor, limit)
    }

    suspend fun sendChat(kind: LiveRoomKind, roomId: String, body: String): Result<SendLiveChatResponse> = wrap {
        ApiClient.liveInteractionsApi.sendChat(kind.pathSegment, roomId, SendLiveChatRequest(body))
    }

    suspend fun deleteChat(kind: LiveRoomKind, roomId: String, messageId: String): Result<LiveSuccessResponse> = wrap {
        ApiClient.liveInteractionsApi.deleteChat(kind.pathSegment, roomId, messageId)
    }

    suspend fun setChatMute(kind: LiveRoomKind, roomId: String, userId: String, muted: Boolean): Result<LiveSuccessResponse> = wrap {
        ApiClient.liveInteractionsApi.setChatMute(kind.pathSegment, roomId, LiveChatMuteRequest(userId, muted))
    }

    suspend fun setSlowMode(kind: LiveRoomKind, roomId: String, seconds: Int): Result<LiveSuccessResponse> = wrap {
        ApiClient.liveInteractionsApi.setSlowMode(kind.pathSegment, roomId, LiveChatSlowModeRequest(seconds))
    }

    suspend fun sendReaction(kind: LiveRoomKind, roomId: String, count: Int): Result<LiveReactionResponse> = wrap {
        ApiClient.liveInteractionsApi.sendReaction(kind.pathSegment, roomId, LiveReactionRequest(count))
    }

    suspend fun setReminder(kind: LiveRoomKind, roomId: String): Result<LiveSuccessResponse> = wrap {
        ApiClient.liveInteractionsApi.setReminder(kind.pathSegment, roomId)
    }

    suspend fun cancelReminder(kind: LiveRoomKind, roomId: String): Result<LiveSuccessResponse> = wrap {
        ApiClient.liveInteractionsApi.cancelReminder(kind.pathSegment, roomId)
    }

    suspend fun getReplays(kind: LiveRoomKind, roomId: String): Result<LiveRecordingsResponse> = wrap {
        ApiClient.liveInteractionsApi.getReplays(kind.pathSegment, roomId)
    }

    suspend fun startRecording(kind: LiveRoomKind, roomId: String): Result<StartLiveRecordingResponse> = wrap {
        ApiClient.liveInteractionsApi.startRecording(kind.pathSegment, roomId)
    }

    suspend fun stopRecording(kind: LiveRoomKind, roomId: String): Result<LiveSuccessResponse> = wrap {
        ApiClient.liveInteractionsApi.stopRecording(kind.pathSegment, roomId)
    }

    suspend fun deleteRecording(kind: LiveRoomKind, roomId: String, recordingId: String): Result<LiveSuccessResponse> = wrap {
        ApiClient.liveInteractionsApi.deleteRecording(kind.pathSegment, roomId, recordingId)
    }

    private suspend fun <T> wrap(block: suspend () -> T): Result<T> {
        return try {
            Result.success(block())
        } catch (e: HttpException) {
            Result.failure(e.toLiveApiException())
        } catch (e: kotlinx.coroutines.CancellationException) {
            throw e
        } catch (e: Exception) {
            Result.failure(LiveApiException(LiveApiException.CODE_NETWORK, 0, ZrpErrors.NETWORK, null))
        }
    }
}
