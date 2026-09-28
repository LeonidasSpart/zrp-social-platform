import XCTest
@testable import ZRPSocial

/// Coverage for `PlayCreateChallengeViewModel.buildContent` - the same
/// per-type content-shape switch as `POST /api/play/challenges` expects
/// (`type` -> `content` key set), pulled out as a pure static function so
/// it is directly testable without a repository/coroutine seam, the same
/// reasoning as Android's `CreatePostViewModel.resolveCreatePostContent`.
final class PlayCreateChallengeViewModelTests: XCTestCase {

    func testTriviaContentCarriesTheQuestionsAsGiven() {
        let questions = [
            TriviaQuestionPayload(q: "2+2?", options: ["3", "4"], correctIndex: 1)
        ]
        let content = PlayCreateChallengeViewModel.buildContent(
            type: .trivia,
            questions: questions,
            pairs: [],
            logicPrompt: "",
            logicAnswerType: .choice,
            logicOptions: [],
            logicCorrectIndex: 0,
            logicAnswer: ""
        )
        guard case .trivia(let encoded) = content else {
            return XCTFail("expected .trivia")
        }
        XCTAssertEqual(encoded, questions)
    }

    func testMemoryContentDropsBlankPairsButKeepsOrder() {
        let content = PlayCreateChallengeViewModel.buildContent(
            type: .memory,
            questions: [],
            pairs: ["cat", "  ", "dog", ""],
            logicPrompt: "",
            logicAnswerType: .choice,
            logicOptions: [],
            logicCorrectIndex: 0,
            logicAnswer: ""
        )
        guard case .memory(let pairs) = content else {
            return XCTFail("expected .memory")
        }
        XCTAssertEqual(pairs, ["cat", "dog"])
    }

    func testLogicChoiceContentCarriesOptionsAndCorrectIndex() {
        let content = PlayCreateChallengeViewModel.buildContent(
            type: .logic,
            questions: [],
            pairs: [],
            logicPrompt: "What comes next: 1, 2, 4, 8?",
            logicAnswerType: .choice,
            logicOptions: ["16", "12"],
            logicCorrectIndex: 0,
            logicAnswer: ""
        )
        guard case .logicChoice(let prompt, let options, let correctIndex) = content else {
            return XCTFail("expected .logicChoice")
        }
        XCTAssertEqual(prompt, "What comes next: 1, 2, 4, 8?")
        XCTAssertEqual(options, ["16", "12"])
        XCTAssertEqual(correctIndex, 0)
    }

    func testLogicTextContentIgnoresUnusedChoiceFields() {
        let content = PlayCreateChallengeViewModel.buildContent(
            type: .logic,
            questions: [],
            pairs: [],
            logicPrompt: "Capital of France?",
            logicAnswerType: .text,
            logicOptions: ["should", "be ignored"],
            logicCorrectIndex: 1,
            logicAnswer: "Paris"
        )
        guard case .logicText(let prompt, let answer) = content else {
            return XCTFail("expected .logicText")
        }
        XCTAssertEqual(prompt, "Capital of France?")
        XCTAssertEqual(answer, "Paris")
    }

    // MARK: - Structural mutation caps (add-question/pair/option ceilings)

    @MainActor
    func testQuestionCountIsCappedAtTwenty() {
        let viewModel = PlayCreateChallengeViewModel(repository: UncalledPlayRepository())
        for _ in 0..<30 { viewModel.addQuestion() }
        XCTAssertEqual(viewModel.questions.count, 20)
    }

    @MainActor
    func testLastQuestionCannotBeRemoved() {
        let viewModel = PlayCreateChallengeViewModel(repository: UncalledPlayRepository())
        XCTAssertEqual(viewModel.questions.count, 1)
        viewModel.removeQuestion(at: 0)
        XCTAssertEqual(viewModel.questions.count, 1)
    }

    @MainActor
    func testQuestionOptionCountIsCappedAtSix() {
        let viewModel = PlayCreateChallengeViewModel(repository: UncalledPlayRepository())
        for _ in 0..<10 { viewModel.addQuestionOption(at: 0) }
        XCTAssertEqual(viewModel.questions[0].options.count, 6)
    }

    @MainActor
    func testPairCountIsCappedAtTwelve() {
        let viewModel = PlayCreateChallengeViewModel(repository: UncalledPlayRepository())
        for _ in 0..<20 { viewModel.addPair() }
        XCTAssertEqual(viewModel.pairs.count, 12)
    }

    @MainActor
    func testPublishRequiresATitle() async {
        let viewModel = PlayCreateChallengeViewModel(repository: UncalledPlayRepository())
        viewModel.title = "   "
        await viewModel.publish()
        XCTAssertNotNil(viewModel.errorMessage)
        XCTAssertNil(viewModel.createdChallengeId)
    }

    private struct UncalledPlayRepository: PlayRepositoryProtocol {
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
    }
}
