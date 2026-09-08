import Foundation

/// One ZRP News article, as `GET /api/news` and `GET /api/news/{slug}`
/// return it.
///
/// Only published articles ever reach either route, so there is no draft
/// state to represent here.
struct NewsArticle: Decodable, Identifiable, Equatable {
    let id: String
    let title: String
    let slug: String
    let excerpt: String?
    /// Present on the single-article route; the list route sends it too,
    /// but the list never renders it.
    let content: String?
    let coverImage: String?
    let sourceName: String?
    let sourceUrl: String?
    let category: NewsCategory
    let views: Int
    let featured: Bool
    /// Every article the public routes return is published, so this is
    /// only ever `nil` for a row that should not have been returned.
    let publishedAt: Date?
    let author: PostAuthor?
}

/// The eleven categories `NewsArticleCategory` defines in the schema.
///
/// Decoded leniently: a category added to the enum server-side must not
/// make a whole page of news fail to decode on an app that predates it.
enum NewsCategory: String, Decodable, CaseIterable, Identifiable {
    case world = "WORLD"
    case europe = "EUROPE"
    case switzerland = "SWITZERLAND"
    case politics = "POLITICS"
    case business = "BUSINESS"
    case technology = "TECHNOLOGY"
    case crypto = "CRYPTO"
    case science = "SCIENCE"
    case sports = "SPORTS"
    case culture = "CULTURE"
    case community = "COMMUNITY"
    /// Anything this build does not know about. Never sent as a filter.
    case unknown

    var id: String { rawValue }

    init(from decoder: Decoder) throws {
        let raw = try decoder.singleValueContainer().decode(String.self)
        self = NewsCategory(rawValue: raw.uppercased()) ?? .unknown
    }

    /// The web dictionary's own label for this category.
    var titleKey: L10nKey? {
        switch self {
        case .world: return .newsCategoryWorld
        case .europe: return .newsCategoryEurope
        case .switzerland: return .newsCategorySwitzerland
        case .politics: return .newsCategoryPolitics
        case .business: return .newsCategoryBusiness
        case .technology: return .newsCategoryTechnology
        case .crypto: return .newsCategoryCrypto
        case .science: return .newsCategoryScience
        case .sports: return .newsCategorySports
        case .culture: return .newsCategoryCulture
        case .community: return .newsCategoryCommunity
        case .unknown: return nil
        }
    }

    /// The categories offered as filters - `unknown` is not one of them,
    /// since the route would reject it with a 400.
    static var selectable: [NewsCategory] {
        allCases.filter { $0 != .unknown }
    }
}

/// One page of `GET /api/news`.
struct NewsPage: Equatable {
    let articles: [NewsArticle]
    /// The `publishedAt` of the last article, which is what this route
    /// uses as its cursor - not an opaque token.
    let nextCursor: String?
}
