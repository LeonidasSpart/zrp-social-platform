import XCTest
@testable import ZRPSocial

/// Regression coverage for `DiscoverWatchEvents` - a direct Swift port of
/// `src/lib/discover-watch-client.ts`'s own pure logic (same thresholds,
/// same dedup semantics). See its own doc comment for why this decision
/// lives apart from the actual network call.
final class DiscoverWatchEventsTests: XCTestCase {

    func testNoProgressEventsFireBeforeTheFirstThreshold() {
        XCTAssertEqual(
            DiscoverWatchEvents.progressEventsToFire(currentPosition: 1, duration: 10, alreadyFired: []),
            []
        )
    }

    func testCrossing25PercentFiresExactlyProgress25() {
        XCTAssertEqual(
            DiscoverWatchEvents.progressEventsToFire(currentPosition: 2.5, duration: 10, alreadyFired: []),
            [.progress25]
        )
    }

    func testABigJumpFiresEveryThresholdCrossedAtOnceInOrder() {
        XCTAssertEqual(
            DiscoverWatchEvents.progressEventsToFire(currentPosition: 8, duration: 10, alreadyFired: []),
            [.progress25, .progress50, .progress75]
        )
    }

    func testAnAlreadyFiredThresholdNeverFiresAgain() {
        let fired: Set<DiscoverEventType> = [.progress25, .progress50]
        XCTAssertEqual(
            DiscoverWatchEvents.progressEventsToFire(currentPosition: 8, duration: 10, alreadyFired: fired),
            [.progress75]
        )
    }

    func testCompleteFiresAtTheCompleteRatioEvenBeforeExactEnd() {
        XCTAssertEqual(
            DiscoverWatchEvents.progressEventsToFire(currentPosition: 9.9, duration: 10, alreadyFired: []),
            [.progress75, .complete]
        )
    }

    func testCompleteNeverFiresTwice() {
        let fired: Set<DiscoverEventType> = [.progress25, .progress50, .progress75, .complete]
        XCTAssertEqual(
            DiscoverWatchEvents.progressEventsToFire(currentPosition: 10, duration: 10, alreadyFired: fired),
            []
        )
    }

    func testNonPositiveDurationYieldsNoEvents() {
        XCTAssertEqual(
            DiscoverWatchEvents.progressEventsToFire(currentPosition: 5, duration: 0, alreadyFired: []),
            []
        )
    }

    func testSkipRequiresAPriorStart() {
        XCTAssertFalse(DiscoverWatchEvents.shouldFireSkip(alreadyFired: []))
        XCTAssertTrue(DiscoverWatchEvents.shouldFireSkip(alreadyFired: [.start]))
    }

    func testSkipNeverFiresAfterCompleteOrTwice() {
        XCTAssertFalse(DiscoverWatchEvents.shouldFireSkip(alreadyFired: [.start, .complete]))
        XCTAssertFalse(DiscoverWatchEvents.shouldFireSkip(alreadyFired: [.start, .skip]))
    }

    func testImpressionAndStartEachFireOnlyOnce() {
        XCTAssertTrue(DiscoverWatchEvents.shouldFireImpression(alreadyFired: []))
        XCTAssertFalse(DiscoverWatchEvents.shouldFireImpression(alreadyFired: [.impression]))
        XCTAssertTrue(DiscoverWatchEvents.shouldFireStart(alreadyFired: []))
        XCTAssertFalse(DiscoverWatchEvents.shouldFireStart(alreadyFired: [.start]))
    }
}
