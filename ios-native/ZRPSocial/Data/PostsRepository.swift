import Foundation

/// Which timeline the Home feed is showing.
///
/// These are two genuinely different backend routes with different
/// ranking, different cursors, and slightly different response fields -
/// not one endpoint with a filter. See each case's own note.
enum FeedTab: String, CaseIterable, Identifiable {

    /// `GET /api/posts/explore` - engagement-over-age ranked, and paged by
    /// a **numeric offset** into a server-cached ranked list, because a
    /// score-ordered list is not something a database cursor can walk.
    case forYou

    /// `GET /api/posts?tab=following` - a real follow-graph filter, paged
    /// by **post id** cursor.
    case following

    var id: String { rawValue }

    var titleKey: L10nKey {
        switch self {
        case .forYou: return .feedForYou
        case .following: return .feedFollowing
        }
    }
}

protocol PostsRepositoryProtocol: Sendable {
    func feed(_ tab: FeedTab, cursor: String?) async throws -> PostsPage
    func post(id: String) async throws -> Post
    func toggleLike(postId: String) async throws -> Bool
    func toggleRepost(postId: String) async throws -> Bool
    func toggleBookmark(postId: String) async throws -> Bool
    func deletePost(id: String) async throws
}

struct PostsRepository: PostsRepositoryProtocol {

    private let client: ApiClient

    init(client: ApiClient = .shared) {
        self.client = client
    }

    /// Both feeds answer with the same `{posts, nextCursor}` envelope even
    /// though they page differently, so the tab choice is entirely
    /// contained here - the ViewModel just passes the cursor it was last
    /// given back in.
    func feed(_ tab: FeedTab, cursor: String?) async throws -> PostsPage {
        switch tab {
        case .forYou:
            return try await client.send(
                Endpoint.get("posts/explore", query: [("cursor", cursor)])
            )
        case .following:
            return try await client.send(
                Endpoint.get("posts", query: [("tab", "following"), ("cursor", cursor)])
            )
        }
    }

    /// `GET /api/posts/{id}` returns the raw post object - no `{post: ...}`
    /// envelope, unlike the create route.
    func post(id: String) async throws -> Post {
        try await client.send(Endpoint.get("posts/\(id)"))
    }

    /// Each of these routes toggles server-side and answers with the
    /// resulting state, which is what the caller applies. The client never
    /// assumes the new value - a double tap that races itself still ends
    /// up showing whatever the server actually settled on.
    func toggleLike(postId: String) async throws -> Bool {
        let response: LikeResponse = try await client.send(
            Endpoint.post("posts/\(postId)/like")
        )
        return response.liked
    }

    func toggleRepost(postId: String) async throws -> Bool {
        let response: RepostResponse = try await client.send(
            Endpoint.post("posts/\(postId)/repost")
        )
        return response.reposted
    }

    func toggleBookmark(postId: String) async throws -> Bool {
        let response: BookmarkResponse = try await client.send(
            Endpoint.post("posts/\(postId)/bookmark")
        )
        return response.bookmarked
    }

    /// Only a post's own author may delete it, enforced server-side with a
    /// 403 rather than merely hidden in the UI - so exposing this from any
    /// post is safe; the backend is the real gate.
    func deletePost(id: String) async throws {
        try await client.sendIgnoringResponse(Endpoint.delete("posts/\(id)"))
    }
}
