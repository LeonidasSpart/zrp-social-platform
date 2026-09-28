import XCTest
@testable import ZRPSocial

/// Pure-function coverage for the hashtag search-as-you-type query
/// parsing that feeds `GET /api/hashtags/search`.
final class SearchViewModelTests: XCTestCase {

    func testNonHashtagQueriesReturnNil() {
        XCTAssertNil(hashtagSearchTerm(from: ""))
        XCTAssertNil(hashtagSearchTerm(from: "travel"))
        XCTAssertNil(hashtagSearchTerm(from: "  travel  "))
    }

    func testABareHashWithNothingAfterItReturnsNil() {
        XCTAssertNil(hashtagSearchTerm(from: "#"))
        XCTAssertNil(hashtagSearchTerm(from: "#   "))
        XCTAssertNil(hashtagSearchTerm(from: "  #  "))
    }

    func testAHashtagQueryReturnsTheTrimmedTermAfterTheHash() {
        XCTAssertEqual(hashtagSearchTerm(from: "#travel"), "travel")
        XCTAssertEqual(hashtagSearchTerm(from: "  #travel  "), "travel")
        XCTAssertEqual(hashtagSearchTerm(from: "#  travel  "), "travel")
    }

    func testOnlyALeadingHashTriggersHashtagMode() {
        // A "#" inside the text, not at the start, is an ordinary
        // users/posts search term - matching how a mid-string "#" in a
        // post's own text is just punctuation, not a query mode switch.
        XCTAssertNil(hashtagSearchTerm(from: "team #1"))
    }
}
