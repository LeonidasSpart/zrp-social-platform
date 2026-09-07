import Foundation

protocol MessagesRepositoryProtocol: Sendable {
    func conversations() async throws -> [ConversationSummary]
    func thread(with userId: String) async throws -> [Message]
    func send(to userId: String, content: String, replyToId: String?) async throws -> Message
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

    /// The whole thread, oldest first.
    ///
    /// **This route is not paginated.** It returns every message ever
    /// exchanged with that user - there is no cursor, limit or `take` on
    /// the query. The UI reflects that rather than showing a "load more"
    /// with nothing to load; see PARITY.md, which records it as a real
    /// backend limitation rather than something the client can fix.
    ///
    /// Fetching also has a side effect: the route marks the other
    /// party's unread messages read. So calling this *is* the read
    /// receipt - there is no separate endpoint to call.
    func thread(with userId: String) async throws -> [Message] {
        try await client.send(Endpoint.get("messages/\(userId)"))
    }

    /// Answers 201 with the created message, sender and replyTo included.
    ///
    /// A 403 here is a real product rule, not a bug - the route refuses
    /// messages the recipient's privacy settings or a block disallow, and
    /// its message is shown verbatim.
    func send(to userId: String, content: String, replyToId: String?) async throws -> Message {
        try await client.send(
            try Endpoint.post(
                "messages",
                body: SendRequest(receiverId: userId, content: content, replyToId: replyToId)
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
