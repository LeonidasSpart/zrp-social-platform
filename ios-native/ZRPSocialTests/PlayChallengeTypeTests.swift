import XCTest
@testable import ZRPSocial

/// `GAME_REGISTRY` (`src/lib/play/registry.ts`) defines five
/// `PlayChallengeType`s; this app has a player view for three
/// (TRIVIA/MEMORY/LOGIC). REACTION and SEQUENCE correctly decode to
/// `.unknown` rather than failing the whole page's decode - but before
/// Task #5's fix, an `.unknown` challenge could still appear as a normal
/// card in the trending list (now filtered out, see `PlayHomeView`'s
/// `trending(_:)`) and could still receive a duel invite nobody could
/// play (now hidden, see `PlayChallengeView`'s `board(_:)`). This covers
/// the decode this filtering logic depends on.
final class PlayChallengeTypeTests: XCTestCase {

    private func decode(_ raw: String) throws -> PlayChallengeType {
        let json = "\"\(raw)\"".data(using: .utf8)!
        return try JSONDecoder().decode(PlayChallengeType.self, from: json)
    }

    func testTriviaDecodesToItsOwnCase() throws {
        XCTAssertEqual(try decode("TRIVIA"), .trivia)
    }

    func testMemoryDecodesToItsOwnCase() throws {
        XCTAssertEqual(try decode("MEMORY"), .memory)
    }

    func testLogicDecodesToItsOwnCase() throws {
        XCTAssertEqual(try decode("LOGIC"), .logic)
    }

    /// This build has no player for either of these two real backend
    /// types - decoding to `.unknown` (rather than failing) is what lets
    /// the rest of a challenge/trending/duel page still render.
    func testReactionDecodesToUnknown() throws {
        XCTAssertEqual(try decode("REACTION"), .unknown)
    }

    func testSequenceDecodesToUnknown() throws {
        XCTAssertEqual(try decode("SEQUENCE"), .unknown)
    }

    func testAFutureTypeThisBuildHasNeverHeardOfDecodesToUnknownRatherThanFailing() throws {
        XCTAssertEqual(try decode("SOME_FUTURE_TYPE"), .unknown)
    }

    /// The exact filter `PlayHomeView.trending(_:)` applies.
    func testFilteringOutUnknownTypesKeepsOnlyPlayableOnes() {
        let types: [PlayChallengeType] = [.trivia, .unknown, .memory, .unknown, .logic]
        XCTAssertEqual(types.filter { $0 != .unknown }, [.trivia, .memory, .logic])
    }
}
