import Foundation

protocol PlayRepositoryProtocol: Sendable {
    func home() async throws -> PlayHome
    func challenge(id: String) async throws -> PlayChallenge
    func leaderboard() async throws -> [PlayLeaderboardEntry]
    func submit(challengeId: String, submission: PlaySubmission) async throws -> PlayResult
    func createChallenge(_ request: CreateChallengeRequest) async throws -> PlayChallenge
    func generateChallenge(topic: String, type: String, difficulty: String) async throws -> GeneratedChallenge
    /// `GET /api/play/duels` - every duel the viewer is either side of.
    /// Requires a session. The route paginates; this app shows the first
    /// page only, same as PlayDuelsScreen.kt.
    func duels(status: PlayDuelStatus?) async throws -> [PlayDuel]
    func duel(id: String) async throws -> PlayDuelDetail
    func createDuel(challengeId: String, opponentId: String) async throws -> PlayDuel
    func respondToDuel(id: String, accept: Bool) async throws -> PlayDuelDetail
}

/// `POST /api/play/challenges`. `content`'s shape depends on `type`, so it
/// is built by the caller (`PlayCreateChallengeViewModel`) rather than
/// hard-coded here - the same reason `PlaySubmission` above stays one flat
/// struct instead of an enum: the route reads whichever keys its own
/// `type` calls for and ignores the rest.
struct CreateChallengeRequest: Encodable {
    let type: String
    let title: String
    let description: String?
    let difficulty: String
    let content: ChallengeContentPayload
}

/// One question, both as what the manual builder edits and as what
/// `POST /api/play/challenges/generate` hands back for review before
/// publishing - the AI-generated `correctIndex` is real here (unlike
/// `PlayContent.TriviaQuestion` on the *play* side, which never carries
/// one), since the creator needs to see and can edit it.
struct TriviaQuestionPayload: Codable, Equatable {
    var q: String
    var options: [String]
    var correctIndex: Int
}

/// `PlayChallenge.content`'s create-time shape, one case per game type
/// this app can build (`GAME_REGISTRY`'s three manually-buildable types -
/// see PlayCreateChallengeViewModel's own note on why REACTION/SEQUENCE
/// are absent). Matches `validateChallengeContent` in
/// `src/lib/play/scoring.ts` key-for-key so the server's own rules are
/// what a validation failure here reports.
enum ChallengeContentPayload: Encodable, Equatable {
    case trivia(questions: [TriviaQuestionPayload])
    case memory(pairs: [String])
    case logicChoice(prompt: String, options: [String], correctIndex: Int)
    case logicText(prompt: String, answer: String)

    private enum CodingKeys: String, CodingKey {
        case questions, pairs, prompt, options, correctIndex, answer
    }

    func encode(to encoder: Encoder) throws {
        var container = encoder.container(keyedBy: CodingKeys.self)
        switch self {
        case .trivia(let questions):
            try container.encode(questions, forKey: .questions)
        case .memory(let pairs):
            try container.encode(pairs, forKey: .pairs)
        case .logicChoice(let prompt, let options, let correctIndex):
            try container.encode(prompt, forKey: .prompt)
            try container.encode(options, forKey: .options)
            try container.encode(correctIndex, forKey: .correctIndex)
        case .logicText(let prompt, let answer):
            try container.encode(prompt, forKey: .prompt)
            try container.encode(answer, forKey: .answer)
        }
    }
}

/// `POST /api/play/challenges/generate`'s response - the model's own
/// draft, unstripped (the creator reviews and can edit it before
/// `POST /api/play/challenges` actually publishes it), so this is
/// deliberately not `PlayChallenge`/`PlayContent`, which only ever carry
/// the stripped, already-published shape.
struct GeneratedChallenge: Decodable, Equatable {
    let title: String
    let description: String?
    let type: String
    let difficulty: String
    let content: GeneratedContent
}

struct GeneratedContent: Decodable, Equatable {
    /// TRIVIA.
    let questions: [TriviaQuestionPayload]?
    /// MEMORY.
    let pairs: [String]?
    /// LOGIC.
    let prompt: String?
    let options: [String]?
    let correctIndex: Int?
    let answer: String?
}

/// What the viewer did, in whatever shape the challenge's type calls for.
///
/// The server scores it (`scoreTrivia`, `scoreMemory`, `scoreLogic`) and
/// this app deliberately does not: the answers are stripped from the
/// content before it ever reaches a client, so nothing here could score
/// a challenge even if it wanted to. Duplicating that logic would also
/// mean two definitions of what a correct answer is.
struct PlaySubmission: Encodable, Equatable {
    /// TRIVIA: the chosen option index per question, in order.
    var answers: [Int]?
    /// MEMORY.
    var moves: Int?
    var matchedPairs: Int?
    /// LOGIC.
    var answerIndex: Int?
    var answerText: String?
    /// How long it took, which feeds the server's own scoring.
    var timeMs: Int?
    /// Set when this challenge is being played as one side of a duel.
    /// The route reads this to score both sides against the shared
    /// challenge and settle the duel once both have submitted - see
    /// `PlayResult.duelCompleted`.
    var duelId: String?
}

