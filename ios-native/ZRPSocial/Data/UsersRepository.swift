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
    func updateProfile(_ request: ProfileUpdateRequest) async throws
    func setAvatar(url: String) async throws
    func completeOnboarding() async throws
    func followList(
        _ kind: FollowListKind,
        username: String,
        cursor: String?
    ) async throws -> FollowListPage
    func hashtagPosts(tag: String) async throws -> [Post]
}

/// `PUT /api/user/profile` - the route onboarding and the profile editor
/// both use. Distinct from `PUT /api/user`, which also accepts country,
/// category and wallet fields this app does not offer.
struct ProfileUpdateRequest: Encodable, Equatable {
    let name: String?
    let bio: String?
    let location: String?
    let website: String?

    /// Explicit nulls: the route writes each field it is given, so an
    /// emptied box has to arrive as null rather than being dropped.
    func encode(to encoder: Encoder) throws {
        var container = encoder.container(keyedBy: CodingKeys.self)
        try container.encode(name, forKey: .name)
        try container.encode(bio, forKey: .bio)
        try container.encode(location, forKey: .location)
        try container.encode(website, forKey: .website)
    }

    private enum CodingKeys: String, CodingKey {
        case name, bio, location, website
    }
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
    /// One shared segment encoder for the whole app - see
    /// `Endpoint.segment`. The previous local version allowed `/`, which
    /// a single path component must not contain.
    private func escaped(_ value: String) -> String {
        Endpoint.segment(value)
    }

    // MARK: - Own profile

    func updateProfile(_ request: ProfileUpdateRequest) async throws {
        try await client.sendIgnoringResponse(
            try Endpoint.put("user/profile", body: request)
        )
    }

    /// Points the account at an already-uploaded avatar.
    ///
    /// The route accepts either a multipart file or a JSON `avatarUrl`.
    /// This app uploads through UploadThing first - the same path every
    /// other image takes - and then hands over the resulting URL, so
    /// there is one upload mechanism in the app rather than two.
    func setAvatar(url: String) async throws {
        struct Request: Encodable { let avatarUrl: String }
        try await client.sendIgnoringResponse(
            try Endpoint.post("user/update-avatar", body: Request(avatarUrl: url))
        )
    }

    /// Marks onboarding done. The flag lives on the user row, so the app
    /// re-reads the session afterwards rather than assuming it locally.
    func completeOnboarding() async throws {
        try await client.sendIgnoringResponse(Endpoint.post("user/onboarding-complete"))
    }
}
