import Foundation

protocol OpportunityRepositoryProtocol: Sendable {
    func listings(
        type: OpportunityType?,
        remoteOnly: Bool,
        query: String?,
        cursor: String?
    ) async throws -> OpportunitiesPage
    func listing(id: String) async throws -> Opportunity
    func apply(id: String, coverNote: String) async throws
    func setSaved(id: String, saved: Bool) async throws -> Bool
}

struct OpportunityRepository: OpportunityRepositoryProtocol {

    private let client: ApiClient

    init(client: ApiClient = .shared) {
        self.client = client
    }

    private struct ApplyRequest: Encodable {
        let coverNote: String?
        /// Attaching a CV is a file upload, which this app does not offer
        /// here yet - the field is sent as absent rather than as an empty
        /// string, which the route would treat as a value.
        let resumeUrl: String? = nil
    }

    /// `GET /api/opportunity` - active listings, cursor-paginated, with
    /// the route's own `type`, `remote` and `q` filters.
    func listings(
        type: OpportunityType?,
        remoteOnly: Bool,
        query: String?,
        cursor: String?
    ) async throws -> OpportunitiesPage {
        let trimmed = query?.trimmingCharacters(in: .whitespacesAndNewlines)
        return try await client.send(
            Endpoint.get(
                "opportunity",
                query: [
                    ("type", type.flatMap { $0 == .unknown ? nil : $0.rawValue }),
                    ("remote", remoteOnly ? "true" : nil),
                    ("q", trimmed?.isEmpty == false ? trimmed : nil),
                    ("cursor", cursor),
                ],
                requiresAuth: false
            )
        )
    }

    /// `GET /api/opportunity/{id}`. Attaches `alreadyApplied` for a
    /// signed-in viewer; a listing that is not live is a 404 to anyone
    /// but its poster and staff.
    func listing(id: String) async throws -> Opportunity {
        struct Response: Decodable {
            let listing: Opportunity
        }
        let response: Response = try await client.send(
            Endpoint.get("opportunity/\(Endpoint.segment(id))", requiresAuth: false)
        )
        return response.listing
    }

    /// `POST /api/opportunity/{id}/apply`. The route refuses a second
    /// application, an application to your own listing, and a cover note
    /// over 3000 characters - each with its own message.
    func apply(id: String, coverNote: String) async throws {
        let trimmed = coverNote.trimmingCharacters(in: .whitespacesAndNewlines)
        try await client.sendIgnoringResponse(
            try Endpoint.post(
                "opportunity/\(Endpoint.segment(id))/apply",
                body: ApplyRequest(coverNote: trimmed.isEmpty ? nil : trimmed)
            )
        )
    }

    /// `POST`/`DELETE /api/opportunity/{id}/save`, which answer with the
    /// state they just set. That answer is what the caller records - there
    /// is no route that reports whether a listing is already saved.
    func setSaved(id: String, saved: Bool) async throws -> Bool {
        struct Response: Decodable {
            let saved: Bool
        }
        let path = "opportunity/\(Endpoint.segment(id))/save"
        let response: Response = try await client.send(
            saved ? Endpoint.post(path) : Endpoint.delete(path)
        )
        return response.saved
    }
}
