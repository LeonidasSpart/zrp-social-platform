import XCTest
@testable import ZRPSocial

/// `AdminReport.target` is what every report row and the action sheet
/// dispatch on to render the right polymorphic target - a bug here would
/// mean the wrong content (or none) shows for a report.
final class AdminReportTargetTests: XCTestCase {

    func testReportWithPostResolvesToPostTarget() {
        let report = AdminFixtures.report()
        guard case .post(let post) = report.target else {
            return XCTFail("Expected .post target, got \(report.target)")
        }
        XCTAssertEqual(post.id, "p1")
    }

    func testBareProfileReportResolvesToUserTarget() {
        let report = AdminFixtures.bareProfileReport(reportedUsername: "carol")
        guard case .user(let user) = report.target else {
            return XCTFail("Expected .user target, got \(report.target)")
        }
        XCTAssertEqual(user.username, "carol")
    }

    func testTargetSummaryDescribesEachCase() {
        XCTAssertEqual(
            targetSummary(.user(AdminActorRef(id: "u1", username: "carol", name: nil))),
            "Profile report: @carol"
        )
        XCTAssertEqual(targetSummary(.none), "Target no longer available")
    }

    /// A challenge report's `creator` is nullable on the wire (the web
    /// route's own TS type says `creator: {...} | null`) - this must not
    /// crash or silently drop the row, just say "unknown".
    func testChallengeTargetWithNilCreatorDoesNotCrash() {
        let target = AdminReportTarget.challenge(
            AdminReportedChallenge(id: "c1", title: "Daily trivia", creator: nil)
        )
        XCTAssertEqual(targetSummary(target), "PLAY challenge by unknown: Daily trivia")
    }
}
