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
    func create(_ draft: OpportunityDraft) async throws -> String
    func update(id: String, draft: OpportunityDraft) async throws
    func close(id: String) async throws
    func delete(id: String) async throws
    func myListings(cursor: String?) async throws -> MyOpportunityListingsPage
    func myApplications(cursor: String?) async throws -> MyOpportunityApplicationsPage
    func applicants(listingId: String, cursor: String?) async throws -> OpportunityApplicantsPage
    func setApplicationStatus(
        applicationId: String,
        status: OpportunityApplicationStatus
    ) async throws
}

/// Everything the create and edit routes accept, in one value.
///
/// One type for both because the routes take the same fields; the
/// difference is that `PUT` treats an absent key as "leave alone" while
/// `POST` requires type, title and description. Since the composer always
/// has a complete form in front of it, every field is always sent - which
/// is also what makes clearing an optional field (removing a deadline,
/// blanking a location) possible at all.
struct OpportunityDraft: Encodable, Equatable {
    var type: OpportunityType = .job
    var title: String = ""
    var description: String = ""
    var organizationName: String = ""
    var skills: [String] = []
    var location: String = ""
    var remote: Bool = false
    var isPaid: Bool = true
    var compensationInfo: String = ""
    var externalUrl: String = ""

    /// Held as a `Date` because a date picker produces one, but **never
    /// encoded as one** - see `encode(to:)`.
    var deadline: Date?

    /// The route's own limits, mirrored so someone is stopped before a
    /// refusal rather than after it. These are the *server's* numbers,
    /// not invented ones: title 150, description 8000, organisation 150,
    /// location 150, compensation 200, external URL 500, and at most 20
    /// skills of 40 characters each.
    static let titleLimit = 150
    static let descriptionLimit = 8_000
    static let organizationLimit = 150
    static let locationLimit = 150
    static let compensationLimit = 200
    static let externalUrlLimit = 500
    static let skillLimit = 40
    static let skillCountLimit = 20

    var isValid: Bool {
        !title.trimmingCharacters(in: .whitespacesAndNewlines).isEmpty
            && title.trimmingCharacters(in: .whitespacesAndNewlines).count <= Self.titleLimit
            && !description.trimmingCharacters(in: .whitespacesAndNewlines).isEmpty
            && description.trimmingCharacters(in: .whitespacesAndNewlines).count <= Self.descriptionLimit
            && type != .unknown
    }

    init() {}

    /// Pre-fills the composer from a listing being edited.
    init(_ listing: MyOpportunityListing) {
        type = listing.type
        title = listing.title
        description = listing.description ?? ""
        organizationName = listing.organizationName ?? ""
        skills = listing.skills ?? []
        location = listing.location ?? ""
        remote = listing.remote ?? false
        isPaid = listing.isPaid ?? true
        compensationInfo = listing.compensationInfo ?? ""
        externalUrl = listing.externalUrl ?? ""
        deadline = listing.deadline
    }

    private enum CodingKeys: String, CodingKey {
        case type, title, description, organizationName, skills, location
        case remote, isPaid, compensationInfo, externalUrl, deadline
    }

    func encode(to encoder: Encoder) throws {
        var container = encoder.container(keyedBy: CodingKeys.self)
        try container.encode(type.rawValue, forKey: .type)
        try container.encode(title.trimmingCharacters(in: .whitespacesAndNewlines), forKey: .title)
        try container.encode(
            description.trimmingCharacters(in: .whitespacesAndNewlines),
            forKey: .description
        )
        // Encoded as explicit null rather than omitted when empty: the
        // PUT route reads `undefined` as "don't touch this field" and
        // `null` as "clear it", so omitting would make it impossible to
        // remove an organisation name once set. The POST route treats
        // both the same, so one encoding serves both.
        try container.encode(trimmedOrNil(organizationName), forKey: .organizationName)
        try container.encode(skills, forKey: .skills)
        try container.encode(trimmedOrNil(location), forKey: .location)
        try container.encode(remote, forKey: .remote)
        try container.encode(isPaid, forKey: .isPaid)
        try container.encode(trimmedOrNil(compensationInfo), forKey: .compensationInfo)
        try container.encode(trimmedOrNil(externalUrl), forKey: .externalUrl)
        // As an ISO-8601 instant, NOT as a `Date`. `JSONEncoder`'s
        // default strategy is `.deferredToDate`, which writes a bare
        // number of seconds since 2001; both routes hand `deadline` to
        // `new Date(...)`, which reads a NUMBER as milliseconds since
        // 1970. A deadline of 31 December 2026 was therefore stored as
        // 10 January 1970 - a listing that arrived already expired,
        // and one whose deadline nobody could explain from the UI.
        //
        // A string also cannot be mistaken for the *naive* wall-clock
        // shape the same routes read in the server's own timezone (F2);
        // an instant names one moment and is read as that moment
        // everywhere.
        try container.encode(
            deadline.map(ScheduledInstant.string(from:)),
            forKey: .deadline
        )
    }

