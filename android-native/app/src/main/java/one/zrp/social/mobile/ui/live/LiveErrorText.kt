package one.zrp.social.mobile.ui.live

import androidx.compose.runtime.Composable
import androidx.compose.ui.res.stringResource
import one.zrp.social.mobile.R
import one.zrp.social.mobile.data.LiveApiException
import one.zrp.social.mobile.util.localizedError

/**
 * Translated text for a typed ZRP Live error. Branches on the server's
 * machine-readable `code` (never on its English message), so every
 * language gets a real sentence; an unrecognised code falls back to the
 * server's own message, and only then to the generic "try again".
 */
@Composable
fun liveErrorText(error: LiveApiException?): String? {
    if (error == null) return null
    return when (error.code) {
        LiveApiException.CODE_NETWORK -> stringResource(R.string.auth_err_network)
        "insufficient_balance" -> stringResource(R.string.live_err_insufficient_balance)
        "gift_not_found", "gift_disabled" -> stringResource(R.string.live_err_gift_unavailable)
        "cannot_gift_self" -> stringResource(R.string.live_err_cannot_gift_self)
        "invalid_quantity" -> stringResource(R.string.live_err_invalid_quantity)
        "not_participant" -> stringResource(R.string.live_err_not_participant)
        "blocked" -> stringResource(R.string.live_err_blocked)
        "room_not_live", "room_already_ended" -> stringResource(R.string.live_err_room_not_live)
        "room_not_found" -> stringResource(R.string.live_audio_room_not_found)
        "chat_muted" -> stringResource(R.string.live_chat_muted_notice)
        "slow_mode" -> stringResource(R.string.live_err_slow_mode)
        LiveApiException.CODE_RATE_LIMITED -> stringResource(R.string.live_err_rate_limited)
        "validation_error" -> stringResource(R.string.live_err_validation)
        "forbidden" -> stringResource(R.string.live_err_forbidden)
        "message_not_found" -> stringResource(R.string.live_err_message_not_found)
        "not_scheduled" -> stringResource(R.string.live_err_not_scheduled)
        "cannot_remind_self" -> stringResource(R.string.live_err_cannot_remind_self)
        "replay_not_configured" -> stringResource(R.string.live_recording_unavailable)
        "recording_not_found" -> stringResource(R.string.live_err_recording_not_found)
        else -> localizedError(error.serverMessage) ?: stringResource(R.string.auth_err_try_again)
    }
}
