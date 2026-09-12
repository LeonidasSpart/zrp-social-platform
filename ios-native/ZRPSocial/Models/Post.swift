import Foundation

/// The author summary every post/comment/notification payload embeds.
struct PostAuthor: Decodable, Identifiable, Equatable, Hashable {
    let id: String
    let username: String
    let name: String?
    let avatarUrl: String?
    let badgeType: String?

    /// Present on the following feed's author select but not the explore
    /// feed's. Never relied on for gating - plan checks are server-side.
    let plan: String?

    var displayName: String { name?.isEmpty == false ? name! : username }
    var handle: String { "@\(username)" }
}

/// Prisma's `_count` aggregate.
struct PostCounts: Decodable, Equatable, Hashable {
    let likes: Int
    let comments: Int
    let reposts: Int

    /// Only selected by `GET /api/posts/explore`; the following feed's
    /// `_count` omits it entirely. Optional rather than defaulted to 0 so
    /// "the server did not tell us" stays distinguishable from "zero".
    let quotedBy: Int?

    private enum CodingKeys: String, CodingKey {
        case likes, comments, reposts, quotedBy
    }

    init(from decoder: Decoder) throws {
        let container = try decoder.container(keyedBy: CodingKeys.self)
        likes = try container.decodeIfPresent(Int.self, forKey: .likes) ?? 0
        comments = try container.decodeIfPresent(Int.self, forKey: .comments) ?? 0
        reposts = try container.decodeIfPresent(Int.self, forKey: .reposts) ?? 0
        quotedBy = try container.decodeIfPresent(Int.self, forKey: .quotedBy)
    }
}

/// The post a quote post quotes.
///
/// A distinct, non-recursive type rather than `Post?` on `Post`, because
/// the API genuinely only nests one level: both feed routes select
/// `quotePost` with its own `author` but no `quotePost` of its own. A
/// self-referential struct would also be illegal in Swift without boxing,
/// so modelling the real depth is both correct and simpler.
///
/// The two feeds differ here: explore's `quotePost` select includes
/// `_count`, the following feed's does not - hence the optional.
struct QuotedPost: Decodable, Identifiable, Equatable, Hashable {
    let id: String
    let content: String
    let imageUrl: String?
    let imageUrls: [String]?
    let mediaType: String?
    let createdAt: Date
    let author: PostAuthor
    let counts: PostCounts?

    private enum CodingKeys: String, CodingKey {
        case id, content, imageUrl, imageUrls, mediaType, createdAt, author
        case counts = "_count"
    }
}

/// `Post.type` on the backend - three shapes sharing one table.
///
/// `unknown` rather than a decoding failure: a type added to the web
/// later must not make an entire feed page undecodable on an iOS build
/// that predates it. Such a post renders as its text, which is the one
/// thing every type has.
enum PostType: String, Decodable, Equatable, Hashable {
    case post = "POST"
    case recruitment = "RECRUITMENT"
    case article = "ARTICLE"
    case unknown

    init(from decoder: Decoder) throws {
        let raw = try decoder.singleValueContainer().decode(String.self)
        self = PostType(rawValue: raw.uppercased()) ?? .unknown
    }

    /// The label on the pill beside a post's timestamp, or `nil` for the
    /// types that get no pill - an ordinary post, and one whose type
    /// this build has never heard of.
    var badgeKey: L10nKey? {
        switch self {
        case .recruitment: return .composerRecruitment
        case .article: return .composerArticle
        case .post, .unknown: return nil
        }
    }

    var badgeSymbol: String? {
        switch self {
        case .recruitment: return "briefcase"
        case .article: return "doc.text"
        case .post, .unknown: return nil
        }
    }
}

/// A ZRP post.
///
/// The union of what the two feed routes return. `GET /api/posts?tab=following`
/// selects a wider set than `GET /api/posts/explore` (link previews, poll
/// state, recruitment/article fields), so anything not present in *both*
/// is optional here. Decoding a feed page must never fail because the
/// other feed happened to include a field.
struct Post: Decodable, Identifiable, Equatable, Hashable {
    let id: String
    let content: String
    let createdAt: Date
    let author: PostAuthor
    let counts: PostCounts

    let imageUrl: String?
    let imageUrls: [String]?
    let mediaType: String?
    let views: Int?
    let quotePost: QuotedPost?

    /// Whether the signed-in viewer has liked this post. Both feed routes
    /// attach it per page, but only when there is a session - `nil` means
    /// "not signed in", not "not liked".
    let liked: Bool?

    /// Following-feed-only fields. Absent from explore.
    let commentsEnabled: Bool?
    let linkUrl: String?

    /// The attached poll, when the post has one AND the route selected
    /// it. The following feed and the single-post route do; the explore
    /// feed does not select polls at all, so a poll post arrives there
    /// with this `nil` - which is a backend gap, not a post without a
    /// poll. Recorded in PARITY.md.
    let poll: Poll?

    /// What kind of post this is.
    ///
    /// One `Post` model carries three shapes on the backend, each with
    /// extra columns of its own, and every feed route selects all of
    /// them. This app decoded none of it, so a job listing and an
    /// article both arrived as a plain text post and everything that
    /// made them one or the other was dropped on the floor.
    let type: PostType?

    /// Recruitment fields. Non-nil only on a `RECRUITMENT` post: the
    /// create route explicitly writes `null` for all three on any other
    /// type, so their presence is the post's own claim, not a guess.
    let company: String?
    let location: String?
    let applyUrl: String?

    /// An article's body. `content` holds the headline and teaser that
    /// go in the timeline; this holds the piece itself.
    let body: String?

    private enum CodingKeys: String, CodingKey {
        case id, content, createdAt, author, imageUrl, imageUrls, mediaType
        case views, quotePost, liked, commentsEnabled, linkUrl, poll
        case type, company, location, applyUrl, body
        case counts = "_count"
    }

    /// Every image this post carries, in display order.
    ///
    /// Prefers the `imageUrls` array when the post has one and falls back
    /// to the legacy singular `imageUrl`. This ordering matters: a
    /// multi-image post has both fields populated, with `imageUrl` holding
    /// only the first image, so reading `imageUrl` first would silently
    /// render a gallery as a single picture.
    var galleryImageURLs: [String] {
        if let imageUrls, !imageUrls.isEmpty { return imageUrls }
        if let imageUrl, !imageUrl.isEmpty { return [imageUrl] }
        return []
    }
}

/// `{posts, nextCursor}` - the envelope both feed routes use.
///
/// Note that this is *not* the envelope the profile routes use: they
/// answer `{items, nextCursor}`. Modelling them with one type is a real
/// bug the Android app hit and documented; they stay separate here.
struct PostsPage: Decodable {
    let posts: [Post]
    let nextCursor: String?
}

/// `{items, nextCursor}` - profile posts, quotes, and other list routes.
struct PostItemsPage: Decodable {
    let items: [Post]?
    let nextCursor: String?
}

// MARK: - Interaction responses

struct LikeResponse: Decodable { let liked: Bool }
struct RepostResponse: Decodable { let reposted: Bool }
struct BookmarkResponse: Decodable { let bookmarked: Bool }
