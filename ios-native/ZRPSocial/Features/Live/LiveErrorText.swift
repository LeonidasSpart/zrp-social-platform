import Foundation

/// Which live action failed - the same server `code` can deserve
/// different copy depending on what the person was trying to do
/// (`blocked` on a gift is "you can't gift this host", on chat it is
/// "you can't post here"; a bare 429 on chat is a message rate limit, on
/// gifts a send rate limit).
enum LiveAction: Equatable {
    case chat
    case gift
    case reaction
    case reminder
    case replay
    case moderation
}

/// Turns a failed live-room call into specific, translated copy.
///
/// Every live engagement route answers with a typed `{error, code}` body
/// (`LiveAudioError` server-side, reused by every live module). The
/// server's `error` text is English-only, so each known `code` maps to
/// this app's own localized sentence; an unknown code falls back to the
/// server's message, then to the generic live error - never to a raw
/// Swift error description. Pure, so it is unit-tested.
enum LiveErrorText {

    static func message(for error: Error, action: LiveAction) -> String {
        guard let apiError = error as? ApiError else {
            return L10n.string(.liveAudioGenericError)
        }
        return message(for: apiError, action: action)
    }

    static func message(for error: ApiError, action: LiveAction) -> String {
        switch error {
        case .offline, .unauthorized:
            return error.userFacingMessage
        default:
            break
        }

        if let key = key(forCode: error.serverCode, action: action) {
            return localized(key, retryAfter: error.retryAfterSeconds)
        }

        // A 429 with no code at all comes from the route-level IP/user
        // limiter (`checkRateLimit`), not the service - still a rate
        // limit, worded for what was being sent.
        if case .rateLimited = error {
            switch action {
            case .gift: return L10n.string(.iosLiveErrGiftRateLimited)
            case .chat: return localized(.iosLiveErrChatRateLimited, retryAfter: error.retryAfterSeconds)
            default: return error.userFacingMessage
            }
        }

        return error.serverMessage ?? L10n.string(.liveAudioGenericError)
    }

    /// The localized key for a server `code`, or `nil` when this action
    /// has no specific copy for it.
    static func key(forCode code: String?, action: LiveAction) -> L10nKey? {
        guard let code else { return nil }
        switch code {
        // Shared by every live module.
        case "room_not_live": return .iosLiveErrRoomNotLive
        case "room_not_found": return .liveAudioRoomNotFound
        case "not_participant": return .iosLiveErrNotParticipant
        case "forbidden": return .iosLiveErrForbidden
        case "blocked": return action == .gift ? .iosLiveErrGiftBlocked : .iosLiveErrChatBlocked

        // Chat
        case "chat_muted": return .iosLiveErrChatMuted
        case "slow_mode": return .iosLiveChatCooldown
        case "rate_limited": return action == .gift ? .iosLiveErrGiftRateLimited : .iosLiveErrChatRateLimited
        case "message_not_found": return .iosLiveErrMessageNotFound
        case "validation_error": return action == .chat ? .iosLiveErrMessageTooLong : nil

        // Gifts
        case "insufficient_balance": return .iosLiveErrInsufficientBalance
        case "gift_not_found": return .iosLiveErrGiftNotFound
        case "gift_disabled": return .iosLiveErrGiftDisabled
        case "cannot_gift_self": return .iosLiveErrCannotGiftSelf
        case "duplicate_transaction": return .iosLiveErrDuplicateGift
        case "invalid_quantity": return .iosLiveErrInvalidQuantity

        // Reminders
        case "not_scheduled": return .iosLiveErrNotScheduled
        case "cannot_remind_self": return .iosLiveErrCannotRemindSelf

        // Replay
        case "replay_not_configured": return .iosLiveErrReplayNotConfigured
        case "already_recording": return .iosLiveErrAlreadyRecording
        case "not_recording": return .iosLiveErrNotRecording
        case "recording_not_found": return .iosLiveErrRecordingNotFound

        // Room lifecycle (shared with the room screens).
        case "not_configured": return .liveAudioNotConfigured
        default: return nil
        }
    }

    /// Fills the `{n}` a key may carry: seconds to wait for the two rate
    /// limits, and the server's own limits for the two validation keys.
    private static func localized(_ key: L10nKey, retryAfter: Double?) -> String {
        switch key {
        case .iosLiveChatCooldown, .iosLiveErrChatRateLimited:
            let seconds = max(1, Int((retryAfter ?? 1).rounded(.up)))
            return L10n.string(key, ["n": "\(seconds)"])
        case .iosLiveErrMessageTooLong:
            return L10n.string(key, ["n": "\(liveChatMaxLength)"])
        case .iosLiveErrInvalidQuantity:
            return L10n.string(key, ["n": "\(liveGiftMaxQuantity)"])
        default:
            return L10n.string(key)
        }
    }
}
