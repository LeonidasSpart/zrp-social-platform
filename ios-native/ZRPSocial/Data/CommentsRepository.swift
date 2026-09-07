import Foundation

protocol CommentsRepositoryProtocol: Sendable {
    func comments(postId: String, cursor: String?) async throws -> CommentsPage
    func create(postId: String, content: String, parentId: String?) async throws -> Comment
    func edit(commentId: String, content: String) async throws -> Comment
    func delete(commentId: String) async throws
    func toggleLike(commentId: String) async throws -> Bool
}

struct CommentsRepository: CommentsRepositoryProtocol {

    private let client: ApiClient

    init(client: ApiClient = .shared) {
        self.client = client
    }

    private struct CreateRequest: Encodable {
        let content: String
        let parentId: String?
    }

    private struct EditRequest: Encodable {
        let content: String
    }

    /// Returns an empty page - not an error - when the post has comments
    /// disabled, or when its author is private and the viewer is not an
    /// approved follower. The caller distinguishes those from a post that
    /// simply has no comments yet via the post's own `commentsEnabled`.
    func comments(postId: String, cursor: String?) async throws -> CommentsPage {
        try await client.send(
            Endpoint.get("posts/\(postId)/comments", query: [("cursor", cursor)])
        )
    }

    /// Answers 201 with the bare created comment - no envelope, and no
    /// `replies` key, since a new comment has none.
    ///
    /// Length is validated server-side against the commenter's own plan,
    /// so an over-length comment comes back as a 400 carrying the plan's
    /// real message rather than a generic failure.
    func create(postId: String, content: String, parentId: String?) async throws -> Comment {
        try await client.send(
            try Endpoint.post(
                "posts/\(postId)/comments",
                body: CreateRequest(content: content, parentId: parentId)
            )
        )
    }

    /// Author-only, enforced server-side with a 403.
    func edit(commentId: String, content: String) async throws -> Comment {
        try await client.send(
            try Endpoint.put("comments/\(commentId)", body: EditRequest(content: content))
        )
    }

    func delete(commentId: String) async throws {
        try await client.sendIgnoringResponse(Endpoint.delete("comments/\(commentId)"))
    }

    func toggleLike(commentId: String) async throws -> Bool {
        let response: LikeResponse = try await client.send(
            Endpoint.post("comments/\(commentId)/like")
        )
        return response.liked
    }
}
