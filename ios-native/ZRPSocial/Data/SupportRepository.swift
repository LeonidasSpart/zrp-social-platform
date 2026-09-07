import Foundation

protocol SupportRepositoryProtocol: Sendable {
    func tickets() async throws -> [SupportTicket]
    func ticket(id: String) async throws -> SupportTicket
    func createTicket(
        subject: String,
        category: SupportCategory,
        message: String
    ) async throws -> SupportTicket
    func reply(ticketId: String, message: String) async throws
    func deleteTicket(id: String) async throws
}

struct SupportRepository: SupportRepositoryProtocol {

    private let client: ApiClient

    init(client: ApiClient = .shared) {
        self.client = client
    }

    private struct CreateRequest: Encodable {
        let subject: String
        let category: String
        let message: String
    }

    private struct ReplyRequest: Encodable {
        let message: String
    }

    /// `GET /api/support/tickets` - a bare array, newest first, each with
    /// its most recent reply and a reply count. Unpaginated: the route
    /// returns every ticket the viewer has opened.
    func tickets() async throws -> [SupportTicket] {
        try await client.send(Endpoint.get("support/tickets"))
    }

    /// `GET /api/support/tickets/{id}` - the whole thread. Answers 403 for
    /// a ticket the viewer does not own, which is enforced server-side and
    /// not something this client second-guesses.
    func ticket(id: String) async throws -> SupportTicket {
        try await client.send(Endpoint.get("support/tickets/\(Endpoint.segment(id))"))
    }

    /// `POST /api/support/tickets`.
    ///
    /// Priority is decided by the server from the opener's plan and is
    /// deliberately not sent - a client that chose its own would be
    /// asking for a queue position it has no right to.
    func createTicket(
        subject: String,
        category: SupportCategory,
        message: String
    ) async throws -> SupportTicket {
        try await client.send(
            try Endpoint.post(
                "support/tickets",
                body: CreateRequest(
                    subject: subject.trimmingCharacters(in: .whitespacesAndNewlines),
                    category: category.rawValue,
                    message: message.trimmingCharacters(in: .whitespacesAndNewlines)
                )
            )
        )
    }

    /// `POST /api/support/tickets/{id}/reply`. Refused on a resolved or
    /// closed ticket, which is why the composer is not offered for one.
    func reply(ticketId: String, message: String) async throws {
        try await client.sendIgnoringResponse(
            try Endpoint.post(
                "support/tickets/\(Endpoint.segment(ticketId))/reply",
                body: ReplyRequest(
                    message: message.trimmingCharacters(in: .whitespacesAndNewlines)
                )
            )
        )
    }

    /// `DELETE /api/support/tickets/{id}` - allowed only once the ticket
    /// is resolved or closed, enforced server-side.
    func deleteTicket(id: String) async throws {
        try await client.sendIgnoringResponse(
            Endpoint.delete("support/tickets/\(Endpoint.segment(id))")
        )
    }
}
