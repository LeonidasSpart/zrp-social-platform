import Foundation

/// A list of people, identified by where it comes from.
///
/// The two follow directions and "who reposted this post" answer the
/// same `{items, nextCursor}` envelope with the same user shape, so they
/// share one screen rather than three near-identical ones. Only the path
/// and the wording differ, which is all this enum carries.
enum UserListSource: Hashable {
    case followers(username: String)
    case following(username: String)
    case reposts(postId: String)

    var titleKey: L10nKey {
        switch self {
        case .followers: return .followersTitle
        case .following: return .followingTitle
        case .reposts: return .repostsTitle
        }
    }

    var emptyKey: L10nKey {
        switch self {
        case .followers: return .followersEmpty
        case .following: return .followingEmpty
        case .reposts: return .repostsEmpty
        }
    }

    var emptySystemImage: String {
        switch self {
        case .followers, .following: return "person.2"
        case .reposts: return "arrow.2.squarepath"
        }
    }

    fileprivate var path: String {
        switch self {
        case .followers(let username):
            return "users/\(Endpoint.segment(username))/followers"
        case .following(let username):
            return "users/\(Endpoint.segment(username))/following"
        case .reposts(let postId):
            return "posts/\(Endpoint.segment(postId))/reposts"
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
    func setCover(url: String) async throws
    func usernameStatus() async throws -> UsernameStatus
    func changeUsername(_ username: String) async throws
    func changeEmail(currentPassword: String, newEmail: String) async throws
    func userList(_ source: UserListSource, cursor: String?) async throws -> FollowListPage
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

/// `GET /api/user/username` - the current username and how long until it
/// can change again.
///
/// The route allows one change every 30 days and reports the remaining
/// days itself, so the screen states the wait instead of letting someone
/// type a new name and be refused.
struct UsernameStatus: Decodable, Equatable {
    let username: String
    let cooldownDays: Int

    var canChange: Bool { cooldownDays <= 0 }

    init(from decoder: Decoder) throws {
        let container = try decoder.container(keyedBy: CodingKeys.self)
        username = try container.decodeIfPresent(String.self, forKey: .username) ?? ""
        cooldownDays = try container.decodeIfPresent(Int.self, forKey: .cooldownDays) ?? 0
    }

    private enum CodingKeys: String, CodingKey {
        case username, cooldownDays
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

    /// All three sources page the same way and return the same rows.
    ///
    /// A private account whose content the viewer may not see answers
    /// `{items: [], nextCursor: null}` from every one of them rather than
    /// a 403, so an empty page here is a legitimate result, not an error
    /// to report.
    func userList(_ source: UserListSource, cursor: String?) async throws -> FollowListPage {
        try await client.send(
            Endpoint.get(source.path, query: [("cursor", cursor)])
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

    /// Points the account at an already-uploaded cover image.
    ///
    /// The route rejects any URL that is not on UploadThing's hosts, so
    /// the image must go through the uploader first - which is what the
    /// app does anyway.
    func setCover(url: String) async throws {
        struct Request: Encodable { let coverUrl: String }
        try await client.sendIgnoringResponse(
            try Endpoint.post("user/update-cover", body: Request(coverUrl: url))
        )
    }

    func usernameStatus() async throws -> UsernameStatus {
        try await client.send(Endpoint.get("user/username"))
    }

    /// One change per 30 days, enforced server-side. Letters, numbers and
    /// underscores only, 3-20 characters - the same rules registration
    /// applies.
    func changeUsername(_ username: String) async throws {
        struct Request: Encodable { let username: String }
        try await client.sendIgnoringResponse(
            try Endpoint.put("user/username", body: Request(username: username))
        )
    }

    /// Changing an email requires the current password and does **not**
    /// take effect immediately: the route sends a verification link to
    /// the new address and only switches once it is opened. The screen
    /// says so rather than implying the change is done.
    func changeEmail(currentPassword: String, newEmail: String) async throws {
        struct Request: Encodable {
            let currentPassword: String
            let newEmail: String
        }
        try await client.sendIgnoringResponse(
            try Endpoint.put(
                "user/email",
                body: Request(currentPassword: currentPassword, newEmail: newEmail)
            )
        )
    }
}
