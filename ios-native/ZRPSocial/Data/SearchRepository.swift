import Foundation

/// `GET /api/search` -> `{users, posts}`.
///
/// Both arrays are capped server-side (10 users, 20 posts) with no
/// pagination, so the screen shows what it gets and offers no "load
/// more". Blocked, blocking and muted accounts are excluded by the route
/// itself, as are banned users - none of that is the client's to filter.
struct SearchResults: Decodable, Equatable {
    let users: [PostAuthor]
    let posts: [Post]

    /// Declared explicitly because the custom `init(from:)` below
    /// suppresses the synthesised memberwise initialiser, and the view
    /// model needs to build an empty result.
    init(users: [PostAuthor], posts: [Post]) {
        self.users = users
        self.posts = posts
    }

    init(from decoder: Decoder) throws {
        let container = try decoder.container(keyedBy: CodingKeys.self)
        users = try container.decodeIfPresent([PostAuthor].self, forKey: .users) ?? []
        posts = try container.decodeIfPresent([Post].self, forKey: .posts) ?? []
    }

    private enum CodingKeys: String, CodingKey {
        case users, posts
    }

    var isEmpty: Bool { users.isEmpty && posts.isEmpty }
}

/// One entry of `GET /api/hashtags/trending` - a bare array. The same
/// shape `GET /api/hashtags/search` pages back, so this one struct
/// serves both routes.
struct TrendingHashtag: Decodable, Identifiable, Equatable {
    let tag: String
    let count: Int

    var id: String { tag }
}

/// `GET /api/hashtags/search` -> `{items, nextCursor}` - a numeric
/// offset into the server's own ranked-by-usage match list, the same
/// cursor convention `GET /api/posts/explore` uses for its own
/// non-relational result set (see the route's own doc comment).
struct HashtagSearchPage: Decodable {
    let items: [TrendingHashtag]
    let nextCursor: String?
}

protocol SearchRepositoryProtocol: Sendable {
    func search(query: String) async throws -> SearchResults
    func suggestedUsers(limit: Int) async throws -> [PostAuthor]
    func trendingHashtags(limit: Int) async throws -> [TrendingHashtag]
    func searchHashtags(query: String, cursor: String?) async throws -> HashtagSearchPage
}

struct SearchRepository: SearchRepositoryProtocol {

    /// The route answers `{users: [], posts: []}` for anything shorter,
    /// so the client refuses below this rather than spending a request
    /// that can only come back empty.
    static let minimumQueryLength = 2

    private let client: ApiClient

    init(client: ApiClient = .shared) {
        self.client = client
    }

    func search(query: String) async throws -> SearchResults {
        try await client.send(
            Endpoint.get("search", query: [("q", query), ("type", "all")])
        )
    }

    /// Accounts the viewer does not already follow, ranked by follower
    /// count. Requires a session - it answers 401 when signed out.
    func suggestedUsers(limit: Int = 10) async throws -> [PostAuthor] {
        try await client.send(
            Endpoint.get("users/suggested", query: [("limit", "\(limit)")])
        )
    }

    /// A bare array, server-cached. The route clamps `limit` to 1...50.
    func trendingHashtags(limit: Int = 10) async throws -> [TrendingHashtag] {
        try await client.send(
            Endpoint.get("hashtags/trending", query: [("limit", "\(limit)")])
        )
    }

    /// Prefix match against every real hashtag, ranked by usage -
    /// distinct from `search(query:)` above, which only exact-matches a
    /// tag already typed out in full as part of a broader post search.
    /// Works signed-out; a leading "#" is stripped server-side, so the
    /// caller does not need to strip it first.
    func searchHashtags(query: String, cursor: String? = nil) async throws -> HashtagSearchPage {
        try await client.send(
            Endpoint.get("hashtags/search", query: [("q", query), ("cursor", cursor)])
        )
    }
}
