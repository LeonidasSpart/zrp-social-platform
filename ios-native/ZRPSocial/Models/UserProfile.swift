import Foundation

/// A full user profile, from `GET /api/users/{username}`.
///
/// The route deliberately minimises what it returns to an unauthenticated
/// caller: `isAdmin` is stripped entirely, and `solanaWallet` is nulled
/// unless the viewer owns the profile or the creator has actually enabled
/// tipping. Neither is modelled here - the app has no use for privileged
/// status, and it surfaces no tipping UI (that flow is blocked in native
/// apps by the store payment policy).
struct UserProfile: Decodable, Identifiable, Equatable {
    let id: String
    let username: String
    let customUrl: String?
    let name: String?
    let bio: String?
    let avatarUrl: String?
    let coverUrl: String?
    let location: String?
    let country: String?
    let website: String?
    let createdAt: Date
    let isPrivate: Bool
    let badgeType: String?
    let pinnedPostId: String?
    let banned: Bool
    let publicLikes: Bool
    let publicFollowing: Bool
    let category: String?
    let showCategory: Bool
    /// `var` because the follow route returns only the resulting flag,
    /// not a refreshed profile - so a successful follow adjusts these two
    /// locally rather than leaving a visibly stale count or spending a
    /// second round trip the website does not spend either.
    var counts: ProfileCounts

    /// False both when the viewer does not follow this account and when
    /// there is no viewer at all - the route returns `false` in both
    /// cases, and the app treats a signed-out viewer as "not following"
    /// rather than showing a follow control that would 401.
    var isFollowing: Bool
    let isBlocked: Bool

    private enum CodingKeys: String, CodingKey {
        case id, username, customUrl, name, bio, avatarUrl, coverUrl
        case location, country, website, createdAt, isPrivate, badgeType
        case pinnedPostId, banned, publicLikes, publicFollowing
        case category, showCategory, isFollowing, isBlocked
        case counts = "_count"
    }

    var displayName: String { name?.isEmpty == false ? name! : username }
    var handle: String { "@\(username)" }

    /// Whether the viewer is allowed to see this account's posts.
    ///
    /// A private account the viewer does not follow gets `{items: [], …}`
    /// from every list route rather than a 403 - so without this check
    /// the profile would render a misleading "No posts yet" instead of
    /// explaining that the account is private.
    func isContentVisible(toViewerId viewerId: String?) -> Bool {
        if !isPrivate { return true }
        if viewerId == id { return true }
        return isFollowing
    }
}

struct ProfileCounts: Decodable, Equatable {
    let posts: Int
    let followers: Int
    let following: Int

    init(posts: Int, followers: Int, following: Int) {
        self.posts = posts
        self.followers = followers
        self.following = following
    }

    init(from decoder: Decoder) throws {
        let container = try decoder.container(keyedBy: CodingKeys.self)
        posts = try container.decodeIfPresent(Int.self, forKey: .posts) ?? 0
        followers = try container.decodeIfPresent(Int.self, forKey: .followers) ?? 0
        following = try container.decodeIfPresent(Int.self, forKey: .following) ?? 0
    }

    private enum CodingKeys: String, CodingKey {
        case posts, followers, following
    }
}

/// `POST /api/users/{username}/follow`.
///
/// Three real outcomes, not two: following a public account succeeds
/// immediately (`following: true`), following a private one creates a
/// pending request (`requested: true`), and unfollowing returns both
/// false. The server also sends its own `message` for the request cases
/// ("Follow request already sent.", "Follow request re-sent.") which the
/// UI shows verbatim rather than paraphrasing.
struct FollowToggleResponse: Decodable {
    let following: Bool
    let requested: Bool
    let message: String?
}

/// One row in a followers/following list.
struct FollowListUser: Decodable, Identifiable, Equatable {
    let id: String
    let username: String
    let name: String?
    let avatarUrl: String?
    let bio: String?
    let badgeType: String?

    /// Whether the viewer already follows this account.
    ///
    /// The follow-list routes always send it. The reposts route only
    /// attaches it when there IS a viewer and the page is non-empty, so
    /// signed out it is absent entirely - which means "not following"
    /// here, since a signed-out reader follows nobody.
    let isFollowing: Bool

    var displayName: String { name?.isEmpty == false ? name! : username }
    var handle: String { "@\(username)" }

    private enum CodingKeys: String, CodingKey {
        case id, username, name, avatarUrl, bio, badgeType, isFollowing
    }

    init(from decoder: Decoder) throws {
        let container = try decoder.container(keyedBy: CodingKeys.self)
        id = try container.decode(String.self, forKey: .id)
        username = try container.decode(String.self, forKey: .username)
        name = try container.decodeIfPresent(String.self, forKey: .name)
        avatarUrl = try container.decodeIfPresent(String.self, forKey: .avatarUrl)
        bio = try container.decodeIfPresent(String.self, forKey: .bio)
        badgeType = try container.decodeIfPresent(String.self, forKey: .badgeType)
        isFollowing = try container.decodeIfPresent(Bool.self, forKey: .isFollowing) ?? false
    }
}

struct FollowListPage: Decodable {
    let items: [FollowListUser]
    let nextCursor: String?
}
