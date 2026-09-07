import Foundation

/// A ZRP PLAY challenge.
///
/// `content` is only present on the routes that serve a challenge to be
/// played, and it arrives with the answers **stripped server-side**
/// (`stripAnswers` in `src/lib/play/scoring.ts`). Nothing here scores
/// anything: the submit route does that, which is why the answers never
/// leave the server in the first place.
struct PlayChallenge: Decodable, Identifiable, Equatable {
    let id: String
    let type: PlayChallengeType
    let title: String
    let description: String?
    let difficulty: PlayDifficulty?
    let maxScore: Int?
    let playCount: Int?
    let content: PlayContent?
    /// Only on the daily challenge, and only for a signed-in viewer.
    let alreadyPlayed: Bool?
    let creator: PostAuthor?
}

enum PlayChallengeType: String, Decodable, Equatable {
    case trivia = "TRIVIA"
    case memory = "MEMORY"
    case logic = "LOGIC"
    case unknown

    init(from decoder: Decoder) throws {
        let raw = try decoder.singleValueContainer().decode(String.self)
        self = PlayChallengeType(rawValue: raw.uppercased()) ?? .unknown
    }

    var titleKey: L10nKey? {
        switch self {
        case .trivia: return .playTypeTrivia
        case .memory: return .playTypeMemory
        case .logic: return .playTypeLogic
        case .unknown: return nil
        }
    }
}

enum PlayDifficulty: String, Decodable, Equatable {
    case easy = "EASY"
    case medium = "MEDIUM"
    case hard = "HARD"
    case unknown

    init(from decoder: Decoder) throws {
        let raw = try decoder.singleValueContainer().decode(String.self)
        self = PlayDifficulty(rawValue: raw.uppercased()) ?? .unknown
    }

    var titleKey: L10nKey? {
        switch self {
        case .easy: return .playDifficultyEasy
        case .medium: return .playDifficultyMedium
        case .hard: return .playDifficultyHard
        case .unknown: return nil
        }
    }
}

/// The playable part of a challenge, as the server sends it after
/// stripping anything that would give the answer away.
///
/// One type covering all three shapes rather than an enum with
/// associated values: the field carries whichever keys its challenge type
/// uses, and a decoder that insisted on knowing the type first would have
/// to be written by hand for no gain.
struct PlayContent: Decodable, Equatable {
    struct TriviaQuestion: Decodable, Equatable, Identifiable {
        /// The question text. Named `q` by the server.
        let q: String
        let options: [String]

        var id: String { q }
    }

    /// TRIVIA.
    let questions: [TriviaQuestion]?
    /// MEMORY - the face values, which are deliberately not secret: the
    /// game is about remembering where they are, not about hidden data.
    let pairs: [String]?
    /// LOGIC.
    let prompt: String?
    let options: [String]?
}

/// A row on the leaderboard.
struct PlayLeaderboardEntry: Decodable, Identifiable, Equatable {
    let userId: String
    let totalXp: Int
    let level: Int
    let rank: Int?
    let user: PostAuthor?

    var id: String { userId }
}

/// The viewer's own PLAY standing, with the progress figures the server
/// computes (`xpProgress` in `src/lib/play/xp.ts`) - never recomputed
/// here, because the level curve is the server's to define.
struct PlayProfile: Decodable, Equatable {
    let totalXp: Int
    let level: Int
    let currentStreak: Int?
    let longestStreak: Int?
    let challengesCompleted: Int?
    let duelsPlayed: Int?
    let duelsWon: Int?
    let xpIntoLevel: Int?
    let xpForLevel: Int?
    let xpToNextLevel: Int?

    /// How far through the current level, 0…1, for a progress bar only.
    var levelFraction: Double {
        guard let into = xpIntoLevel, let span = xpForLevel, span > 0 else { return 0 }
        return min(1, max(0, Double(into) / Double(span)))
    }
}

/// `GET /api/play/home`.
struct PlayHome: Decodable, Equatable {
    let dailyChallenge: PlayChallenge?
    let trending: [PlayChallenge]
    let topLeaderboard: [PlayLeaderboardEntry]
    let myProfile: PlayProfile?
}

/// What `POST /api/play/challenges/{id}/submit` answers with.
///
/// Every figure here is the server's: the score, the XP, the level and
/// the streak are all computed there, and this only displays them.
struct PlayResult: Decodable, Equatable {
    struct Achievement: Decodable, Equatable, Identifiable {
        let key: String
        let name: String
        let description: String?
        let icon: String?
        let xpReward: Int?

        var id: String { key }
    }

    let score: Int
    let maxScore: Int?
    let xpEarned: Int?
    let totalXp: Int?
    let level: Int?
    let streak: Int?
    let unlockedAchievements: [Achievement]?
    /// Set when this was a duel and the other player has not finished.
    let waitingForOpponent: Bool?
}
