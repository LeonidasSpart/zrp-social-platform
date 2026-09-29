import Foundation

/// Advanced Search's category/sort/filter vocabulary - shared between
/// `SearchViewModel`'s UI state and `SearchRepository`'s wire calls, so
/// both sides always agree on the same set of values as the real
/// `GET /search` contract (docs/advanced-search-architecture.md).
/// Mirrors Android's own `SearchOptions.kt` one-for-one.
enum SearchCategory: String, CaseIterable, Identifiable {
    case all
    case people
    case posts
    case hashtags
    case communities
    case news
    case music
    case opportunities
    case marketplace

    var id: String { rawValue }

    /// `nil` for `.all`: it has no single-category wire value of its own
    /// - each real category dispatches to its own dedicated
    /// `SearchRepository.searchXxxCategory()` method, whose own `type`
    /// query parameter already encodes it.
    var wireValue: String? {
        switch self {
        case .all: return nil
        case .people: return "users"
        case .posts: return "posts"
        case .hashtags: return "hashtags"
        case .communities: return "communities"
        case .news: return "news"
        case .music: return "music"
        case .opportunities: return "opportunities"
        case .marketplace: return "marketplace"
        }
    }

    var titleKey: L10nKey {
        switch self {
        case .all: return .searchAllTab
        case .people: return .searchPeopleTab
        case .posts: return .searchPostsTab
        case .hashtags: return .searchHashtagsTab
        case .communities: return .navCommunities
        case .news: return .navNews
        case .music: return .navMusic
        case .opportunities: return .navOpportunity
        case .marketplace: return .navMarketplace
        }
    }
}

enum SearchSortOption: String, CaseIterable, Identifiable {
    case relevance
    case recent
    case engagement
    case trending

    var id: String { rawValue }

    var titleKey: L10nKey {
        switch self {
        case .relevance: return .searchSortRelevance
        case .recent: return .searchSortRecent
        case .engagement: return .searchSortEngagement
        case .trending: return .searchSortTrending
        }
    }
}

enum SearchDateRangeOption: String, CaseIterable, Identifiable {
    case any
    case last24h = "24h"
    case last7d = "7d"
    case last30d = "30d"
    case custom

    var id: String { rawValue }

    var titleKey: L10nKey {
        switch self {
        case .any: return .searchDateAny
        case .last24h: return .searchDate24h
        case .last7d: return .searchDate7d
        case .last30d: return .searchDate30d
        case .custom: return .searchDateCustom
        }
    }
}

/// `nil` means "All media" (no filter) - there is no "all" wire value,
/// matching `MediaFilter`'s real 5 values in `src/lib/search/types.ts`.
/// The wire value for "text only" is literally `"none"`, but the case
/// itself is named `textOnly` rather than `none` - a case called `none`
/// on an enum used as `SearchMediaFilterOption?` collides with
/// `Optional.none` (`nil`), so `.none` in an optional-typed expression
/// would silently mean "no filter selected" instead of selecting this
/// case.
enum SearchMediaFilterOption: String, CaseIterable, Identifiable {
    case image
    case video
    case gif
    case poll
    case textOnly = "none"

    var id: String { rawValue }

    var titleKey: L10nKey {
        switch self {
        case .image: return .searchMediaImage
        case .video: return .searchMediaVideo
        case .gif: return .searchMediaGif
        case .poll: return .searchMediaPoll
        case .textOnly: return .searchMediaNone
        }
    }
}

struct SearchFilters: Equatable {
    var dateRange: SearchDateRangeOption = .any
    /// ISO-8601 date strings (yyyy-MM-dd), only meaningful when `dateRange == .custom`.
    var dateFrom: String?
    var dateTo: String?
    var language: String?
    var country: String?
    /// Posts only.
    var media: SearchMediaFilterOption?
    /// People/Posts/Opportunities/Marketplace only.
    var verified = false
    var professional = false
    var creator = false
    /// Scopes Posts/Hashtags to one Community's hashtag.
    var community: String?

    var isActive: Bool {
        dateRange != .any ||
            !(language ?? "").trimmingCharacters(in: .whitespaces).isEmpty ||
            !(country ?? "").trimmingCharacters(in: .whitespaces).isEmpty ||
            media != nil ||
            verified ||
            professional ||
            creator
    }
}
