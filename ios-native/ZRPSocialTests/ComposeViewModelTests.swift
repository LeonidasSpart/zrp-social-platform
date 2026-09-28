import XCTest
@testable import ZRPSocial

/// Coverage for the composer's RECRUITMENT/ARTICLE gating - the iOS
/// analogue of Android's `isCreatePostSubmitBlocked`/`resolveCreatePostContent`
/// pure-function tests, exercised here through `ComposeViewModel` itself
/// since its `canPost`/`setPostType` are the real gate, not free functions.
/// Neither fake repository below is ever called: every case here stops at
/// `canPost` or `setPostType`, before `post()` would reach the network.
@MainActor
final class ComposeViewModelTests: XCTestCase {

    private struct UncalledPostsRepository: PostsRepositoryProtocol {
        func feed(_ tab: FeedTab, cursor: String?, forceRefresh: Bool) async throws -> PostsPage {
            fatalError("not exercised by these tests")
        }
        func createPost(_ request: CreatePostRequest) async throws -> Post {
            fatalError("not exercised by these tests")
        }
        func post(id: String) async throws -> Post { fatalError("not exercised by these tests") }
        func toggleLike(postId: String) async throws -> Bool { fatalError("not exercised by these tests") }
        func toggleRepost(postId: String) async throws -> Bool { fatalError("not exercised by these tests") }
        func toggleBookmark(postId: String) async throws -> Bool { fatalError("not exercised by these tests") }
        func deletePost(id: String) async throws { fatalError("not exercised by these tests") }
        func updatePost(id: String, content: String) async throws -> Post {
            fatalError("not exercised by these tests")
        }
        func reactions(postId: String) async throws -> [PostReaction] {
            fatalError("not exercised by these tests")
        }
        func toggleReaction(postId: String, emoji: String) async throws -> Bool {
            fatalError("not exercised by these tests")
        }
        func quotes(postId: String, cursor: String?) async throws -> PostsPage {
            fatalError("not exercised by these tests")
        }
        func togglePin(postId: String) async throws -> Bool { fatalError("not exercised by these tests") }
        func countView(postId: String) async throws -> Int? { fatalError("not exercised by these tests") }
        func votePoll(pollId: String, optionIndex: Int) async throws {
            fatalError("not exercised by these tests")
        }
    }

    private struct UncalledMediaRepository: MediaRepositoryProtocol {
        func trendingGifs() async throws -> [GifResult] { fatalError("not exercised by these tests") }
        func searchGifs(query: String) async throws -> [GifResult] { fatalError("not exercised by these tests") }
        func uploadPostMedia(
            _ candidate: UploadCandidate,
            onProgress: @escaping (Double) -> Void
        ) async throws -> UploadedMedia {
            fatalError("not exercised by these tests")
        }
    }

    private func makeViewModel(plan: String) -> ComposeViewModel {
        let viewModel = ComposeViewModel(
            postsRepository: UncalledPostsRepository(),
            mediaRepository: UncalledMediaRepository()
        )
        viewModel.plan = plan
        return viewModel
    }

    // MARK: - Type selector visibility / gating

    func testTypeSelectorHiddenForAPlanWithNeitherFeature() {
        let viewModel = makeViewModel(plan: "free")
        XCTAssertFalse(viewModel.showsTypeSelector)
        XCTAssertFalse(viewModel.canSelectRecruitment)
        XCTAssertFalse(viewModel.canSelectArticle)
    }

    func testTypeSelectorShownForABusinessPlan() {
        let viewModel = makeViewModel(plan: "business")
        XCTAssertTrue(viewModel.showsTypeSelector)
        XCTAssertTrue(viewModel.canSelectRecruitment)
        XCTAssertTrue(viewModel.canSelectArticle)
    }

    func testTypeSelectorHiddenWhileQuoting() {
        let viewModel = makeViewModel(plan: "business")
        viewModel.quotedPost = Self.makeQuotedPost()
        XCTAssertFalse(viewModel.showsTypeSelector)
    }

    /// A minimal, real `Post` decode (not a hand-built value, since every
    /// stored property here is `let`) - just enough for `quotedPost` to
    /// be non-nil.
    private static func makeQuotedPost() -> Post {
        let json = """
        {
            "id": "quoted-1",
            "content": "hello",
            "createdAt": "2024-01-01T00:00:00Z",
            "author": {"id": "u1", "username": "alice"},
            "_count": {}
        }
        """.data(using: .utf8)!
        let decoder = JSONDecoder()
        decoder.dateDecodingStrategy = .iso8601
        return try! decoder.decode(Post.self, from: json)
    }

    func testSwitchingToRecruitmentIsRefusedOnAPlanWithoutIt() {
        let viewModel = makeViewModel(plan: "free")
        viewModel.setPostType(.recruitment)
        XCTAssertEqual(viewModel.postType, .post)
    }

    func testSwitchingToArticleIsRefusedOnAPlanWithoutIt() {
        let viewModel = makeViewModel(plan: "pro")
        viewModel.setPostType(.article)
        XCTAssertEqual(viewModel.postType, .post)
    }

    func testSwitchingTypeOnABusinessPlanSucceeds() {
        let viewModel = makeViewModel(plan: "business")
        viewModel.setPostType(.recruitment)
        XCTAssertEqual(viewModel.postType, .recruitment)
        viewModel.setPostType(.article)
        XCTAssertEqual(viewModel.postType, .article)
    }

    func testSwitchingAwayFromPostClosesAnOpenPollBuilder() {
        let viewModel = makeViewModel(plan: "business")
        viewModel.isBuildingPoll = true
        viewModel.pollQuestion = "Cats or dogs?"
        viewModel.setPostType(.recruitment)
        XCTAssertFalse(viewModel.isBuildingPoll)
        XCTAssertEqual(viewModel.pollQuestion, "")
    }

    // MARK: - canPost gating

    func testRecruitmentBlocksPostingWithoutACompany() {
        let viewModel = makeViewModel(plan: "business")
        viewModel.setPostType(.recruitment)
        viewModel.text = "We're hiring!"
        XCTAssertFalse(viewModel.canPost)

        viewModel.company = "   "
        XCTAssertFalse(viewModel.canPost)

        viewModel.company = "Acme Inc."
        XCTAssertTrue(viewModel.canPost)
    }

    func testArticleBlocksPostingWithoutABody() {
        let viewModel = makeViewModel(plan: "business")
        viewModel.setPostType(.article)
        XCTAssertFalse(viewModel.canPost)

        viewModel.articleBody = "   "
        XCTAssertFalse(viewModel.canPost)

        viewModel.articleBody = "The real content goes here."
        XCTAssertTrue(viewModel.canPost)
    }

    func testArticleNeedsNoTitleOfItsOwnOnceItHasABody() {
        // Mirrors resolveCreatePostContent/isCreatePostSubmitBlocked on
        // Android: an ARTICLE's title (`text`) may stay empty as long as
        // the body is there - unlike every other type, which needs its
        // own text, media, or a poll.
        let viewModel = makeViewModel(plan: "business")
        viewModel.setPostType(.article)
        viewModel.text = ""
        viewModel.articleBody = "Body only, no title."
        XCTAssertTrue(viewModel.canPost)
    }

    func testPlainPostStillNeedsTextMediaOrAPoll() {
        let viewModel = makeViewModel(plan: "business")
        XCTAssertFalse(viewModel.canPost)
        viewModel.text = "Hello"
        XCTAssertTrue(viewModel.canPost)
    }
}
