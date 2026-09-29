import XCTest
@testable import ZRPSocial

/// Coverage for `ExploreViewModel`'s three independent sections
/// (suggested people, trending hashtags, "people near you") - Task #3's
/// Discover/Explore parity audit found this ViewModel untested, and the
/// "people near you" section (`GET /api/discover/people`) is new in this
/// same pass: a real, previously-unconsumed backend capability. Follows
/// the same stub-repository pattern `PlayDuelsViewModelTests.swift` and
/// `HomeViewModelTests.swift` already established.
@MainActor
final class ExploreViewModelTests: XCTestCase {

    private final class StubSearchRepository: SearchRepositoryProtocol, @unchecked Sendable {
        var suggestedUsersResult: Result<[PostAuthor], Error> = .success([])
        var trendingHashtagsResult: Result<[TrendingHashtag], Error> = .success([])

        func suggestedUsers(limit: Int) async throws -> [PostAuthor] {
            switch suggestedUsersResult {
            case .success(let value): return value
            case .failure(let error): throw error
            }
        }
        func trendingHashtags(limit: Int) async throws -> [TrendingHashtag] {
            switch trendingHashtagsResult {
            case .success(let value): return value
            case .failure(let error): throw error
            }
        }
        func search(query: String) async throws -> SearchResults { fatalError("not exercised by these tests") }
        func searchAll(query: String, sort: SearchSortOption, filters: SearchFilters) async throws -> SearchResults {
            fatalError("not exercised by these tests")
        }
        func searchHashtags(query: String, cursor: String?) async throws -> HashtagSearchPage {
            fatalError("not exercised by these tests")
        }
        func searchUsersCategory(query: String, sort: SearchSortOption, filters: SearchFilters, cursor: String?) async throws -> SearchPage<PostAuthor> {
            fatalError("not exercised by these tests")
        }
        func searchPostsCategory(query: String, sort: SearchSortOption, filters: SearchFilters, cursor: String?) async throws -> SearchPage<Post> {
            fatalError("not exercised by these tests")
        }
        func searchHashtagsCategory(query: String, sort: SearchSortOption, filters: SearchFilters, cursor: String?) async throws -> SearchPage<TrendingHashtag> {
            fatalError("not exercised by these tests")
        }
        func searchCommunitiesCategory(query: String, sort: SearchSortOption, filters: SearchFilters, cursor: String?) async throws -> SearchPage<Community> {
            fatalError("not exercised by these tests")
        }
        func searchNewsCategory(query: String, sort: SearchSortOption, filters: SearchFilters, cursor: String?) async throws -> SearchPage<NewsArticle> {
            fatalError("not exercised by these tests")
        }
        func searchMusicCategory(query: String, sort: SearchSortOption, filters: SearchFilters, cursor: String?) async throws -> SearchPage<SearchMusicResult> {
            fatalError("not exercised by these tests")
        }
        func searchOpportunitiesCategory(query: String, sort: SearchSortOption, filters: SearchFilters, cursor: String?) async throws -> SearchPage<Opportunity> {
            fatalError("not exercised by these tests")
        }
        func searchMarketplaceCategory(query: String, sort: SearchSortOption, filters: SearchFilters, cursor: String?) async throws -> SearchPage<Listing> {
            fatalError("not exercised by these tests")
        }
    }

    private final class StubUsersRepository: UsersRepositoryProtocol, @unchecked Sendable {
        var toggleFollowResult: Result<FollowToggleResponse, Error> = .success(FollowToggleResponse(following: true, requested: false, message: nil))

