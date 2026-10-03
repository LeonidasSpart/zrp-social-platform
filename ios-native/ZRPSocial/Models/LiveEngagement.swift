import Foundation

/// Which of the two structurally identical live room trees a request or
/// socket event belongs to. Every engagement route (gifts, chat,
/// reactions, reminders, replay) exists once under `live-audio/rooms/`
/// and once under `live-video/rooms/` with the same body and response,
/// and every engagement socket event (`live-chat:*`, `live-gift:sent`,
/// `live-reaction:tap`, `live-replay:*`) is broadcast to whichever room
/// channel the caller joined - so one client layer serves both, keyed on
/// this.
enum LiveRoomKind: String, Equatable, Sendable {
    case audio
    case video

    /// The website's own path for the room, which is also what a
    /// reminder push and a shared link carry (`/live-audio/{id}`,
    /// `/live-video/{id}` - `notifyReminderSubscribers`).
    func webURL(roomId: String) -> URL? {
        let section = self == .audio ? "live-audio" : "live-video"
        return URL(string: "https://zrp.one/\(section)/\(Endpoint.segment(roomId))")
    }
}

// MARK: - Gifts (`src/lib/live-gifts/gift-service.ts`)

/// One `GET /api/live/gifts` catalog entry. Only enabled gifts are ever
/// returned. The server sends no display name: `key` is an
/// admin-defined slug (`/api/admin/live-gifts` accepts any
/// `^[a-z0-9_-]+$`), so `displayName` is derived from it rather than
/// looked up in a fixed table that could never cover a gift added later.
struct LiveGift: Decodable, Identifiable, Equatable {
    let id: String
    let key: String
    let priceCoins: Int
    let iconUrl: String?
    let animationUrl: String?
    let enabled: Bool
    let sortOrder: Int

    var displayName: String { liveGiftDisplayName(key) }
}

/// `"fire_heart"` -> `"Fire heart"`. Pure, so it is unit-tested.
func liveGiftDisplayName(_ key: String) -> String {
    var words: [String] = key
        .split(whereSeparator: { $0 == "_" || $0 == "-" })
        .map { String($0) }
    guard let first = words.first else { return key }
    let capitalizedFirst: String = first.prefix(1).uppercased() + String(first.dropFirst())
    words[0] = capitalizedFirst
    return words.joined(separator: " ")
}

struct LiveGiftCatalogResponse: Decodable {
    let gifts: [LiveGift]
}

/// `GET /api/wallet/coins/balance`. Coins are plain integers server-side
/// (never Decimal/float), and the wallet row is created on first read.
struct LiveCoinBalanceResponse: Decodable {
    let balance: Int
}

/// `POST /api/live-{audio,video}/rooms/{id}/gifts`.
///
/// `idempotencyKey` is generated once per confirmed send and reused if
/// that same send has to be retried after a transport failure, so a
/// retry can never debit twice - the server's unique index on it turns a
/// replay into `duplicate_transaction` instead.
struct LiveSendGiftRequest: Encodable {
    let giftKey: String
    let quantity: Int
    let idempotencyKey: String
}

struct LiveSentGift: Decodable, Equatable {
    let transactionId: String
    let giftKey: String
    let quantity: Int
    let totalCoins: Int
    let senderId: String
    let recipientId: String
}

struct LiveSendGiftResponse: Decodable {
    let gift: LiveSentGift
}

/// `live-gift:sent`, broadcast to the whole room strictly after the
/// ledger transaction commits - so an animation driven by this can never
/// celebrate a gift that did not happen.
struct LiveGiftSentPayload: Decodable, Equatable {
    let transactionId: String
    let senderId: String
    let giftKey: String
    let quantity: Int
    let totalCoins: Int
}

/// The most a single send may carry - `MAX_GIFT_QUANTITY` in
/// `src/lib/live-gifts/constants.ts`.
let liveGiftMaxQuantity = 100

/// One `GET /api/creator/gifts` row: a gift the caller received while
/// live. The route also returns the USDC fee split (`platformFee`,
/// `creatorAmount`, ...); this app deliberately does not decode or show
/// it - earnings are the money surface `CreatorStudioView` leaves to the
/// website for App Store rule 3.1.1, and the same reasoning applies here.
struct LiveReceivedGift: Decodable, Identifiable, Equatable {
    struct Definition: Decodable, Equatable {
        let key: String
        let iconUrl: String?
    }

    struct Sender: Decodable, Equatable {
        let id: String
        let username: String
        let name: String?
        let avatarUrl: String?

        var displayName: String { name ?? username }
    }

    let id: String
    let quantity: Int
    let totalCoins: Int
    let createdAt: Date
    let giftDefinition: Definition
    let sender: Sender
    let liveAudioRoomId: String?
    let liveVideoRoomId: String?
}

struct LiveReceivedGiftsResponse: Decodable {
    let gifts: [LiveReceivedGift]
}

// MARK: - Chat (`src/lib/live-chat/chat-service.ts`)

struct LiveChatAuthor: Decodable, Equatable {
    let id: String
    let username: String
    let name: String?
    let avatarUrl: String?

