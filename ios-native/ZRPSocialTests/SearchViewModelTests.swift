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

/// Pure-function coverage for Advanced Search's (Task #2) pagination
/// guard and filter-activity check - mirrors Android's own
/// `canLoadMoreSearch()`/`SearchFilters.isActive` unit tests.
final class SearchCategoryPaginationTests: XCTestCase {

    func testCanLoadMoreWhenASingleCategoryHasANextPageAndNothingElseIsInFlight() {
        XCTAssertTrue(canLoadMoreSearchCategory(category: .people, query: "leonidas", isLoadingMore: false, nextCursor: "cursor-1"))
    }

    func testCannotLoadMoreInAllModeWhichIsAFixedSizeTeaserServerSide() {
        XCTAssertFalse(canLoadMoreSearchCategory(category: .all, query: "leonidas", isLoadingMore: false, nextCursor: "cursor-1"))
    }

    func testCannotLoadMoreWhileAPageRequestIsAlreadyInFlight() {
        XCTAssertFalse(canLoadMoreSearchCategory(category: .people, query: "leonidas", isLoadingMore: true, nextCursor: "cursor-1"))
    }

    func testCannotLoadMoreOnceTheServerHasSaidThereIsNothingLeft() {
        XCTAssertFalse(canLoadMoreSearchCategory(category: .people, query: "leonidas", isLoadingMore: false, nextCursor: nil))
    }

    func testCannotLoadMoreOnceTheQueryHasBeenClearedBelowTheTwoCharacterMinimum() {
        XCTAssertFalse(canLoadMoreSearchCategory(category: .people, query: "a", isLoadingMore: false, nextCursor: "cursor-1"))
    }

    func testFiltersAreInactiveByDefault() {
        XCTAssertFalse(SearchFilters().isActive)
    }

    func testANonDefaultDateRangeMakesFiltersActive() {
        var filters = SearchFilters()
        filters.dateRange = .last7d
        XCTAssertTrue(filters.isActive)
    }

    func testALanguageFilterMakesFiltersActive() {
        var filters = SearchFilters()
        filters.language = "en"
        XCTAssertTrue(filters.isActive)
    }

    func testABlankLanguageDoesNotCountAsActive() {
        var filters = SearchFilters()
        filters.language = "  "
        XCTAssertFalse(filters.isActive)
    }

    func testACountryFilterMakesFiltersActive() {
        var filters = SearchFilters()
        filters.country = "CH"
        XCTAssertTrue(filters.isActive)
    }

    func testAMediaFilterMakesFiltersActive() {
        var filters = SearchFilters()
        filters.media = .image
        XCTAssertTrue(filters.isActive)
    }

    func testEachBooleanToggleMakesFiltersActiveOnItsOwn() {
        var verified = SearchFilters()
        verified.verified = true
        XCTAssertTrue(verified.isActive)

        var professional = SearchFilters()
        professional.professional = true
        XCTAssertTrue(professional.isActive)

        var creator = SearchFilters()
        creator.creator = true
        XCTAssertTrue(creator.isActive)
    }
}