        func toggleFollow(username: String) async throws -> FollowToggleResponse {
            switch toggleFollowResult {
            case .success(let value): return value
            case .failure(let error): throw error
            }
        }
        func profile(username: String) async throws -> UserProfile { fatalError("not exercised by these tests") }
        func tabPosts(_ tab: ProfilePostsTab, username: String, cursor: String?) async throws -> PostsPage {
            fatalError("not exercised by these tests")
        }
        func replies(username: String, cursor: String?) async throws -> ProfileRepliesPage { fatalError("not exercised by these tests") }
        func updateProfile(_ request: ProfileUpdateRequest) async throws { fatalError("not exercised by these tests") }
        func setAvatar(url: String) async throws { fatalError("not exercised by these tests") }
        func completeOnboarding() async throws { fatalError("not exercised by these tests") }
        func setCover(url: String) async throws { fatalError("not exercised by these tests") }
        func usernameStatus() async throws -> UsernameStatus { fatalError("not exercised by these tests") }
        func changeUsername(_ username: String) async throws { fatalError("not exercised by these tests") }
        func changeEmail(currentPassword: String, newEmail: String) async throws { fatalError("not exercised by these tests") }
        func userList(_ source: UserListSource, cursor: String?) async throws -> FollowListPage { fatalError("not exercised by these tests") }
        func hashtagPosts(tag: String) async throws -> [Post] { fatalError("not exercised by these tests") }
        func trustPassport(username: String) async throws -> TrustPassport { fatalError("not exercised by these tests") }
        func postStats() async throws -> PostStats { fatalError("not exercised by these tests") }
    }

    private final class StubDiscoverRepository: DiscoverRepositoryProtocol, @unchecked Sendable {
        var nearbyPeopleResult: Result<NearbyPeoplePage, Error> = .success(NearbyPeoplePage(users: [], nextCursor: nil, reason: nil))

        func nearbyPeople(limit: Int) async throws -> NearbyPeoplePage {
            switch nearbyPeopleResult {
            case .success(let value): return value
            case .failure(let error): throw error
            }
        }
        func feed(cursor: String?) async throws -> DiscoverPage { fatalError("not exercised by these tests") }
        func recordEvent(postId: String, eventType: DiscoverEventType, watchedMs: Int?) async { fatalError("not exercised by these tests") }
        func markNotInterested(postId: String) async throws -> Bool { fatalError("not exercised by these tests") }
        func toggleLike(postId: String) async throws -> Bool { fatalError("not exercised by these tests") }
        func toggleRepost(postId: String) async throws -> Bool { fatalError("not exercised by these tests") }
        func toggleSave(postId: String) async throws -> Bool { fatalError("not exercised by these tests") }
        func toggleFollow(username: String) async throws -> FollowToggleResponse { fatalError("not exercised by these tests") }
        func muteCreator(userId: String) async throws -> Bool { fatalError("not exercised by these tests") }
        func blockCreator(username: String) async throws -> Bool { fatalError("not exercised by these tests") }
    }

    private static func makeAuthor(id: String) -> PostAuthor {
        PostAuthor(id: id, username: "user-\(id)", name: "User \(id)", avatarUrl: nil, badgeType: nil, plan: nil)
    }

    private static func makeNearbyUser(id: String, headline: String? = nil, company: String? = nil) -> NearbyUser {
        NearbyUser(id: id, username: "nearby-\(id)", name: "Nearby \(id)", avatarUrl: nil, badgeType: nil, bio: nil, category: nil, headline: headline, company: company)
    }

    private func makeViewModel(
        search: StubSearchRepository = StubSearchRepository(),
        users: StubUsersRepository = StubUsersRepository(),
        discover: StubDiscoverRepository = StubDiscoverRepository()
    ) -> ExploreViewModel {
        ExploreViewModel(search: search, users: users, discover: discover)
    }

    func testLoadPopulatesAllThreeSectionsOnSuccess() async {
        let search = StubSearchRepository()
        search.suggestedUsersResult = .success([Self.makeAuthor(id: "1")])
        search.trendingHashtagsResult = .success([TrendingHashtag(tag: "zrp", count: 5)])
        let discover = StubDiscoverRepository()
        discover.nearbyPeopleResult = .success(NearbyPeoplePage(users: [Self.makeNearbyUser(id: "2")], nextCursor: nil, reason: nil))
        let viewModel = makeViewModel(search: search, discover: discover)

        await viewModel.load()

        XCTAssertEqual(viewModel.phase, .loaded)
        XCTAssertEqual(viewModel.people.map(\.id), ["1"])
        XCTAssertEqual(viewModel.hashtags.map(\.tag), ["zrp"])
        XCTAssertEqual(viewModel.nearbyPeople.map(\.id), ["2"])
        XCTAssertFalse(viewModel.nearbyUnknownCountry)
    }

