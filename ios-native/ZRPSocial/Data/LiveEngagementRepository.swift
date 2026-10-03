import Foundation

/// Everything that happens *inside* a live room besides the room itself:
/// gifts, chat, reactions, scheduled-live reminders and replay. Each of
/// these routes exists twice on the server - once under
/// `live-audio/rooms/{id}/...` and once under `live-video/rooms/{id}/...`
/// with the same body and response - so one repository serves both,
/// keyed on `LiveRoomKind`.
///
/// Every path is written out in full in `roomPath(_:_:_:)` rather than
/// assembled from a prefix. That keeps each route greppable as the
/// literal string the server serves (what `Tools/audit-parity.py`
/// checks PARITY.md's IMPLEMENTED rows against) instead of hiding it
/// behind string concatenation.
///
/// Coin top-ups (`POST /api/wallet/coins/purchase`) are intentionally
/// absent: that route takes a real-money on-chain payment and refuses any
/// request carrying `x-zrp-native-app` (`rejectNativePayment`), for the
/// same App Store rule 3.1.1 reason tips and plan upgrades are absent
/// from this app. Only spending an existing balance is offered here.
protocol LiveEngagementRepositoryProtocol: Sendable {
    // Gifts
    func giftCatalog() async throws -> [LiveGift]
    func coinBalance() async throws -> Int
    func sendGift(kind: LiveRoomKind, roomId: String, request: LiveSendGiftRequest) async throws -> LiveSentGift
    func receivedGifts() async throws -> [LiveReceivedGift]

    // Chat
    func chatMessages(kind: LiveRoomKind, roomId: String, cursor: String?) async throws -> LiveChatPage
    func sendChatMessage(kind: LiveRoomKind, roomId: String, body: String) async throws -> LiveChatMessage
    func deleteChatMessage(kind: LiveRoomKind, roomId: String, messageId: String) async throws
    func setChatMute(kind: LiveRoomKind, roomId: String, userId: String, muted: Bool) async throws
    func setSlowMode(kind: LiveRoomKind, roomId: String, seconds: Int) async throws

    // Reactions
    func sendReactions(kind: LiveRoomKind, roomId: String, count: Int) async throws -> Int

    // Reminders
    func setReminder(kind: LiveRoomKind, roomId: String) async throws
    func clearReminder(kind: LiveRoomKind, roomId: String) async throws

    // Replay
    func recordings(kind: LiveRoomKind, roomId: String) async throws -> [LiveRecording]
    func startRecording(kind: LiveRoomKind, roomId: String) async throws -> String
    func stopRecording(kind: LiveRoomKind, roomId: String) async throws
    func deleteRecording(kind: LiveRoomKind, roomId: String, recordingId: String) async throws
}

struct LiveEngagementRepository: LiveEngagementRepositoryProtocol {

    private let client: ApiClient

    init(client: ApiClient = .shared) {
        self.client = client
    }

    /// The per-room engagement routes. One case per route the server
    /// actually serves.
    enum RoomRoute {
        case gifts
        case chat
        case chatMessage(id: String)
        case chatMute
        case chatSlowMode
        case reactions
        case reminder
        case replay
        case replayStart
        case replayStop
        case replayRecording(id: String)
    }

    static func roomPath(_ kind: LiveRoomKind, _ roomId: String, _ route: RoomRoute) -> String {
        let id = Endpoint.segment(roomId)
        switch kind {
        case .audio:
            switch route {
            case .gifts: return "live-audio/rooms/\(id)/gifts"
            case .chat: return "live-audio/rooms/\(id)/chat"
            case .chatMessage(let messageId): return "live-audio/rooms/\(id)/chat/\(Endpoint.segment(messageId))"
            case .chatMute: return "live-audio/rooms/\(id)/chat/mute"
            case .chatSlowMode: return "live-audio/rooms/\(id)/chat/slow-mode"
            case .reactions: return "live-audio/rooms/\(id)/reactions"
            case .reminder: return "live-audio/rooms/\(id)/reminder"
            case .replay: return "live-audio/rooms/\(id)/replay"
            case .replayStart: return "live-audio/rooms/\(id)/replay/start"
            case .replayStop: return "live-audio/rooms/\(id)/replay/stop"
            case .replayRecording(let recordingId): return "live-audio/rooms/\(id)/replay/\(Endpoint.segment(recordingId))"
            }
        case .video:
            switch route {
            case .gifts: return "live-video/rooms/\(id)/gifts"
            case .chat: return "live-video/rooms/\(id)/chat"
            case .chatMessage(let messageId): return "live-video/rooms/\(id)/chat/\(Endpoint.segment(messageId))"
            case .chatMute: return "live-video/rooms/\(id)/chat/mute"
            case .chatSlowMode: return "live-video/rooms/\(id)/chat/slow-mode"
            case .reactions: return "live-video/rooms/\(id)/reactions"
            case .reminder: return "live-video/rooms/\(id)/reminder"
            case .replay: return "live-video/rooms/\(id)/replay"
            case .replayStart: return "live-video/rooms/\(id)/replay/start"
            case .replayStop: return "live-video/rooms/\(id)/replay/stop"
            case .replayRecording(let recordingId): return "live-video/rooms/\(id)/replay/\(Endpoint.segment(recordingId))"
            }
        }
    }

