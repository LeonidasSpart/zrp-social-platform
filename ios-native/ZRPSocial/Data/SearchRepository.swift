import Foundation

/// `GET /api/search?type=all` -> the pre-existing `{users, posts}` shape
/// UNCHANGED, plus one additive list per Advanced Search category and
/// the per-category `nextCursor` a "See all" tap needs before switching
/// into the paginated single-category mode (see `SearchPage` below).
///
/// `users`/`posts` are still capped server-side (10/20) with no
/// pagination in this "all" mode - "See all" on either section switches
/// to `type=<category>`, which does honor `cursor`/`limit`. Blocked,
/// blocking and muted accounts are excluded by the route itself, as are
/// banned users - none of that is the client's to filter.
struct SearchResults: Decodable, Equatable {
    let users: [PostAuthor]
    let posts: [Post]
    let hashtags: [TrendingHashtag]
    let communities: [Community]
    let news: [NewsArticle]
    let music: [SearchMusicResult]
    let opportunities: [Opportunity]
    let marketplace: [Listing]
    let sort: String?

    /// Declared explicitly because the custom `init(from:)` below
    /// suppresses the synthesised memberwise initialiser, and the view
    /// model needs to build an empty result.
    init(
        users: [PostAuthor],
        posts: [Post],
        hashtags: [TrendingHashtag] = [],
        communities: [Community] = [],
        news: [NewsArticle] = [],
        music: [SearchMusicResult] = [],
        opportunities: [Opportunity] = [],
        marketplace: [Listing] = [],
        sort: String? = nil
    ) {
        self.users = users
        self.posts = posts
        self.hashtags = hashtags
        self.communities = communities
        self.news = news
        self.music = music
        self.opportunities = opportunities
        self.marketplace = marketplace
        self.sort = sort
    }

    init(from decoder: Decoder) throws {
        let container = try decoder.container(keyedBy: CodingKeys.self)
        users = try container.decodeIfPresent([PostAuthor].self, forKey: .users) ?? []
        posts = try container.decodeIfPresent([Post].self, forKey: .posts) ?? []
        hashtags = try container.decodeIfPresent([TrendingHashtag].self, forKey: .hashtags) ?? []
        communities = try container.decodeIfPresent([Community].self, forKey: .communities) ?? []
        news = try container.decodeIfPresent([NewsArticle].self, forKey: .news) ?? []
        music = try container.decodeIfPresent([SearchMusicResult].self, forKey: .music) ?? []
        opportunities = try container.decodeIfPresent([Opportunity].self, forKey: .opportunities) ?? []
        marketplace = try container.decodeIfPresent([Listing].self, forKey: .marketplace) ?? []
        sort = try container.decodeIfPresent(String.self, forKey: .sort)
    }

    private enum CodingKeys: String, CodingKey {
        case users, posts, hashtags, communities, news, music, opportunities, marketplace, sort
    }

    /// Only reflects users/posts - the two categories the plain users/
    /// posts picker (this screen's pre-Advanced-Search UI) ever showed.
    /// The new category sections compute their own "nothing anywhere"
    /// check instead of overloading this one.
    var isEmpty: Bool { users.isEmpty && posts.isEmpty }
}

/// Advanced Search's Music category: `src/lib/search/categories/
/// music.ts` merges four heterogeneous Prisma models (artist/album/
/// track/playlist) into one ranked list tagged by `kind`, since there is
/// no shared table to decode polymorphically. A single flat type with
/// every kind's fields optional, switched on `kind` by the view, is the
/// pragmatic match - mirrors Android's own `SearchMusicResult` for the
/// same reason (no sealed/polymorphic Decodable dispatch registered for
/// this either). Field names mirror the backend's per-kind object
/// exactly:
///   artist:   id, displayName, avatarUrl, verified, counter
///   album:    id, title, coverUrl, artist{id,displayName}, counter
///   track:    id, title, audioUrl, coverUrl, durationSec,
///             artist{id,displayName,avatarUrl}, playCount, counter
///   playlist: id, name, coverUrl, counter
struct SearchMusicResult: Decodable, Identifiable, Equatable {
    let kind: String
    let id: String
    let displayName: String?
    let title: String?
    let name: String?
    let avatarUrl: String?
    let coverUrl: String?
    let verified: Bool
    let artist: MusicArtistRef?
    let audioUrl: String?
    let durationSec: Int?
    let playCount: Int
    let counter: Int

