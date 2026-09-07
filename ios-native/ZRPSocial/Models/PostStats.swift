import Foundation

/// `GET /api/user/posts/stats`.
///
/// The route takes the **20 newest** posts and sums over exactly those,
/// so `totals` is not a lifetime figure. Naming it here as what it is -
/// rather than "total views" - is the difference between a number
/// someone can act on and one that quietly misleads.
struct PostStats: Decodable, Equatable {
    let posts: [PostStatsRow]
    let totals: PostStatsTotals

    init(from decoder: Decoder) throws {
        let container = try decoder.container(keyedBy: CodingKeys.self)
        posts = try container.decodeIfPresent([PostStatsRow].self, forKey: .posts) ?? []
        totals = try container.decode(PostStatsTotals.self, forKey: .totals)
    }

    private enum CodingKeys: String, CodingKey {
        case posts
        case totals = "totalStats"
    }
}

struct PostStatsRow: Decodable, Identifiable, Equatable {
    let id: String
    let content: String
    let createdAt: Date
    let views: Int
    let counts: PostStatsCounts

    init(from decoder: Decoder) throws {
        let container = try decoder.container(keyedBy: CodingKeys.self)
        id = try container.decode(String.self, forKey: .id)
        content = try container.decodeIfPresent(String.self, forKey: .content) ?? ""
        createdAt = try container.decode(Date.self, forKey: .createdAt)
        views = try container.decodeIfPresent(Int.self, forKey: .views) ?? 0
        counts = try container.decode(PostStatsCounts.self, forKey: .counts)
    }

    private enum CodingKeys: String, CodingKey {
        case id, content, createdAt, views
        case counts = "_count"
    }
}

struct PostStatsCounts: Decodable, Equatable {
    let likes: Int
    let comments: Int
    let reposts: Int

    init(from decoder: Decoder) throws {
        let container = try decoder.container(keyedBy: CodingKeys.self)
        likes = try container.decodeIfPresent(Int.self, forKey: .likes) ?? 0
        comments = try container.decodeIfPresent(Int.self, forKey: .comments) ?? 0
        reposts = try container.decodeIfPresent(Int.self, forKey: .reposts) ?? 0
    }

    private enum CodingKeys: String, CodingKey {
        case likes, comments, reposts
    }
}

struct PostStatsTotals: Decodable, Equatable {
    let views: Int
    let likes: Int
    let comments: Int
    let reposts: Int

    init(from decoder: Decoder) throws {
        let container = try decoder.container(keyedBy: CodingKeys.self)
        views = try container.decodeIfPresent(Int.self, forKey: .views) ?? 0
        likes = try container.decodeIfPresent(Int.self, forKey: .likes) ?? 0
        comments = try container.decodeIfPresent(Int.self, forKey: .comments) ?? 0
        reposts = try container.decodeIfPresent(Int.self, forKey: .reposts) ?? 0
    }

    private enum CodingKeys: String, CodingKey {
        case views = "totalViews"
        case likes = "totalLikes"
        case comments = "totalComments"
        case reposts = "totalReposts"
    }
}
