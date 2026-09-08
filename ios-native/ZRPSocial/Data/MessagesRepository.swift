import Foundation

protocol MessagesRepositoryProtocol: Sendable {
    func conversations() async throws -> [ConversationSummary]
    func thread(
        with userId: String,
        before cursor: String?,
        limit: Int
    ) async throws -> MessageThreadPage
    func send(
        to userId: String,
        content: String,
        imageUrl: String?,
        replyToId: String?
    ) async throws -> Message
    func edit(messageId: String, content: String) async throws -> Message
    func delete(messageId: String) async throws
    func react(messageId: String, emoji: String) async throws -> [MessageReaction]
    func deleteConversation(with userId: String) async throws
    func unreadCount() async throws -> Int
}

struct MessagesRepository: MessagesRepositoryProtocol {

    private let client: ApiClient

    init(client: ApiClient = .shared) {
        self.client = client
    }

    private struct SendRequest: Encodable {
        let receiverId: String
        let content: String
        let imageUrl: String?
        let replyToId: String?
    }

    private struct EditRequest: Encodable {
        let content: String
    }

    private struct ReactionRequest: Encodable {
        let emoji: String
    }

    /// A bare array of `{partner, lastMessage, unreadCount}`, newest
    /// conversation first.
    func conversations() async throws -> [ConversationSummary] {
        try await client.send(Endpoint.get("messages"))
    }

    /// One page of a thread, oldest first.
    ///
    /// **Always sends `limit`,** and that is deliberate rather than
    /// incidental: the route only answers the `{items, nextCursor}`
    /// envelope when a request asks for a page. A request with neither
    /// `cursor` nor `limit` gets a bare array of the most recent
    /// messages and no cursor at all - correct for the website and the
    /// shipped Android app, which have no "load older" control, but it
    /// would leave this client unable to reach history beyond the first
    /// page. Asking for a page is what makes the rest of the
    /// conversation addressable.
    ///
    /// `cursor` is the id of the oldest message already held; the route
    /// returns the ones before it. `limit` is clamped server-side to
    /// 100, so asking for more is not an error, just not honoured.
    ///
    /// Fetching also has a side effect: the route marks the other
    /// party's unread messages read, for the whole conversation and not
    /// merely the page requested. So calling this *is* the read
    /// receipt - there is no separate endpoint to call.
    func thread(
        with userId: String,
        before cursor: String?,
        limit: Int
    ) async throws -> MessageThreadPage {
        try await client.send(
            Endpoint.get(
                "messages/\(userId)",
                query: [("limit", String(limit)), ("cursor", cursor)]
            )
        )
    }

    /// Answers 201 with the created message, sender and replyTo included.
    ///
    /// A 403 here is a real product rule, not a bug - the route refuses
    /// messages the recipient's privacy settings or a block disallow, and
    /// its message is shown verbatim.
    /// The route accepts an empty `content` **only** when there is an
    /// `imageUrl`, and refuses both-empty with a 400 - which is why the
    /// caller must not treat a picture as optional decoration on text.
    func send(
        to userId: String,
        content: String,
        imageUrl: String?,
        replyToId: String?
    ) async throws -> Message {
        try await client.send(
            try Endpoint.post(
                "messages",
                body: SendRequest(
                    receiverId: userId,
                    content: content,
                    imageUrl: imageUrl,
                    replyToId: replyToId
                )
            )
        )
    }

    /// Sender-only, enforced server-side with a 403. Sets `edited` on the
    /// row, which is what the "Edited" marker reads.
    func edit(messageId: String, content: String) async throws -> Message {
        try await client.send(
            try Endpoint.put("messages/edit/\(messageId)", body: EditRequest(content: content))
        )
    }

    func delete(messageId: String) async throws {
        try await client.sendIgnoringResponse(Endpoint.delete("messages/delete/\(messageId)"))
    }

    /// One reaction per person per message: the same emoji removes it, a
    /// different one replaces it. The route returns the message's full
    /// reaction list afterwards, so that is applied verbatim rather than
    /// the client guessing the new set.
    func react(messageId: String, emoji: String) async throws -> [MessageReaction] {
        let response: MessageReactionResponse = try await client.send(
            try Endpoint.post("messages/reaction/\(messageId)", body: ReactionRequest(emoji: emoji))
        )
        return response.reactions
    }

    /// Deletes the entire conversation for both directions.
    func deleteConversation(with userId: String) async throws {
        try await client.sendIgnoringResponse(
            Endpoint.delete("messages/conversation/\(userId)")
        )
    }

    func unreadCount() async throws -> Int {
        let response: UnreadCountResponse = try await client.send(
            Endpoint.get("messages/unread")
        )
        return response.count
    }
}
