import XCTest
@testable import ZRPSocial

/// Pure-function coverage for `CallViewModel`'s error classification and
/// duration formatting - mirrors the Android sibling's own inline
/// `reason == "unavailable" || reason == "service-unavailable"` check
/// and `formatDuration`.
final class CallViewModelTests: XCTestCase {

    func testUnavailableReasonsMapToUnavailable() {
        XCTAssertEqual(callErrorForRejectReason("unavailable"), .unavailable)
        XCTAssertEqual(callErrorForRejectReason("service-unavailable"), .unavailable)
    }

    func testAnyOtherReasonMapsToRejected() {
        XCTAssertEqual(callErrorForRejectReason("declined"), .rejected)
        XCTAssertEqual(callErrorForRejectReason(nil), .rejected)
        XCTAssertEqual(callErrorForRejectReason(""), .rejected)
    }

    func testDurationFormattingPadsSeconds() {
        XCTAssertEqual(formatCallDuration(0), "0:00")
        XCTAssertEqual(formatCallDuration(5), "0:05")
        XCTAssertEqual(formatCallDuration(59), "0:59")
        XCTAssertEqual(formatCallDuration(60), "1:00")
        XCTAssertEqual(formatCallDuration(125), "2:05")
        XCTAssertEqual(formatCallDuration(3661), "61:01")
    }
}
