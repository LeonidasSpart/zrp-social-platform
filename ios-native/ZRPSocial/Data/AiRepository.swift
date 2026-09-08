import Foundation

/// One turn in a ZRP AI conversation, as `POST /api/ai/chat` returns it.
struct AiMessage: Decodable, Identifiable, Equatable {
    let id: String
    /// `user` or `assistant`.
    let role: String
    let content: String

    var isAssistant: Bool { role.lowercased() != "user" }
}

/// What one answer carries besides the answer itself.
struct AiChatReply: Decodable, Equatable {
    let message: AiMessage
    let conversationId: String
    /// How many messages the viewer has left today on their plan. The
    /// server decides this; the client only displays it.
    let remaining: Int?
}

protocol AiRepositoryProtocol: Sendable {
    func send(message: String, conversationId: String?) async throws -> AiChatReply
}

struct AiRepository: AiRepositoryProtocol {

    private let client: ApiClient

    init(client: ApiClient = .shared) {
        self.client = client
    }

    private struct Request: Encodable {
        let message: String
        let conversationId: String?
        /// The route supports both a streamed and a buffered reply, and
        /// this asks for the buffered one - the same choice Android's
        /// `AiApi` documents and for the same reason. The streaming path
        /// is Server-Sent Events, and nothing in this app has ever needed
        /// an SSE reader. The rate limiting, the persistence and the
        /// conversation are identical on both branches; the only
        /// difference is whether the answer appears word by word or all
        /// at once after a loading state.
        let stream = false
    }

    /// `POST /api/ai/chat`.
    ///
    /// Daily limits are per plan and enforced server-side; hitting one is
    /// a 429 whose message the server writes, and which is shown verbatim
    /// rather than reworded here.
    func send(message: String, conversationId: String?) async throws -> AiChatReply {
        try await client.send(
            try Endpoint.post(
                "ai/chat",
                body: Request(
                    message: message.trimmingCharacters(in: .whitespacesAndNewlines),
                    conversationId: conversationId
                )
            )
        )
    }
}