    var displayName: String { name ?? username }
}

/// A chat message in any of the three shapes the server produces:
/// `GET .../chat` rows carry a full `author`; the `POST .../chat`
/// response and the `live-chat:message` event carry only `authorId`.
/// Both decode into this one type so the list never has to care where a
/// row came from; an `author`-less row is resolved against the room's
/// participant list for display.
struct LiveChatMessage: Decodable, Identifiable, Equatable {
    let id: String
    let authorId: String
    let body: String
    let createdAt: Date
    let author: LiveChatAuthor?

    init(id: String, authorId: String, body: String, createdAt: Date, author: LiveChatAuthor?) {
        self.id = id
        self.authorId = authorId
        self.body = body
        self.createdAt = createdAt
        self.author = author
    }

    private enum CodingKeys: String, CodingKey {
        case id, authorId, body, createdAt, author
    }

    init(from decoder: Decoder) throws {
        let container = try decoder.container(keyedBy: CodingKeys.self)
        id = try container.decode(String.self, forKey: .id)
        body = try container.decode(String.self, forKey: .body)
        createdAt = try container.decode(Date.self, forKey: .createdAt)
        author = try container.decodeIfPresent(LiveChatAuthor.self, forKey: .author)
        if let explicit = try container.decodeIfPresent(String.self, forKey: .authorId) {
            authorId = explicit
        } else if let author {
            authorId = author.id
        } else {
            throw DecodingError.keyNotFound(
                CodingKeys.authorId,
                DecodingError.Context(codingPath: decoder.codingPath, debugDescription: "Neither authorId nor author present")
            )
        }
    }
}

/// Newest-first from the server; `nextCursor` pages further back.
struct LiveChatPage: Decodable {
    let messages: [LiveChatMessage]
    let nextCursor: String?
}

struct LiveSendChatRequest: Encodable {
    let body: String
}

struct LiveSendChatResponse: Decodable {
    let message: LiveChatMessage
}

struct LiveChatMuteRequest: Encodable {
    let userId: String
    let muted: Bool
}

struct LiveSlowModeRequest: Encodable {
    let seconds: Int
}

/// `MAX_MESSAGE_LENGTH` in chat-service.ts - checked on the trimmed body.
let liveChatMaxLength = 500

/// The slow-mode choices offered to a host/moderator. The route accepts
/// any whole number 0...3600; these are the steps worth a menu entry.
let liveSlowModeOptions: [Int] = [0, 5, 10, 30, 60, 120, 300]

struct LiveChatDeletedPayload: Decodable {
    let id: String
}

struct LiveChatMuteChangedPayload: Decodable {
    let userId: String
    let isChatMuted: Bool
}

struct LiveSlowModeChangedPayload: Decodable {
    let seconds: Int
}

// MARK: - Reactions (`src/lib/live-reactions/reaction-service.ts`)

/// Rapid taps are batched into one request carrying `count`;
/// `MAX_TAPS_PER_REQUEST` server-side caps a batch at 20.
struct LiveReactionRequest: Encodable {
    let count: Int
}

struct LiveReactionResponse: Decodable {
    let roomReactionCount: Int
}

struct LiveReactionTapPayload: Decodable {
    let userId: String
    let count: Int
    let roomReactionCount: Int
}

// MARK: - Replay (`src/lib/live-replay/replay-service.ts`)

/// A completed recording - `GET .../replay` only ever lists
/// `EGRESS_COMPLETE` rows, and `mediaUrl` is written exclusively by the
/// LiveKit `egress_ended` webhook, never speculatively.
struct LiveRecording: Decodable, Identifiable, Equatable {
    let id: String
    let mediaUrl: String?
    let durationSeconds: Int?
    let startedAt: Date?
    let endedAt: Date?
}

struct LiveRecordingsResponse: Decodable {
    let recordings: [LiveRecording]
}

struct LiveStartRecordingResponse: Decodable {
    let recordingId: String
}

// MARK: - Socket payload decoding

/// Decodes a `SocketEvent`'s JSON payload. A dedicated decoder because
/// several live payloads carry a `createdAt`, which Socket.IO delivers as
/// the same `JSON.stringify(Date)` ISO-8601 string the REST API uses -
/// a bare `JSONDecoder` would reject it.
enum LiveSocketPayload {

    private static let fractional = Date.ISO8601FormatStyle(includingFractionalSeconds: true)
    private static let plain = Date.ISO8601FormatStyle(includingFractionalSeconds: false)

    static func decode<T: Decodable>(_ type: T.Type, from data: Data) -> T? {
        let decoder = JSONDecoder()
        decoder.dateDecodingStrategy = .custom { decoder in
            let raw = try decoder.singleValueContainer().decode(String.self)
            if let date = try? fractional.parse(raw) { return date }
            if let date = try? plain.parse(raw) { return date }
            throw DecodingError.dataCorrupted(
                DecodingError.Context(codingPath: decoder.codingPath, debugDescription: "Unrecognised ISO-8601 timestamp")
            )
        }
        return try? decoder.decode(type, from: data)
    }
}