    func testAnUnknownViewerCountryMarksNearbyAsUnknownRatherThanJustEmpty() async {
        let discover = StubDiscoverRepository()
        discover.nearbyPeopleResult = .success(NearbyPeoplePage(users: [], nextCursor: nil, reason: "unknown_viewer_country"))
        let viewModel = makeViewModel(discover: discover)

        await viewModel.load()

        XCTAssertTrue(viewModel.nearbyPeople.isEmpty)
        XCTAssertTrue(viewModel.nearbyUnknownCountry)
    }

    func testANearbyPeopleFailureDoesNotBlockOrBlankPeopleAndHashtags() async {
        let search = StubSearchRepository()
        search.suggestedUsersResult = .success([Self.makeAuthor(id: "1")])
        search.trendingHashtagsResult = .success([TrendingHashtag(tag: "zrp", count: 5)])
        let discover = StubDiscoverRepository()
        discover.nearbyPeopleResult = .failure(ApiError.transport(underlying: "offline"))
        let viewModel = makeViewModel(search: search, discover: discover)

        await viewModel.load()

        XCTAssertEqual(viewModel.phase, .loaded)
        XCTAssertEqual(viewModel.people.map(\.id), ["1"])
        XCTAssertEqual(viewModel.hashtags.map(\.tag), ["zrp"])
        XCTAssertTrue(viewModel.nearbyPeople.isEmpty)
    }

    func testAPeopleFailureAloneDoesNotHideAlreadySucceededHashtags() async {
        let search = StubSearchRepository()
        search.suggestedUsersResult = .failure(ApiError.transport(underlying: "offline"))
        search.trendingHashtagsResult = .success([TrendingHashtag(tag: "zrp", count: 5)])
        let viewModel = makeViewModel(search: search)

        await viewModel.load()

        XCTAssertEqual(viewModel.phase, .loaded)
        XCTAssertTrue(viewModel.people.isEmpty)
        XCTAssertEqual(viewModel.hashtags.map(\.tag), ["zrp"])
    }

    func testBothPeopleAndHashtagsFailingWithNothingOnScreenBecomesTheFailedPhase() async {
        let search = StubSearchRepository()
        search.suggestedUsersResult = .failure(ApiError.transport(underlying: "offline"))
        search.trendingHashtagsResult = .failure(ApiError.transport(underlying: "offline"))
        let viewModel = makeViewModel(search: search)

        await viewModel.load()

        XCTAssertEqual(viewModel.phase, .failed(.transport(underlying: "offline")))
    }

    func testTogglingFollowRecordsTheServersOwnAnswerNotAnAssumption() async {
        let users = StubUsersRepository()
        users.toggleFollowResult = .success(FollowToggleResponse(following: true, requested: false, message: nil))
        let viewModel = makeViewModel(users: users)

        await viewModel.toggleFollow(userId: "1", username: "leonidas")

        XCTAssertTrue(viewModel.isFollowing("1"))
    }

    func testANonFollowingToggleResponseDoesNotMarkTheUserFollowed() async {
        // e.g. a private account's follow request - `requested: true`,
        // `following: false` - must not read as "now following".
        let users = StubUsersRepository()
        users.toggleFollowResult = .success(FollowToggleResponse(following: false, requested: true, message: nil))
        let viewModel = makeViewModel(users: users)

        await viewModel.toggleFollow(userId: "1", username: "leonidas")

        XCTAssertFalse(viewModel.isFollowing("1"))
    }
}
