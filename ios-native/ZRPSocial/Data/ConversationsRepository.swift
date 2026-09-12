import Foundation

protocol ConversationsRepositoryProtocol: Sendable {
    func groups() async throws -> [GroupConversation]
    func detail(id: String) async throws -> GroupConversationDetail
    func messages(id: String, before cursor: String?, limit: Int) async throws -> GroupMessagesPage
    func send(id: String, content: String, imageUrl: String?) async throws -> GroupMessage
    func create(name: String, participantIds: [String], avatarUrl: String?) async throws -> String
    func leave(id: String, userId: String) async throws
}

struct ConversationsRepository: ConversationsRepositoryProtocol {

    private let client: ApiClient

    init(client: ApiClient = .shared) {
        self.client = client
    }

    /// `GET /api/conversations` - the viewer's groups, each with its
    /// member count, last message and unread count.
    ///
    /// Groups only. Direct threads come from `GET /api/messages`, which
    /// filters on `conversationId IS NULL` and will never include these.
    /// The inbox asks for both and merges them.
    func groups() async throws -> [GroupConversation] {
        try await client.send(Endpoint.get("conversations"))
    }

    /// `GET /api/conversations/{id}` - the group and its participants.
    ///
    /// 404 for a non-member, deliberately: the route will not confirm
    /// that a group exists to someone who is not in it.
    func detail(id: String) async throws -> GroupConversationDetail {
        try await client.send(Endpoint.get("conversations/\(Endpoint.segment(id))"))
    }

    /// One page of the thread, oldest first.
    ///
    /// **Fetching also marks the thread read** - the route advances this
    /// member's `lastReadAt`. So calling this IS the read receipt, and
    /// it is what makes the Messages badge fall, exactly as the 1:1
    /// route behaves.
    func messages(id: String, before cursor: String?, limit: Int) async throws -> GroupMessagesPage {
        try await client.send(
            Endpoint.get(
                "conversations/\(Endpoint.segment(id))/messages",
                query: [("limit", String(limit)), ("cursor", cursor)]
            )
        )
    }

    private struct SendRequest: Encodable {
        let content: String
        let imageUrl: String?
    }

    /// The route refuses a message that is empty with no attachment
    /// (400), one over the length cap (400), and any `imageUrl` that did
    /// not come from ZRP's own upload storage (400) - the same media
    /// allowlist the post routes use. The composer mirrors the first
    /// rule; the other two are the server's to enforce and its wording
    /// is shown as written.
    func send(id: String, content: String, imageUrl: String?) async throws -> GroupMessage {
        try await client.send(
            try Endpoint.post(
                "conversations/\(Endpoint.segment(id))/messages",
                body: SendRequest(content: content, imageUrl: imageUrl)
            )
        )
    }

    private struct CreateRequest: Encodable {
        let name: String
        let participantIds: [String]
        let avatarUrl: String?
    }

    /// `POST /api/conversations`. Answers with the created group.
    ///
    /// Every rule here is the route's and is enforced there: a name is
    /// required, there is a member cap, users must exist, and a user who
    /// has blocked you (or whom you have blocked) cannot be added. Each
    /// refusal has its own message and is surfaced as written rather
    /// than flattened into one generic failure.
    func create(name: String, participantIds: [String], avatarUrl: String?) async throws -> String {
        struct Response: Decodable {
            let id: String
        }
        let response: Response = try await client.send(
            try Endpoint.post(
                "conversations",
                body: CreateRequest(
                    name: name.trimmingCharacters(in: .whitespacesAndNewlines),
                    participantIds: participantIds,
                    avatarUrl: avatarUrl
                )
            )
        )
        return response.id
    }

    /// `DELETE /api/conversations/{id}/participants/{userId}`.
    ///
    /// One route, two meanings, decided server-side by who is asking:
    /// removing yourself is leaving, and removing somebody else requires
    /// OWNER. The app offers the second only to an owner so the 403 is
    /// not how anyone learns the rule.
    func leave(id: String, userId: String) async throws {
        try await client.sendIgnoringResponse(
            Endpoint.delete(
                "conversations/\(Endpoint.segment(id))/participants/\(Endpoint.segment(userId))"
            )
        )
    }
}
