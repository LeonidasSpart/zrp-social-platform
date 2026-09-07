import Foundation

/// `GET /api/creator/studio` - the analytics half of Creator Studio.
///
/// **The earnings half is deliberately absent from this app.** The web
/// dashboard has three tabs: Overview (balance, tips, premium revenue,
/// withdrawals), Content and Audience. Overview is a monetisation
/// surface and is excluded on iOS for the same store-policy reason as
/// every other payment route - see PARITY.md. Content and Audience are
/// content statistics with no money in them, and they are what this
/// models.
///
/// Every figure here is the server's own. Nothing is recomputed from
/// the feed, and nothing is estimated: the route counts likes, comments,
/// reposts and follows from the database directly.
struct CreatorStudio: Decodable {
    let content: CreatorContentPerformance
    let audience: CreatorAudienceGrowth
}

struct CreatorContentPerformance: Decodable {
    let topPosts: [CreatorTopPost]
    let engagementTrend: [CreatorEngagementDay]
    let totals: CreatorContentTotals
}

struct CreatorContentTotals: Decodable {
    let views: Int
    let likes: Int
    let comments: Int
    let reposts: Int
    let postCount: Int
}

/// One of the five best-performing posts.
///
/// The route ranks by its own score - `likes + comments*2 + reposts*3` -
/// and sends the score with each row. The order is taken as given
/// rather than re-sorted here: re-deriving it would mean writing that
/// weighting down a second time, and the two would drift the moment
/// either changed.
struct CreatorTopPost: Decodable, Identifiable {
    let id: String
    let content: String
    let imageUrl: String?
    let createdAt: Date
    let views: Int
    let counts: PostEngagementCounts

    private enum CodingKeys: String, CodingKey {
        case id, content, imageUrl, createdAt, views
        case counts = "_count"
    }

    init(from decoder: Decoder) throws {
        let container = try decoder.container(keyedBy: CodingKeys.self)
        id = try container.decode(String.self, forKey: .id)
        content = try container.decodeIfPresent(String.self, forKey: .content) ?? ""
        imageUrl = try container.decodeIfPresent(String.self, forKey: .imageUrl)
        createdAt = try container.decode(Date.self, forKey: .createdAt)
        views = try container.decodeIfPresent(Int.self, forKey: .views) ?? 0
        counts = try container.decode(PostEngagementCounts.self, forKey: .counts)
    }
}

/// Prisma's `_count` block, verbatim.
struct PostEngagementCounts: Decodable {
    let likes: Int
    let comments: Int
    let reposts: Int
}

/// One day of the 30-day engagement window.
///
/// `date` is the route's own `YYYY-MM-DD` day key, kept as a string
/// rather than parsed into a `Date`. It is produced from
/// `toISOString().slice(0, 10)` - a **UTC** day boundary - so turning it
/// into a local `Date` and formatting it back would silently shift a
/// day for anyone west of UTC, and the axis labels would disagree with
/// the server's own buckets.
struct CreatorEngagementDay: Decodable, Identifiable {
    let date: String
    let likes: Int
    let comments: Int
    let reposts: Int
    let total: Int

    var id: String { date }
}

struct CreatorAudienceGrowth: Decodable {
    let totalFollowers: Int
    let newFollowersInWindow: Int
    let trend: [CreatorAudienceDay]
}

/// One day of follower history.
///
/// `totalFollowers` is reconstructed server-side by working backwards
/// from today's count, which - as the route's own comment says - does
/// not subtract unfollows inside the window. That is the server's
/// approximation and it is displayed as sent; re-deriving it here would
/// not make it more accurate, only differently wrong.
struct CreatorAudienceDay: Decodable, Identifiable {
    let date: String
    let newFollowers: Int
    let totalFollowers: Int

    var id: String { date }
}
