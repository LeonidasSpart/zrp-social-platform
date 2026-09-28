import Foundation

/// `PlayDuel.status` on the backend.
enum PlayDuelStatus: String, Decodable, Equatable {
    case pending = "PENDING"
    case accepted = "ACCEPTED"
    case declined = "DECLINED"
    case completed = "COMPLETED"
    case expired = "EXPIRED"
    case unknown

    init(from decoder: Decoder) throws {
        let raw = try decoder.singleValueContainer().decode(String.self)
        self = PlayDuelStatus(rawValue: raw.uppercased()) ?? .unknown
    }

    var titleKey: L10nKey? {
        switch self {
        case .pending: return .playPending
        case .accepted: return .playAccepted
        case .declined: return .playDeclined
        case .completed: return .playCompleted
        case .expired: return .playExpired
        case .unknown: return nil
        }
    }
}

/// The lean challenge reference `GET /api/play/duels` (the list) embeds -
/// no `content`, unlike `PlayDuelDetail.challenge`, which is a real
/// `PlayChallenge` and does carry it (answer-stripped) for actually
/// playing.
struct PlayDuelChallengeRef: Decodable, Equatable {
    let id: String
    let type: PlayChallengeType
    let title: String
    let difficulty: PlayDifficulty?
    let maxScore: Int?
}

/// One row from `GET /api/play/duels` - every duel the viewer is either
/// side of, any status.
struct PlayDuel: Decodable, Identifiable, Equatable {
    let id: String
    let status: PlayDuelStatus
    let challengerId: String
    let opponentId: String
    let challengerScore: Int?
    let opponentScore: Int?
    let winnerId: String?
    let createdAt: Date
    let expiresAt: Date
    let completedAt: Date?
    let challenge: PlayDuelChallengeRef
    let challenger: PostAuthor
    let opponent: PostAuthor
}

/// `GET /api/play/duels/{id}` and the accept/decline response - the same
/// row, but with the real, playable `PlayChallenge` (content included,
/// answers stripped) instead of `PlayDuelChallengeRef`'s summary.
struct PlayDuelDetail: Decodable, Identifiable, Equatable {
    let id: String
    let status: PlayDuelStatus
    let challengerId: String
    let opponentId: String
    let challengerScore: Int?
    let opponentScore: Int?
    let winnerId: String?
    let createdAt: Date
    let expiresAt: Date
    let completedAt: Date?
    let challenge: PlayChallenge
    let challenger: PostAuthor
    let opponent: PostAuthor
}