    init(from decoder: Decoder) throws {
        let container = try decoder.container(keyedBy: CodingKeys.self)
        kind = try container.decode(String.self, forKey: .kind)
        id = try container.decode(String.self, forKey: .id)
        displayName = try container.decodeIfPresent(String.self, forKey: .displayName)
        title = try container.decodeIfPresent(String.self, forKey: .title)
        name = try container.decodeIfPresent(String.self, forKey: .name)
        avatarUrl = try container.decodeIfPresent(String.self, forKey: .avatarUrl)
        coverUrl = try container.decodeIfPresent(String.self, forKey: .coverUrl)
        verified = try container.decodeIfPresent(Bool.self, forKey: .verified) ?? false
        artist = try container.decodeIfPresent(MusicArtistRef.self, forKey: .artist)
        audioUrl = try container.decodeIfPresent(String.self, forKey: .audioUrl)
        durationSec = try container.decodeIfPresent(Int.self, forKey: .durationSec)
        playCount = try container.decodeIfPresent(Int.self, forKey: .playCount) ?? 0
        counter = try container.decodeIfPresent(Int.self, forKey: .counter) ?? 0
    }

    private enum CodingKeys: String, CodingKey {
        case kind, id, displayName, title, name, avatarUrl, coverUrl, verified, artist, audioUrl, durationSec, playCount, counter
    }

    /// The name to show, whichever kind this is.
    var displayTitle: String { displayName ?? title ?? name ?? "" }
}

/// One page of a single Advanced Search category -
/// `GET /api/search?type=<category>` (not `all`) returns
/// `{results, nextCursor, category, sort}`, real cursor-based pagination
/// (see docs/advanced-search-architecture.md).
struct SearchPage<Item: Decodable>: Decodable {
    let results: [Item]
    let nextCursor: String?
    let category: String?
    let sort: String?
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
    func searchAll(query: String, sort: SearchSortOption, filters: SearchFilters) async throws -> SearchResults
    func suggestedUsers(limit: Int) async throws -> [PostAuthor]
    func trendingHashtags(limit: Int) async throws -> [TrendingHashtag]
    func searchHashtags(query: String, cursor: String?) async throws -> HashtagSearchPage

    // Advanced Search's single-category paginated mode
    // (type=<category>&sort=&dateRange=&...&cursor=) - one method per
    // category since the response's item type differs and Swift's
    // generic `SearchPage<Item>` needs a concrete `Item` at the call
    // site. Distinct from `searchHashtags(query:cursor:)` above, which
    // hits the separate `/api/hashtags/search` route for search-as-you-
    // type, not this one's `/api/search?type=hashtags`.
    func searchUsersCategory(query: String, sort: SearchSortOption, filters: SearchFilters, cursor: String?) async throws -> SearchPage<PostAuthor>
    func searchPostsCategory(query: String, sort: SearchSortOption, filters: SearchFilters, cursor: String?) async throws -> SearchPage<Post>
    func searchHashtagsCategory(query: String, sort: SearchSortOption, filters: SearchFilters, cursor: String?) async throws -> SearchPage<TrendingHashtag>
    func searchCommunitiesCategory(query: String, sort: SearchSortOption, filters: SearchFilters, cursor: String?) async throws -> SearchPage<Community>
    func searchNewsCategory(query: String, sort: SearchSortOption, filters: SearchFilters, cursor: String?) async throws -> SearchPage<NewsArticle>
    func searchMusicCategory(query: String, sort: SearchSortOption, filters: SearchFilters, cursor: String?) async throws -> SearchPage<SearchMusicResult>
    func searchOpportunitiesCategory(query: String, sort: SearchSortOption, filters: SearchFilters, cursor: String?) async throws -> SearchPage<Opportunity>
    func searchMarketplaceCategory(query: String, sort: SearchSortOption, filters: SearchFilters, cursor: String?) async throws -> SearchPage<Listing>
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

    // Advanced Search's type=all mode, now carrying sort/filters too (the
    // web page's own AllModeSections does the same) - a teaser per
    // category, capped server-side, with "See all" switching into the
    // paginated single-category mode below.
    func searchAll(query: String, sort: SearchSortOption, filters: SearchFilters) async throws -> SearchResults {
        try await client.send(
            Endpoint.get("search", query: [("q", query), ("type", "all")] + Self.filterQueryItems(sort: sort, filters: filters, includeMedia: true, includeCommunity: true))
        )
    }

    func searchUsersCategory(query: String, sort: SearchSortOption, filters: SearchFilters, cursor: String? = nil) async throws -> SearchPage<PostAuthor> {
        try await client.send(Self.categoryEndpoint("users", query: query, sort: sort, filters: filters, cursor: cursor, includeMedia: false, includeCommunity: false))
    }

