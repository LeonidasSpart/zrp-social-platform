import XCTest
@testable import ZRPSocial

/// Coverage for `PlayDuelsViewModel`'s incoming/active/history grouping -
/// the same three-way split `PlayDuelsScreen.kt` filters
/// `state.duels` into (PENDING / ACCEPTED / COMPLETED+DECLINED+EXPIRED).
@MainActor
final class PlayDuelsViewModelTests: XCTestCase {

    private struct StubPlayRepository: PlayRepositoryProtocol {
        var duelsToReturn: [PlayDuel] = []
        func home() async throws -> PlayHome { fatalError("not exercised by these tests") }
        func challenge(id: String) async throws -> PlayChallenge { fatalError("not exercised by these tests") }
        func leaderboard() async throws -> [PlayLeaderboardEntry] { fatalError("not exercised by these tests") }
        func submit(challengeId: String, submission: PlaySubmission) async throws -> PlayResult {
            fatalError("not exercised by these tests")
        }
        func createChallenge(_ request: CreateChallengeRequest) async throws -> PlayChallenge {
            fatalError("not exercised by these tests")
        }
        func generateChallenge(topic: String, type: String, difficulty: String) async throws -> GeneratedChallenge {
            fatalError("not exercised by these tests")
        }
        func duels(status: PlayDuelStatus?) async throws -> [PlayDuel] { duelsToReturn }
        func duel(id: String) async throws -> PlayDuelDetail { fatalError("not exercised by these tests") }
        func createDuel(challengeId: String, opponentId: String) async throws -> PlayDuel {
            fatalError("not exercised by these tests")
        }
        func respondToDuel(id: String, accept: Bool) async throws -> PlayDuelDetail {
            fatalError("not exercised by these tests")
        }
    }

    private static func makeDuel(id: String, status: String) -> PlayDuel {
        let json = """
        {
            "id": "\(id)",
            "status": "\(status)",
            "challengerId": "u1",
            "opponentId": "u2",
            "createdAt": "2024-01-01T00:00:00Z",
            "expiresAt": "2024-01-03T00:00:00Z",
            "challenge": {"id": "c1", "type": "TRIVIA", "title": "Capitals", "difficulty": "MEDIUM"},
            "challenger": {"id": "u1", "username": "alice"},
            "opponent": {"id": "u2", "username": "bob"}
        }
        """.data(using: .utf8)!
        let decoder = JSONDecoder()
        decoder.dateDecodingStrategy = .iso8601
        return try! decoder.decode(PlayDuel.self, from: json)
    }

    func testDuelsAreGroupedByStatusIntoIncomingActiveAndHistory() async {
        let duels = [
            Self.makeDuel(id: "1", status: "PENDING"),
            Self.makeDuel(id: "2", status: "ACCEPTED"),
            Self.makeDuel(id: "3", status: "COMPLETED"),
            Self.makeDuel(id: "4", status: "DECLINED"),
            Self.makeDuel(id: "5", status: "EXPIRED"),
        ]
        let viewModel = PlayDuelsViewModel(repository: StubPlayRepository(duelsToReturn: duels))
        await viewModel.load()

        XCTAssertEqual(viewModel.incoming.map(\.id), ["1"])
        XCTAssertEqual(viewModel.active.map(\.id), ["2"])
        XCTAssertEqual(Set(viewModel.history.map(\.id)), Set(["3", "4", "5"]))
    }

    func testEmptyListProducesEmptyGroups() async {
        let viewModel = PlayDuelsViewModel(repository: StubPlayRepository(duelsToReturn: []))
        await viewModel.load()

        XCTAssertTrue(viewModel.incoming.isEmpty)
        XCTAssertTrue(viewModel.active.isEmpty)
        XCTAssertTrue(viewModel.history.isEmpty)
    }
}
