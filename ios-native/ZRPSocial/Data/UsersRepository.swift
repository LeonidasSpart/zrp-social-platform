import Foundation

/// Which direction of the follow graph a list screen is showing.
enum FollowListKind: Hashable {
    case followers
    case following

    var titleKey: L10nKey {
        switch self {
        case .followers: return .followersTitle
        case .following: return .followingTitle
        }
    }

    var emptyKey: L10nKey {
        switch self {
        case .followers: return .followersEmpty
        case .following: return .followingEmpty
        }
    }

    fileprivate var pathComponent: String {
        switch self {
        case .followers: return "followers"
        case .following: return "following"
        }
    }
}

protocol UsersRepositoryProtocol: Sendable {
    func profile(username: String) async throws -> UserProfile
    func posts(username: String, cursor: String?) async throws -> PostsPage
    func toggleFollow(username: String) async throws -> FollowToggleResponse
    func followList(
        _ kind: FollowListKind,
        username: String,
        cursor: String?
    ) async throws -> FollowListPage
    func hashtagPosts(tag: String) async throws -> [Post]
}

struct UsersRepository: UsersRepositoryProtocol {

    private let client: ApiClient

    init(client: ApiClient = .shared) {
        self.client = client
    }

    func profile(username: String) async throws -> UserProfile {
        try await client.send(Endpoint.get("users/\(escaped(username))"))
    }

    /// `GET /api/users/{username}/posts`.
    ///
    /// Note the envelope: this route answers `{items, nextCursor}`, not
    /// the `{posts, nextCursor}` the feed routes use. Decoding it with
    /// the feed's type is a real bug the Android app hit and documented,
    /// so the two shapes stay distinct and are mapped here instead.
    ///
    /// A private account the viewer cannot see returns `{items: [], …}`
    /// rather than a 403 - the caller distinguishes that from a genuinely
    /// empty profile via `UserProfile.isContentVisible(toViewerId:)`.
    func posts(username: String, cursor: String?) async throws -> PostsPage {
        let page: PostItemsPage = try await client.send(
            Endpoint.get("users/\(escaped(username))/posts", query: [("cursor", cursor)])
        )
        return PostsPage(posts: page.items ?? [], nextCursor: page.nextCursor)
    }

    func toggleFollow(username: String) async throws -> FollowToggleResponse {
        try await client.send(Endpoint.post("users/\(escaped(username))/follow"))
    }

    func followList(
        _ kind: FollowListKind,
        username: String,
        cursor: String?
    ) async throws -> FollowListPage {
        try await client.send(
            Endpoint.get(
                "users/\(escaped(username))/\(kind.pathComponent)",
                query: [("cursor", cursor)]
            )
        )
    }

    /// `GET /api/posts/hashtag/{tag}`.
    ///
    /// A bare JSON array, not an envelope, and genuinely unpaginated -
    /// the route takes 50 and returns them directly. The screen reflects
    /// that rather than showing a "load more" that has nothing to load.
    func hashtagPosts(tag: String) async throws -> [Post] {
        try await client.send(Endpoint.get("posts/hashtag/\(escaped(tag))"))
    }

    /// Usernames and hashtags reach these methods from post text, so they
    /// are not guaranteed to be path-safe. Encoding here rather than
    /// trusting the caller keeps a stray character from silently
    /// producing a request against a different path.
    private func escaped(_ value: String) -> String {
        value.addingPercentEncoding(withAllowedCharacters: .urlPathAllowed) ?? value
    }
}
