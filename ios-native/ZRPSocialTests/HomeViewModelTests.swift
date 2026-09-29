import XCTest
@testable import ZRPSocial

/// Coverage for `HomeViewModel`'s paging/refresh/error-handling behavior
/// (Task #3, Discover/Explore parity audit: this ViewModel - the app's
/// busiest screen - had zero test coverage before this). Follows the
/// same stub-repository pattern `PlayDuelsViewModelTests.swift` already
/// established: a fake conforming to the repository's protocol, with
/// `fatalError` for methods these tests don't exercise.
@MainActor
final class HomeViewModelTests: XCTestCase {

    private final class StubPostsRepository: PostsRepositoryProtocol, @unchecked Sendable {
        var feedResult: Result<PostsPage, Error> = .success(PostsPage(posts: [], nextCursor: nil))
        var feedCallCount = 0

        func feed(_ tab: FeedTab, cursor: String?, forceRefresh: Bool) async throws -> PostsPage {
            feedCallCount += 1
            switch feedResult {
            case .success(let page): return page
            case .failure(let error): throw error
            }
        }
        func createPost(_ request: CreatePostRequest) async throws -> Post { fatalError("not exercised by these tests") }
        func post(id: String) async throws -> Post { fatalError("not exercised by these tests") }
        func toggleLike(postId: String) async throws -> Bool { fatalError("not exercised by these tests") }
        func toggleRepost(postId: String) async throws -> Bool { fatalError("not exercised by these tests") }
        func toggleBookmark(postId: String) async throws -> Bool { fatalError("not exercised by these tests") }
        func deletePost(id: String) async throws { fatalError("not exercised by these tests") }
        func updatePost(id: String, content: String) async throws -> Post { fatalError("not exercised by these tests") }
        func reactions(postId: String) async throws -> [PostReaction] { fatalError("not exercised by these tests") }
        func toggleReaction(postId: String, emoji: String) async throws -> Bool { fatalError("not exercised by these tests") }
        func quotes(postId: String, cursor: String?) async throws -> PostsPage { fatalError("not exercised by these tests") }
        func togglePin(postId: String) async throws -> Bool { fatalError("not exercised by these tests") }
        func countView(postId: String) async throws -> Int? { fatalError("not exercised by these tests") }
        func votePoll(pollId: String, optionIndex: Int) async throws { fatalError("not exercised by these tests") }
    }

    private struct StubAdsRepository: AdsRepositoryProtocol {
        func serve() async throws -> SponsoredAd? { nil }
        func logImpression(campaignId: String) async {}
        func logClick(campaignId: String) async -> String? { nil }
    }

    private struct StubTranslationRepository: TranslationRepositoryProtocol {
        func translate(_ text: String, to targetLang: String) async throws -> String { text }
    }

    private static func makePost(id: String) -> Post {
        Post(
            id: id,
            content: "Post \(id)",
            createdAt: Date(timeIntervalSince1970: 0),
            author: PostAuthor(id: "author-1", username: "leonidas", name: "Leonidas", avatarUrl: nil, badgeType: nil, plan: nil),
            counts: PostCounts(likes: 0, comments: 0, reposts: 0, quotedBy: nil),
            imageUrl: nil,
            imageUrls: nil,
            mediaType: nil,
            views: nil,
            quotePost: nil,
            liked: nil,
            commentsEnabled: nil,
            linkUrl: nil,
            poll: nil,
            type: nil,
            company: nil,
            location: nil,
            applyUrl: nil,
            body: nil
        )
    }

    func testRefreshLoadsTheFirstPageIntoTheTabsState() async {
        let repository = StubPostsRepository()
        repository.feedResult = .success(PostsPage(posts: [Self.makePost(id: "1"), Self.makePost(id: "2")], nextCursor: "cursor-2"))
        let viewModel = HomeViewModel(repository: repository, ads: StubAdsRepository())

        await viewModel.refresh(.forYou)

        let state = viewModel.state(for: .forYou)
        XCTAssertEqual(state.posts.map(\.id), ["1", "2"])
        XCTAssertEqual(state.cursor, "cursor-2")
        XCTAssertEqual(state.phase, .loaded)
        XCTAssertTrue(state.hasMore)
    }