    // MARK: - Gifts

    func giftCatalog() async throws -> [LiveGift] {
        let response: LiveGiftCatalogResponse = try await client.send(Endpoint.get("live/gifts"))
        return response.gifts
    }

    func coinBalance() async throws -> Int {
        let response: LiveCoinBalanceResponse = try await client.send(Endpoint.get("wallet/coins/balance"))
        return response.balance
    }

    func sendGift(kind: LiveRoomKind, roomId: String, request: LiveSendGiftRequest) async throws -> LiveSentGift {
        let response: LiveSendGiftResponse = try await client.send(
            try Endpoint.post(Self.roomPath(kind, roomId, .gifts), body: request)
        )
        return response.gift
    }

    func receivedGifts() async throws -> [LiveReceivedGift] {
        let response: LiveReceivedGiftsResponse = try await client.send(Endpoint.get("creator/gifts"))
        return response.gifts
    }

    // MARK: - Chat

    func chatMessages(kind: LiveRoomKind, roomId: String, cursor: String?) async throws -> LiveChatPage {
        try await client.send(Endpoint.get(Self.roomPath(kind, roomId, .chat), query: [("cursor", cursor), ("limit", "50")]))
    }

    func sendChatMessage(kind: LiveRoomKind, roomId: String, body: String) async throws -> LiveChatMessage {
        let response: LiveSendChatResponse = try await client.send(
            try Endpoint.post(Self.roomPath(kind, roomId, .chat), body: LiveSendChatRequest(body: body))
        )
        return response.message
    }

    func deleteChatMessage(kind: LiveRoomKind, roomId: String, messageId: String) async throws {
        try await client.sendIgnoringResponse(Endpoint.delete(Self.roomPath(kind, roomId, .chatMessage(id: messageId))))
    }

    func setChatMute(kind: LiveRoomKind, roomId: String, userId: String, muted: Bool) async throws {
        try await client.sendIgnoringResponse(
            try Endpoint.post(Self.roomPath(kind, roomId, .chatMute), body: LiveChatMuteRequest(userId: userId, muted: muted))
        )
    }

    func setSlowMode(kind: LiveRoomKind, roomId: String, seconds: Int) async throws {
        try await client.sendIgnoringResponse(
            try Endpoint.post(Self.roomPath(kind, roomId, .chatSlowMode), body: LiveSlowModeRequest(seconds: seconds))
        )
    }

    // MARK: - Reactions

    func sendReactions(kind: LiveRoomKind, roomId: String, count: Int) async throws -> Int {
        let response: LiveReactionResponse = try await client.send(
            try Endpoint.post(Self.roomPath(kind, roomId, .reactions), body: LiveReactionRequest(count: count))
        )
        return response.roomReactionCount
    }

    // MARK: - Reminders

    func setReminder(kind: LiveRoomKind, roomId: String) async throws {
        try await client.sendIgnoringResponse(Endpoint.post(Self.roomPath(kind, roomId, .reminder)))
    }

    func clearReminder(kind: LiveRoomKind, roomId: String) async throws {
        try await client.sendIgnoringResponse(Endpoint.delete(Self.roomPath(kind, roomId, .reminder)))
    }

    // MARK: - Replay

    func recordings(kind: LiveRoomKind, roomId: String) async throws -> [LiveRecording] {
        let response: LiveRecordingsResponse = try await client.send(Endpoint.get(Self.roomPath(kind, roomId, .replay)))
        return response.recordings
    }

    func startRecording(kind: LiveRoomKind, roomId: String) async throws -> String {
        let response: LiveStartRecordingResponse = try await client.send(
            Endpoint.post(Self.roomPath(kind, roomId, .replayStart))
        )
        return response.recordingId
    }

    func stopRecording(kind: LiveRoomKind, roomId: String) async throws {
        try await client.sendIgnoringResponse(Endpoint.post(Self.roomPath(kind, roomId, .replayStop)))
    }

    func deleteRecording(kind: LiveRoomKind, roomId: String, recordingId: String) async throws {
        try await client.sendIgnoringResponse(Endpoint.delete(Self.roomPath(kind, roomId, .replayRecording(id: recordingId))))
    }
}
