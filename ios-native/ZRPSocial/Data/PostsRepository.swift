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

    /// A poll to create alongside the post.
    ///
    /// The route creates one only when `options.length > 1`; it does no
    /// plan check of its own. `isPoll` rides along beside it because the
    /// website sends both, and sending only half of a pair the server
    /// reads is how the two clients drift.
    var poll: NewPoll?
    var isPoll: Bool { poll != nil }

    /// When to publish, as a NAIVE wall-clock string (`yyyy-MM-dd'T'HH:mm`)
    /// with no timezone - byte for byte what a browser's
    /// `<input type="datetime-local">` submits, which is what the route
    /// is written against.
    ///
    /// Sending a proper ISO-8601 instant with an offset would be more
    /// correct in isolation and WRONG here: the route hands the string
    /// to `new Date(...)`, which reads an offset when one is present and
    /// otherwise falls back to the server's own zone. Two clients
    /// sending two formats would schedule the same wall-clock time to
    /// two different instants. See the timezone note in PARITY.md.
    var scheduledAt: String?

    struct NewPoll: Encodable, Equatable {
        let question: String
        let options: [String]

        /// When the poll closes, as the same NAIVE wall-clock string
        /// `scheduledAt` uses - the website's poll end date is a
        /// `<input type="datetime-local">` too, so this is byte for byte
        /// what the route is written against.
        ///
        /// **Not a `Date`.** `JSONEncoder`'s default strategy is
        /// `.deferredToDate`, which writes a bare number of seconds
        /// since 2001; the route hands whatever arrives to
        /// `new Date(...)`, which reads a number as MILLISECONDS SINCE
        /// 1970. A poll ending next week would have been created having
        /// expired in January 1970 - closed before anyone could vote,
        /// and looking like a server bug rather than an encoding one.
        ///
        /// Omitted entirely for a poll that never closes, which is what
        /// the website sends when no end date is chosen.
        let expiresAt: String?
    }

    private enum CodingKeys: String, CodingKey {
        case content, imageUrls, mediaType, quotePostId, poll, isPoll, scheduledAt
    }

    func encode(to encoder: Encoder) throws {
        var container = encoder.container(keyedBy: CodingKeys.self)
        try container.encode(content, forKey: .content)
        try container.encodeIfPresent(imageUrls, forKey: .imageUrls)
        try container.encodeIfPresent(mediaType, forKey: .mediaType)
        try container.encodeIfPresent(quotePostId, forKey: .quotePostId)
        try container.encodeIfPresent(poll, forKey: .poll)
        try container.encode(isPoll, forKey: .isPoll)
        try container.encodeIfPresent(scheduledAt, forKey: .scheduledAt)
    }
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
    func reactions(postId: String) async throws -> [PostReaction]
    func toggleReaction(postId: String, emoji: String) async throws -> Bool
    func quotes(postId: String, cursor: String?) async throws -> PostsPage
    func togglePin(postId: String) async throws -> Bool
    func countView(postId: String) async throws -> Int?
    func votePoll(pollId: String, optionIndex: Int) async throws
}

/// One emoji reaction on a post, from `GET /api/posts/{id}/reaction`.
///
/// The route returns every reaction row rather than a tally, so the
/// grouping and counting happen client-side - which is also what lets the
/// app know which of them are the viewer's own.
struct PostReaction: Decodable, Identifiable, Equatable {
    let id: String
    let emoji: String
    let userId: String

    init(from decoder: Decoder) throws {
        let container = try decoder.container(keyedBy: CodingKeys.self)
        id = try container.decode(String.self, forKey: .id)
        emoji = try container.decodeIfPresent(String.self, forKey: .emoji) ?? ""
        userId = try container.decodeIfPresent(String.self, forKey: .userId) ?? ""
    }

    private enum CodingKeys: String, CodingKey {
        case id, emoji, userId
    }
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

    // MARK: - Reactions

    func reactions(postId: String) async throws -> [PostReaction] {
        try await client.send(Endpoint.get("posts/\(Endpoint.segment(postId))/reaction"))
    }

    /// Toggles **one** emoji for the viewer, and reports whether it is
    /// now on.
    ///
    /// The route keys on (post, user, emoji), so this is not "one
    /// reaction per person": someone can hold several different emoji on
    /// the same post at once, and tapping one only ever affects that one.
    func toggleReaction(postId: String, emoji: String) async throws -> Bool {
        struct Request: Encodable { let emoji: String }
        struct Response: Decodable {
            let reaction: PostReaction?
        }
        let response: Response = try await client.send(
            try Endpoint.post(
                "posts/\(Endpoint.segment(postId))/reaction",
                body: Request(emoji: emoji)
            )
        )
        // `{reaction: null}` means it was removed.
        return response.reaction != nil
    }

    // MARK: - Pin

    /// `POST /api/posts/{id}/pin` toggles the author's single pinned
    /// post and answers `{pinned}`.
    ///
    /// One pin per ACCOUNT, not per post: pinning a second post replaces
    /// the first server-side, silently. Author-only, refused with a 403
    /// for anyone else.
    func togglePin(postId: String) async throws -> Bool {
        struct Response: Decodable { let pinned: Bool }
        let response: Response = try await client.send(
            Endpoint.post("posts/\(Endpoint.segment(postId))/pin")
        )
        return response.pinned
    }

    // MARK: - Polls

    /// `POST /api/polls/{id}/vote`.
    ///
    /// One vote per person, permanently: a second attempt is refused
    /// with a 400 "Already voted", as is a vote on a poll past its
    /// `expiresAt` ("Poll has ended"). It answers `{success: true}` and
    /// nothing else - no updated tally - so the caller applies the +1 the
    /// route just made rather than reading counts back.
    func votePoll(pollId: String, optionIndex: Int) async throws {
        struct Request: Encodable { let optionIndex: Int }
        try await client.sendIgnoringResponse(
            try Endpoint.post(
                "polls/\(Endpoint.segment(pollId))/vote",
                body: Request(optionIndex: optionIndex)
            )
        )
    }

    // MARK: - Views

    /// `POST /api/posts/{id}/view` increments the tally and answers the
    /// new total.
    ///
    /// No session required, and no server-side dedupe: every call
    /// increments. It answers `{views: null}` with a **200** for a post
    /// that no longer exists rather than a 404, which is why the return
    /// is optional - `nil` means "counted nothing", not "failed".
    func countView(postId: String) async throws -> Int? {
        struct Response: Decodable { let views: Int? }
        let response: Response = try await client.send(
            Endpoint.post("posts/\(Endpoint.segment(postId))/view")
        )
        return response.views
    }

    // MARK: - Quotes

    /// The posts quoting this one.
    ///
    /// `GET /api/posts/{id}/quotes` answers `{items, nextCursor}` - the
    /// third envelope shape in the app - so the items are lifted into the
    /// same `PostsPage` every other timeline uses.
    ///
    /// The rows carry `author`, `_count` and the viewer's `liked`. Like
    /// every other list route they say nothing about repost or bookmark
    /// state, which is exactly why `PostInteractionStore` keeps those two
    /// flags locally across pages.
    func quotes(postId: String, cursor: String?) async throws -> PostsPage {
        struct Page: Decodable {
            let items: [Post]?
            let nextCursor: String?
        }
        let page: Page = try await client.send(
            Endpoint.get(
                "posts/\(Endpoint.segment(postId))/quotes",
                query: [("cursor", cursor)]
            )
        )
        return PostsPage(posts: page.items ?? [], nextCursor: page.nextCursor)
    }
}