    func testANextCursorOfNilMeansNoMorePages() async {
        let repository = StubPostsRepository()
        repository.feedResult = .success(PostsPage(posts: [Self.makePost(id: "1")], nextCursor: nil))
        let viewModel = HomeViewModel(repository: repository, ads: StubAdsRepository())

        await viewModel.refresh(.forYou)

        XCTAssertFalse(viewModel.state(for: .forYou).hasMore)
    }

    func testAFirstPageFailureWithNothingOnScreenBecomesTheFailedPhase() async {
        let repository = StubPostsRepository()
        repository.feedResult = .failure(ApiError.transport(underlying: "offline"))
        let viewModel = HomeViewModel(repository: repository, ads: StubAdsRepository())

        await viewModel.refresh(.forYou)

        XCTAssertEqual(viewModel.state(for: .forYou).phase, .failed(.transport(underlying: "offline")))
        XCTAssertTrue(viewModel.state(for: .forYou).posts.isEmpty)
    }

    func testARefreshFailureWithPostsAlreadyOnScreenKeepsThemInsteadOfShowingAnError() async {
        let repository = StubPostsRepository()
        repository.feedResult = .success(PostsPage(posts: [Self.makePost(id: "1")], nextCursor: nil))
        let viewModel = HomeViewModel(repository: repository, ads: StubAdsRepository())
        let interactions = PostInteractionStore(repository: repository, translations: StubTranslationRepository())
        viewModel.attach(interactions: interactions)

        await viewModel.refresh(.forYou)
        XCTAssertEqual(viewModel.state(for: .forYou).posts.count, 1)

        repository.feedResult = .failure(ApiError.transport(underlying: "offline"))
        await viewModel.refresh(.forYou)

        // The existing timeline must not be wiped out by a refresh that
        // failed - only a first-page failure (tested above) becomes the
        // full error state.
        XCTAssertEqual(viewModel.state(for: .forYou).phase, .loaded)
        XCTAssertEqual(viewModel.state(for: .forYou).posts.map(\.id), ["1"])
        XCTAssertNotNil(interactions.actionError)
    }

    func testEachTabKeepsItsOwnIndependentState() async {
        let repository = StubPostsRepository()
        repository.feedResult = .success(PostsPage(posts: [Self.makePost(id: "for-you-1")], nextCursor: nil))
        let viewModel = HomeViewModel(repository: repository, ads: StubAdsRepository())
        await viewModel.refresh(.forYou)

        repository.feedResult = .success(PostsPage(posts: [Self.makePost(id: "following-1")], nextCursor: nil))
        await viewModel.refresh(.following)

        XCTAssertEqual(viewModel.state(for: .forYou).posts.map(\.id), ["for-you-1"])
        XCTAssertEqual(viewModel.state(for: .following).posts.map(\.id), ["following-1"])
    }

    func testInsertingAJustCreatedPostPrependsItToEveryAlreadyLoadedTab() async {
        let repository = StubPostsRepository()
        repository.feedResult = .success(PostsPage(posts: [Self.makePost(id: "existing")], nextCursor: nil))
        let viewModel = HomeViewModel(repository: repository, ads: StubAdsRepository())
        await viewModel.refresh(.forYou)
        await viewModel.refresh(.following)

        let interactions = PostInteractionStore(repository: repository, translations: StubTranslationRepository())
        viewModel.insertCreated(Self.makePost(id: "new"), interactions: interactions)

        XCTAssertEqual(viewModel.state(for: .forYou).posts.map(\.id), ["new", "existing"])
        XCTAssertEqual(viewModel.state(for: .following).posts.map(\.id), ["new", "existing"])
    }

    func testInsertingAnAlreadyPresentPostDoesNotDuplicateIt() async {
        let repository = StubPostsRepository()
        let post = Self.makePost(id: "1")
        repository.feedResult = .success(PostsPage(posts: [post], nextCursor: nil))
        let viewModel = HomeViewModel(repository: repository, ads: StubAdsRepository())
        await viewModel.refresh(.forYou)

        let interactions = PostInteractionStore(repository: repository, translations: StubTranslationRepository())
        viewModel.insertCreated(post, interactions: interactions)

        XCTAssertEqual(viewModel.state(for: .forYou).posts.map(\.id), ["1"])
    }
}
