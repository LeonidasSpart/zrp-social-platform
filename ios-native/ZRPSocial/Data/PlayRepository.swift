import Foundation

protocol PlayRepositoryProtocol: Sendable {
    func home() async throws -> PlayHome
    func challenge(id: String) async throws -> PlayChallenge
    func leaderboard() async throws -> [PlayLeaderboardEntry]
    func submit(challengeId: String, submission: PlaySubmission) async throws -> PlayResult
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
}
