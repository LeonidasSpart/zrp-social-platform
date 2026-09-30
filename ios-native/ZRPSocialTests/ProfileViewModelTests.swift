import XCTest
@testable import ZRPSocial

/// Coverage for the "Requested" follow-button state (Task #5, iOS parity
/// audit): `UserProfile` never decoded the backend's `followRequestStatus`
/// field, so `ProfileViewModel.toggleFollow()` on a private account would
/// send a real follow request but leave the button reading "Follow" -
/// unlike web's `isFollowRequested`, which shows a disabled "Requested"
/// pill that survives a reload.
@MainActor
final class ProfileViewModelTests: XCTestCase {

    private final class StubUsersRepository: UsersRepositoryProtocol, @unchecked Sendable {
        var profileResult: Result<UserProfile, Error> = .failure(ApiError.transport(underlying: "not configured"))
        var toggleFollowResult: Result<FollowToggleResponse, Error> = .failure(ApiError.transport(underlying: "not configured"))

        func profile(username: String) async throws -> UserProfile {
            switch profileResult {
            case .success(let profile): return profile
            case .failure(let error): throw error
            }
        }
        func toggleFollow(username: String) async throws -> FollowToggleResponse {
            switch toggleFollowResult {
            case .success(let response): return response
            case .failure(let error): throw error
            }
        }
        func tabPosts(_ tab: ProfilePostsTab, username: String, cursor: String?) async throws -> PostsPage { fatalError("not exercised by these tests") }
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

    private struct StubPostsRepository: PostsRepositoryProtocol {
        func feed(_ tab: FeedTab, cursor: String?, forceRefresh: Bool) async throws -> PostsPage { fatalError("not exercised by these tests") }
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

    /// A **private** account with no pinned post and no history in the
    /// selected (default) tab - so `load()` never touches
    /// `PostsRepositoryProtocol` at all, and the stub above can fatalError
    /// on everything without these tests ever tripping it.
    private static func makePrivateProfile() -> UserProfile {
        let json = """
        {
            "id": "user-1",
            "username": "priv_user",
            "createdAt": "2024-01-01T00:00:00Z",
            "isPrivate": true,
            "banned": false,
            "publicLikes": false,
            "publicFollowing": false,
            "showCategory": false,
            "_count": {"posts": 0, "followers": 0, "following": 0},
            "isFollowing": false,
            "isBlocked": false
        }
        """.data(using: .utf8)!
        let decoder = JSONDecoder()
        decoder.dateDecodingStrategy = .iso8601
        return try! decoder.decode(UserProfile.self, from: json)
    }

    private func makeViewModel(users: StubUsersRepository) -> ProfileViewModel {
        ProfileViewModel(
            username: "priv_user",
            repository: users,
            postsRepository: StubPostsRepository()
        )
    }

    func testProfileWithNoFollowRequestStatusReadsAsNotRequested() {
        let profile = Self.makePrivateProfile()
        XCTAssertFalse(profile.isRequested)
        XCTAssertNil(profile.followRequestStatus)
    }

    func testProfileWithAPendingFollowRequestStatusReadsAsRequested() {
        let json = """
        {
            "id": "user-1", "username": "priv_user", "createdAt": "2024-01-01T00:00:00Z",
            "isPrivate": true, "banned": false, "publicLikes": false, "publicFollowing": false,
            "showCategory": false, "_count": {"posts": 0, "followers": 0, "following": 0},
            "isFollowing": false, "isBlocked": false, "followRequestStatus": "pending"
        }
        """.data(using: .utf8)!
        let decoder = JSONDecoder()
        decoder.dateDecodingStrategy = .iso8601
        let profile = try! decoder.decode(UserProfile.self, from: json)
        XCTAssertTrue(profile.isRequested)
    }

    /// The real bug this fixes: after `toggleFollow()` returns
    /// `requested: true` (a private account, following: false), the
    /// profile the view model now holds must read as "Requested" - not
    /// silently fall back to a bare "Follow" the moment the request was
    /// actually sent.
    func testTogglingFollowOnAPrivateAccountLeavesTheProfileMarkedAsRequested() async {
        let users = StubUsersRepository()
        users.profileResult = .success(Self.makePrivateProfile())
        let viewModel = makeViewModel(users: users)
        await viewModel.load()
        XCTAssertEqual(viewModel.profile?.isRequested, false)

        users.toggleFollowResult = .success(
            FollowToggleResponse(following: false, requested: true, message: "Follow request sent.")
        )
        await viewModel.toggleFollow()

        XCTAssertEqual(viewModel.profile?.isFollowing, false)
        XCTAssertEqual(viewModel.profile?.isRequested, true)
        XCTAssertEqual(viewModel.followNotice, "Follow request sent.")
    }

    /// A second tap while already `pending` (the route's "already sent"
    /// response) must not clear the Requested state back to plain Follow.
    func testRepeatingAnAlreadyPendingRequestKeepsTheRequestedState() async {
        let users = StubUsersRepository()
        users.profileResult = .success(Self.makePrivateProfile())
        let viewModel = makeViewModel(users: users)
        await viewModel.load()

        users.toggleFollowResult = .success(
            FollowToggleResponse(following: false, requested: true, message: "Follow request sent.")
        )
        await viewModel.toggleFollow()
        XCTAssertTrue(viewModel.profile?.isRequested ?? false)

        users.toggleFollowResult = .success(
            FollowToggleResponse(following: false, requested: true, message: "Follow request already sent.")
        )
        await viewModel.toggleFollow()
        XCTAssertTrue(viewModel.profile?.isRequested ?? false)
    }

    /// Unfollowing (or a public account's plain follow) must clear a
    /// stale pending flag rather than leaving "Requested" stuck forever.
    func testBecomingAGenuineFollowClearsAnyPriorRequestedState() async {
        let users = StubUsersRepository()
        users.profileResult = .success(Self.makePrivateProfile())
        let viewModel = makeViewModel(users: users)
        await viewModel.load()

        users.toggleFollowResult = .success(
            FollowToggleResponse(following: true, requested: false, message: nil)
        )
        await viewModel.toggleFollow()

        XCTAssertEqual(viewModel.profile?.isFollowing, true)
        XCTAssertEqual(viewModel.profile?.isRequested, false)
    }
}