    func searchPostsCategory(query: String, sort: SearchSortOption, filters: SearchFilters, cursor: String? = nil) async throws -> SearchPage<Post> {
        try await client.send(Self.categoryEndpoint("posts", query: query, sort: sort, filters: filters, cursor: cursor, includeMedia: true, includeCommunity: true))
    }

    func searchHashtagsCategory(query: String, sort: SearchSortOption, filters: SearchFilters, cursor: String? = nil) async throws -> SearchPage<TrendingHashtag> {
        try await client.send(Self.categoryEndpoint("hashtags", query: query, sort: sort, filters: filters, cursor: cursor, includeMedia: false, includeCommunity: true, includePersonFilters: false))
    }

    func searchCommunitiesCategory(query: String, sort: SearchSortOption, filters: SearchFilters, cursor: String? = nil) async throws -> SearchPage<Community> {
        try await client.send(Self.categoryEndpoint("communities", query: query, sort: sort, filters: filters, cursor: cursor, includeMedia: false, includeCommunity: false, includePersonFilters: false))
    }

    func searchNewsCategory(query: String, sort: SearchSortOption, filters: SearchFilters, cursor: String? = nil) async throws -> SearchPage<NewsArticle> {
        try await client.send(Self.categoryEndpoint("news", query: query, sort: sort, filters: filters, cursor: cursor, includeMedia: false, includeCommunity: false, includePersonFilters: false))
    }

    func searchMusicCategory(query: String, sort: SearchSortOption, filters: SearchFilters, cursor: String? = nil) async throws -> SearchPage<SearchMusicResult> {
        try await client.send(Self.categoryEndpoint("music", query: query, sort: sort, filters: filters, cursor: cursor, includeMedia: false, includeCommunity: false, includePersonFilters: false))
    }

    func searchOpportunitiesCategory(query: String, sort: SearchSortOption, filters: SearchFilters, cursor: String? = nil) async throws -> SearchPage<Opportunity> {
        try await client.send(Self.categoryEndpoint("opportunities", query: query, sort: sort, filters: filters, cursor: cursor, includeMedia: false, includeCommunity: false))
    }

    func searchMarketplaceCategory(query: String, sort: SearchSortOption, filters: SearchFilters, cursor: String? = nil) async throws -> SearchPage<Listing> {
        try await client.send(Self.categoryEndpoint("marketplace", query: query, sort: sort, filters: filters, cursor: cursor, includeMedia: false, includeCommunity: false))
    }

    private static func categoryEndpoint(
        _ category: String,
        query: String,
        sort: SearchSortOption,
        filters: SearchFilters,
        cursor: String?,
        includeMedia: Bool,
        includeCommunity: Bool,
        includePersonFilters: Bool = true
    ) -> Endpoint {
        var items: [(String, String?)] = [("q", query), ("type", category), ("cursor", cursor)]
        items += filterQueryItems(
            sort: sort,
            filters: filters,
            includeMedia: includeMedia,
            includeCommunity: includeCommunity,
            includePersonFilters: includePersonFilters
        )
        return Endpoint.get("search", query: items)
    }

    /// Shared sort/date-range/language/country/verified/professional/
    /// creator (+ media/community where applicable) query items - one
    /// place so every category method builds the exact same shape the
    /// backend parses (`src/lib/search/params.ts`), rather than each
    /// method re-deriving its own subset by hand.
    private static func filterQueryItems(
        sort: SearchSortOption,
        filters: SearchFilters,
        includeMedia: Bool,
        includeCommunity: Bool,
        includePersonFilters: Bool = true
    ) -> [(String, String?)] {
        var items: [(String, String?)] = [
            ("sort", sort.rawValue),
            ("dateRange", filters.dateRange.rawValue),
        ]
        if filters.dateRange == .custom {
            items.append(("dateFrom", filters.dateFrom))
            items.append(("dateTo", filters.dateTo))
        }
        if includePersonFilters {
            let language = filters.language?.trimmingCharacters(in: .whitespaces)
            let country = filters.country?.trimmingCharacters(in: .whitespaces)
            items.append(("language", (language?.isEmpty == false) ? language : nil))
            items.append(("country", (country?.isEmpty == false) ? country : nil))
            items.append(("verified", filters.verified ? "true" : nil))
            items.append(("professional", filters.professional ? "true" : nil))
            items.append(("creator", filters.creator ? "true" : nil))
        }
        if includeMedia {
            items.append(("media", filters.media?.rawValue))
        }
        if includeCommunity {
            let community = filters.community?.trimmingCharacters(in: .whitespaces)
            items.append(("community", (community?.isEmpty == false) ? community : nil))
        }
        return items
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
