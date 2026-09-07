import Foundation

/// A comment or a reply.
///
/// `GET /api/posts/{id}/comments` pages by **top-level thread**, then
/// walks the whole reply subtree of each thread on that page - so a
/// comment arrives with its complete nested `replies`, however deep,
/// while the page itself is bounded by thread count rather than by total
/// comments. That is why `replies` is a real recursive array here rather
/// than a flat list the client would have to re-assemble.
///
/// A struct containing an array of itself is legal in Swift: the array's
/// storage is a separate heap buffer, so the type has a finite size. Only
/// a direct, non-optional self-reference would be impossible.
struct Comment: Decodable, Identifiable, Equatable {

    let id: String

    /// `var` only so an edit can be applied to the loaded tree without
    /// refetching the whole thread - see `withContent(_:)`.
    var content: String

    let createdAt: Date
    let parentId: String?
    let author: PostAuthor
    let counts: CommentCounts

    /// `var` for the same reason as `content`: posting a reply or
    /// deleting one rewrites this subtree locally rather than refetching
    /// a whole page of threads.
    var replies: [Comment]

    /// Present only when there is a signed-in viewer. Unlike the feed
    /// routes, this one *does* report all three per-viewer flags, so
    /// `nil` here means "signed out", never "unknown".
    let liked: Bool?
    let reposted: Bool?
    let bookmarked: Bool?

    private enum CodingKeys: String, CodingKey {
        case id, content, createdAt, parentId, author, replies
        case liked, reposted, bookmarked
        case counts = "_count"
    }

    init(from decoder: Decoder) throws {
        let container = try decoder.container(keyedBy: CodingKeys.self)
        id = try container.decode(String.self, forKey: .id)
        content = try container.decode(String.self, forKey: .content)
        createdAt = try container.decode(Date.self, forKey: .createdAt)
        parentId = try container.decodeIfPresent(String.self, forKey: .parentId)
        author = try container.decode(PostAuthor.self, forKey: .author)
        counts = try container.decode(CommentCounts.self, forKey: .counts)
        // The create and edit routes return a bare comment with no
        // `replies` key at all - a fresh comment has none. Defaulting
        // here rather than making the property optional keeps every
        // consumer from unwrapping something that is conceptually just
        // an empty list.
        replies = try container.decodeIfPresent([Comment].self, forKey: .replies) ?? []
        liked = try container.decodeIfPresent(Bool.self, forKey: .liked)
        reposted = try container.decodeIfPresent(Bool.self, forKey: .reposted)
        bookmarked = try container.decodeIfPresent(Bool.self, forKey: .bookmarked)
    }

    /// A copy of this comment with different replies. The tree is
    /// rebuilt by value, so an edit deep inside it cannot accidentally
    /// alias shared state.
    func withReplies(_ newReplies: [Comment]) -> Comment {
        var copy = self
        copy.replies = newReplies
        return copy
    }

    /// A copy of this comment with new text, for applying an edit the
    /// server has already accepted.
    func withContent(_ newContent: String) -> Comment {
        var copy = self
        copy.content = newContent
        return copy
    }

    /// Every comment in this subtree, depth-first, parents before their
    /// own replies - the order they are displayed in.
    var flattened: [(comment: Comment, depth: Int)] {
        flatten(depth: 0)
    }

    private func flatten(depth: Int) -> [(comment: Comment, depth: Int)] {
        [(self, depth)] + replies.flatMap { $0.flatten(depth: depth + 1) }
    }
}

/// A comment's own `_count`. Note it counts `bookmarks`, where a post's
/// counts `comments` and `quotedBy` - they are genuinely different
/// aggregates, not one shape reused.
struct CommentCounts: Decodable, Equatable {
    let likes: Int
    let reposts: Int
    let bookmarks: Int

    init(from decoder: Decoder) throws {
        let container = try decoder.container(keyedBy: CodingKeys.self)
        likes = try container.decodeIfPresent(Int.self, forKey: .likes) ?? 0
        reposts = try container.decodeIfPresent(Int.self, forKey: .reposts) ?? 0
        bookmarks = try container.decodeIfPresent(Int.self, forKey: .bookmarks) ?? 0
    }

    private enum CodingKeys: String, CodingKey {
        case likes, reposts, bookmarks
    }
}

/// `{comments, nextCursor}` - a third distinct envelope, alongside the
/// feeds' `{posts, …}` and the profile routes' `{items, …}`.
struct CommentsPage: Decodable {
    let comments: [Comment]
    let nextCursor: String?
}
