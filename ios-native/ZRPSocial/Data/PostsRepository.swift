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

/// The body `POST /api/posts` accepts.
///
/// Only the fields the composer actually sends. The route also takes
/// `linkUrl`, `poll`, `type`/`company`/`location`/`applyUrl` for
/// recruitment posts and `articleBody` for articles - none of which the
/// app composes yet, and all of which the server treats as absent rather
/// than empty when omitted.
///
/// `mediaType` is sent as the upload's own classification, but the server
/// re-derives and normalises it regardless (see the route's "Use ONLY the
/// server-normalized media type" comment), so this can never make a video
/// render as an image or vice versa.
struct CreatePostRequest: Encodable {
    let content: String
    let imageUrls: [String]?
    let mediaType: String?
    let quotePostId: String?
}

/// `POST /api/posts` answers 201 with the created post wrapped in an
/// envelope - unlike `GET /posts/{id}`, which returns it bare.
struct CreatePostResponse: Decodable {
    let post: Post
}

protocol PostsRepositoryProtocol: Sendable {
    func feed(_ tab: FeedTab, cursor: String?) async throws -> PostsPage
    func createPost(_ request: CreatePostRequest) async throws -> Post
    func post(id: String) async throws -> Post
    func toggleLike(postId: String) async throws -> Bool
    func toggleRepost(postId: String) async throws -> Bool
    func toggleBookmark(postId: String) async throws -> Bool
    func deletePost(id: String) async throws
    func updatePost(id: String, content: String) async throws -> Post
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

    func createPost(_ request: CreatePostRequest) async throws -> Post {
        let response: CreatePostResponse = try await client.send(
            try Endpoint.post("posts", body: request)
        )
        return response.post
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
    /// Text-only, matching the website's own edit modal exactly - it
    /// never sends `imageUrl` either, and the route only touches that
    /// field when the body explicitly includes it. Omitting it is what
    /// keeps an edited post's existing media intact rather than silently
    /// clearing it.
    ///
    /// Author-only and plan-length-checked server-side, and the route
    /// returns the updated post bare (no envelope).
    func updatePost(id: String, content: String) async throws -> Post {
        struct Body: Encodable { let content: String }
        return try await client.send(
            try Endpoint.put("posts/\(id)", body: Body(content: content))
        )
    }

    func deletePost(id: String) async throws {
        try await client.sendIgnoringResponse(Endpoint.delete("posts/\(id)"))
    }
}