    private func trimmedOrNil(_ value: String) -> String? {
        let trimmed = value.trimmingCharacters(in: .whitespacesAndNewlines)
        return trimmed.isEmpty ? nil : trimmed
    }
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

    /// `POST /api/opportunity`. Answers 201 with the created listing.
    ///
    /// **Every listing is created as `PENDING_REVIEW`**, never live, and
    /// the route sets that itself - there is no field a client can send
    /// to skip review. So the composer says so rather than implying the
    /// listing is now public.
    ///
    /// Rate-limited to 10 an hour; the route's own refusal is shown.
    func create(_ draft: OpportunityDraft) async throws -> String {
        struct Response: Decodable {
            struct Listing: Decodable { let id: String }
            let listing: Listing
        }
        let response: Response = try await client.send(
            try Endpoint.post("opportunity", body: draft)
        )
        return response.listing.id
    }

    /// `PUT /api/opportunity/{id}` - poster or staff, 403 otherwise.
    ///
    /// A substantive edit to a live listing (its type, title, description
    /// or compensation) sends it **back to PENDING_REVIEW** and clears
    /// the previous moderation decision. That is the route's rule, not a
    /// guess, and the editor warns before saving rather than letting a
    /// live listing quietly disappear from the board.
    func update(id: String, draft: OpportunityDraft) async throws {
        try await client.sendIgnoringResponse(
            try Endpoint.put("opportunity/\(Endpoint.segment(id))", body: draft)
        )
    }

    /// Closing is `PUT` with nothing but a status.
    ///
    /// The route accepts `CLOSED` from the owner **only** while the
    /// listing is ACTIVE, and otherwise keeps the status it has - it
    /// does not error, it just does nothing. `MyOpportunityListing`
    /// offers the control only when it would take effect.
    func close(id: String) async throws {
        struct CloseRequest: Encodable { let status = "CLOSED" }
        try await client.sendIgnoringResponse(
            try Endpoint.put(
                "opportunity/\(Endpoint.segment(id))",
                body: CloseRequest()
            )
        )
    }

    func delete(id: String) async throws {
        try await client.sendIgnoringResponse(
            Endpoint.delete("opportunity/\(Endpoint.segment(id))")
        )
    }

    /// `GET /api/opportunity/my-listings` - the viewer's own listings in
    /// **any** status, which is the only route that returns a listing
    /// that is not live. Cursor-paginated.
    func myListings(cursor: String?) async throws -> MyOpportunityListingsPage {
        try await client.send(
            Endpoint.get("opportunity/my-listings", query: [("cursor", cursor)])
        )
    }

    func myApplications(cursor: String?) async throws -> MyOpportunityApplicationsPage {
        try await client.send(
            Endpoint.get("opportunity/my-applications", query: [("cursor", cursor)])
        )
    }

    /// `GET /api/opportunity/{id}/applications` - poster or staff only.
    /// A 403 here is the correct answer for anyone else and is shown as
    /// the route words it.
    func applicants(listingId: String, cursor: String?) async throws -> OpportunityApplicantsPage {
        try await client.send(
            Endpoint.get(
                "opportunity/\(Endpoint.segment(listingId))/applications",
                query: [("cursor", cursor)]
            )
        )
    }

    /// `PUT /api/opportunity/applications/{id}`.
    ///
    /// The route splits this by who is asking, and the split is real: an
    /// applicant may set only `WITHDRAWN`, and only on their own
    /// application; a poster may set only `REVIEWED`, `ACCEPTED` or
    /// `REJECTED`. Anything else is a 403 that says which rule was
    /// broken. This client offers each side only the statuses its own
    /// role can set, so the refusal is not how anyone finds out.
    func setApplicationStatus(
        applicationId: String,
        status: OpportunityApplicationStatus
    ) async throws {
        struct StatusRequest: Encodable { let status: String }
        try await client.sendIgnoringResponse(
            try Endpoint.put(
                "opportunity/applications/\(Endpoint.segment(applicationId))",
                body: StatusRequest(status: status.rawValue)
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