struct PlayRepository: PlayRepositoryProtocol {

    private let client: ApiClient

    init(client: ApiClient = .shared) {
        self.client = client
    }

    /// `GET /api/play/home` - today's challenge, what is trending, the
    /// top of the leaderboard, and the viewer's own profile when there is
    /// one. Serves a signed-out reader too, with the personal parts absent.
    func home() async throws -> PlayHome {
        try await client.send(Endpoint.get("play/home", requiresAuth: false))
    }

    /// `GET /api/play/challenges/{id}` - one challenge, with its content
    /// already stripped of answers.
    func challenge(id: String) async throws -> PlayChallenge {
        struct Response: Decodable {
            let challenge: PlayChallenge
        }
        let response: Response = try await client.send(
            Endpoint.get("play/challenges/\(Endpoint.segment(id))", requiresAuth: false)
        )
        return response.challenge
    }

    /// `GET /api/play/leaderboard`.
    func leaderboard() async throws -> [PlayLeaderboardEntry] {
        struct Response: Decodable {
            let leaderboard: [PlayLeaderboardEntry]?
        }
        let response: Response = try await client.send(
            Endpoint.get("play/leaderboard", requiresAuth: false)
        )
        return response.leaderboard ?? []
    }

    /// `POST /api/play/challenges/{id}/submit`. Requires a session; the
    /// answer is scored server-side and the reply carries the score, the
    /// XP, the new level and streak, and any achievement unlocked.
    func submit(challengeId: String, submission: PlaySubmission) async throws -> PlayResult {
        try await client.send(
            try Endpoint.post(
                "play/challenges/\(Endpoint.segment(challengeId))/submit",
                body: submission
            )
        )
    }

    /// `POST /api/play/challenges` - live immediately (no moderation
    /// queue; reportable after the fact, same as a post).
    func createChallenge(_ request: CreateChallengeRequest) async throws -> PlayChallenge {
        struct Response: Decodable { let challenge: PlayChallenge }
        let response: Response = try await client.send(
            try Endpoint.post("play/challenges", body: request)
        )
        return response.challenge
    }

    /// `POST /api/play/challenges/generate` - shares the daily AI quota
    /// with ZRP AI chat (`reserveAiMessage`), so a 429 here is the same
    /// "today's AI limit" refusal chat would give.
    func generateChallenge(topic: String, type: String, difficulty: String) async throws -> GeneratedChallenge {
        struct Body: Encodable {
            let topic: String
            let type: String
            let difficulty: String
        }
        return try await client.send(
            try Endpoint.post(
                "play/challenges/generate",
                body: Body(topic: topic, type: type, difficulty: difficulty)
            )
        )
    }

    // MARK: - Duels

    func duels(status: PlayDuelStatus? = nil) async throws -> [PlayDuel] {
        struct Response: Decodable {
            let duels: [PlayDuel]?
        }
        let response: Response = try await client.send(
            Endpoint.get("play/duels", query: [("status", status?.rawValue)])
        )
        return response.duels ?? []
    }

    func duel(id: String) async throws -> PlayDuelDetail {
        struct Response: Decodable { let duel: PlayDuelDetail }
        let response: Response = try await client.send(
            Endpoint.get("play/duels/\(Endpoint.segment(id))")
        )
        return response.duel
    }

    /// `POST /api/play/duels`. The route blocks a self-challenge, an
    /// opponent either side has blocked, and any target that isn't a
    /// real active challenge - each with its own message, surfaced as
    /// the route sent it rather than re-derived here.
    func createDuel(challengeId: String, opponentId: String) async throws -> PlayDuel {
        struct Body: Encodable {
            let challengeId: String
            let opponentId: String
        }
        struct Response: Decodable { let duel: PlayDuel }
        let response: Response = try await client.send(
            try Endpoint.post("play/duels", body: Body(challengeId: challengeId, opponentId: opponentId))
        )
        return response.duel
    }

    /// `PUT /api/play/duels/{id}`. Only the challenged side may call
    /// this, and only once - a double-tap or a race between two taps
    /// resolves through the route's own conditional update, not a
    /// client-side guard.
    func respondToDuel(id: String, accept: Bool) async throws -> PlayDuelDetail {
        struct Body: Encodable { let action: String }
        struct Response: Decodable { let duel: PlayDuelDetail }
        let response: Response = try await client.send(
            try Endpoint.put(
                "play/duels/\(Endpoint.segment(id))",
                body: Body(action: accept ? "accept" : "decline")
            )
        )
        return response.duel
    }
}
