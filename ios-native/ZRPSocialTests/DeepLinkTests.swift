import XCTest
@testable import ZRPSocial

/// `DeepLink.swift` had no test coverage at all before this (Task #5,
/// iOS parity audit) despite being a from-scratch URL parser with real
/// security properties (host/scheme allowlisting - see
/// `DeepLinkSecurityTests` below) and a real, previously-shipped bug this
/// file's own fix addresses: `/play/duel/{id}` fell through to the
/// generic Play home tab instead of routing to the specific duel, even
/// though `Route.playDuelDetail(id:)` already existed and was already
/// used elsewhere in the app (`PlayDuelsView`).
final class DeepLinkTests: XCTestCase {

    private func target(_ path: String) -> DeepLinkTarget? {
        DeepLink.target(for: URL(string: "https://zrp.one\(path)")!)
    }

    /// A scheduled-live reminder push carries `/live-audio/{id}` or
    /// `/live-video/{id}` (`notifyReminderSubscribers`); before these
    /// cases existed both fell through to the web.
    func testLiveRoomLinksOpenTheRoom() {
        XCTAssertEqual(target("/live-audio/room-1"), DeepLinkTarget(.home, .liveAudioRoom(id: "room-1")))
        XCTAssertEqual(target("/live-video/room-2"), DeepLinkTarget(.home, .liveVideoRoom(id: "room-2")))
    }

    func testBareLiveLinksOpenTheRoomLists() {
        XCTAssertEqual(target("/live-audio"), DeepLinkTarget(.home, .liveAudio))
        XCTAssertEqual(target("/live-video"), DeepLinkTarget(.home, .liveVideo))
    }

    func testPlayDuelLinkRoutesToTheSpecificDuel() {
        let result = target("/play/duel/duel-123")
        XCTAssertEqual(result, DeepLinkTarget(.home, .playDuelDetail(id: "duel-123")))
    }

    /// Regression guard: the challenge case this shares a `case "play":`
    /// branch with must keep working exactly as before.
    func testPlayChallengeLinkStillRoutesToTheChallenge() {
        let result = target("/play/challenge/chal-456")
        XCTAssertEqual(result, DeepLinkTarget(.home, .playChallenge(id: "chal-456", duelId: nil)))
    }

    func testBarePlayLinkStillRoutesToThePlayHome() {
        let result = target("/play")
        XCTAssertEqual(result, DeepLinkTarget(.home, .play))
    }

    /// A duel path with no id segment must not crash or mis-route -
    /// falls back to the same bare Play home the equivalent malformed
    /// challenge link already falls back to.
    func testDuelLinkWithNoIdFallsBackToPlayHome() {
        let result = target("/play/duel")
        XCTAssertEqual(result, DeepLinkTarget(.home, .play))
    }
}

/// The security property `Task #5`'s Auth/Profile/Session audit cluster
/// verified by reading the source: only `https` on the real ZRP domain is
/// ever claimed, so a malicious or malformed link can never make this
/// parser hand back a route inside the app. Covered here as a real test
/// rather than left as a read-the-code-only finding.
final class DeepLinkSecurityTests: XCTestCase {

    func testHttpSchemeIsNeverClaimedEvenOnTheRealDomain() {
        let url = URL(string: "http://zrp.one/post/abc")!
        XCTAssertNil(DeepLink.target(for: url))
    }

    func testALookalikeHostIsNeverClaimed() {
        let url = URL(string: "https://zrp.one.evil.example/post/abc")!
        XCTAssertNil(DeepLink.target(for: url))
    }

    func testWwwSubdomainOfTheRealDomainIsClaimed() {
        let url = URL(string: "https://www.zrp.one/play")!
        XCTAssertEqual(DeepLink.target(for: url), DeepLinkTarget(.home, .play))
    }

    func testAnUnrelatedHttpsDomainIsNeverClaimed() {
        let url = URL(string: "https://example.com/post/abc")!
        XCTAssertNil(DeepLink.target(for: url))
    }
}
