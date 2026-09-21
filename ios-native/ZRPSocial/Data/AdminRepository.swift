import Foundation

/// Everything the staff admin console does, against the same
/// `/api/admin/**` routes the web backoffice calls.
///
/// **Every route behind these calls re-checks the caller's role from the
/// database on the server** (`requireStaff`/`requireAdmin` in
/// `src/lib/admin.ts`, never trusting the session JWT's snapshot). Nothing
/// here is a security boundary - hiding the admin entry point in
/// `ZrpMenuView` when the signed-in user is not staff is a UI convenience
/// only. A non-staff account that somehow reached one of these screens
/// would get the same 401/403 every route already answers with, which
/// `ApiClient` already turns into `.unauthorized`/`.forbidden`.
///
/// Every mutation intentionally returns little or nothing and leaves the
/// caller to reload the relevant page from the server, the same pattern
/// `TeamRepository`/`TeamViewModel` already establish: `PUT
/// /api/admin/reports/[id]` and `PUT /api/admin/appeals/[id]` answer with
/// a **flat** row (no nested reporter/post/user includes), which does not
/// match what this app displays - reloading the paginated, fully-included
/// GET is simpler and more honest than trying to reshape a mismatched
/// response into a full row.
protocol AdminRepositoryProtocol: Sendable {
    // Dashboard
    func stats() async throws -> AdminStats

    // Users
    func users(
        search: String,
        page: Int,
        role: AdminRoleFilter,
        badge: AdminBadgeFilter,
        status: AdminStatusFilter
    ) async throws -> AdminUsersPage
    func setUserRole(id: String, role: AdminAssignableRole) async throws
    func setUserBadge(id: String, badge: AdminBadgeType?) async throws
    /// Returns the new `banned` state.
    @discardableResult
    func toggleBan(userId: String) async throws -> Bool
    func deleteUser(id: String) async throws

    // Reports
    func reports(status: AdminReportStatusFilter, page: Int) async throws -> AdminReportsPage
    func setReportStatus(
        id: String,
        status: AdminReportStatusFilter,
        actionType: AdminReportActionType?,
        actionNote: String?
    ) async throws
    func deleteReport(id: String) async throws

    // Appeals
    func appeals(status: AdminAppealStatusFilter, page: Int) async throws -> AdminAppealsPage
    func resolveAppeal(
        id: String,
        decision: AdminAppealDecision,
        resolutionNote: String
    ) async throws

    // Posts
    func posts(search: String, page: Int) async throws -> AdminPostsPage
    func deletePost(id: String) async throws
}

struct AdminRepository: AdminRepositoryProtocol {

    private let client: ApiClient
    private static let pageSize = 20

    init(client: ApiClient = .shared) {
        self.client = client
    }

    // MARK: - Dashboard

    /// `GET /api/admin/stats` - staff.
    func stats() async throws -> AdminStats {
        try await client.send(Endpoint.get("admin/stats"))
    }

    // MARK: - Users

    /// `GET /api/admin/users?search=&page=&role=&badge=&status=` - staff
    /// (ADMIN or MODERATOR).
    func users(
        search: String,
        page: Int,
        role: AdminRoleFilter,
        badge: AdminBadgeFilter,
        status: AdminStatusFilter
    ) async throws -> AdminUsersPage {
        try await client.send(
            Endpoint.get(
                "admin/users",
                query: [
                    ("search", search),
                    ("page", String(page)),
                    ("limit", String(Self.pageSize)),
                    ("role", role.rawValue),
                    ("badge", badge.rawValue),
                    ("status", status.rawValue),
                ]
            )
        )
    }

    private struct RoleRequest: Encodable {
        let role: String
    }

    /// `PUT /api/admin/users/{id}` `{role}` - **admin-only**. The route
    /// answers the updated user, but not in the shape this screen keeps
    /// (no `_count`), so the caller reloads the current page instead of
    /// trying to merge it in.
    func setUserRole(id: String, role: AdminAssignableRole) async throws {
        try await client.sendIgnoringResponse(
            try Endpoint.put(
                "admin/users/\(Endpoint.segment(id))",
                body: RoleRequest(role: role.rawValue)
            )
        )
    }

    /// A request whose `badgeType` must be able to encode as JSON `null`
    /// (clearing the badge) as well as a string - Swift's synthesized
    /// `Encodable` conformance for an `Optional` property calls
    /// `encodeIfPresent` and would silently *omit* the key instead of
    /// nulling it, which the route reads as "don't change this field".
    /// The explicit `encode(to:)` below routes a `nil` value through
    /// `Optional`'s own `Encodable` conformance, which does call
    /// `encodeNil()`.
    private struct BadgeRequest: Encodable {
        let badgeType: AdminBadgeType?

        private enum CodingKeys: String, CodingKey { case badgeType }

        func encode(to encoder: Encoder) throws {
            var container = encoder.container(keyedBy: CodingKeys.self)
            try container.encode(badgeType?.rawValue, forKey: .badgeType)
        }
    }

    /// `PUT /api/admin/users/{id}` `{badgeType}` - **admin-only**.
    /// `badge: nil` clears it (sent as JSON `null`).
    func setUserBadge(id: String, badge: AdminBadgeType?) async throws {
        try await client.sendIgnoringResponse(
            try Endpoint.put(
                "admin/users/\(Endpoint.segment(id))",
                body: BadgeRequest(badgeType: badge)
            )
        )
    }

    private struct BanToggleResponse: Decodable {
        let banned: Bool
    }

    /// `POST /api/admin/users/{id}/ban` - staff (ADMIN or MODERATOR).
    /// Flips the ban, it does not set it - the route reads the current
    /// value and writes its opposite.
    @discardableResult
    func toggleBan(userId: String) async throws -> Bool {
        let response: BanToggleResponse = try await client.send(
            Endpoint.post("admin/users/\(Endpoint.segment(userId))/ban")
        )
        return response.banned
    }

    /// `DELETE /api/admin/users/{id}` - **admin-only**. Irreversible:
    /// cascades to every piece of content the account owns through the
    /// same `deleteUserAccountAndFiles` helper self-service deletion
    /// uses. The confirmation copy for this lives in the view, not here -
    /// this call carries out exactly what was already confirmed.
    func deleteUser(id: String) async throws {
        try await client.sendIgnoringResponse(
            Endpoint.delete("admin/users/\(Endpoint.segment(id))")
        )
    }

    // MARK: - Reports

    /// `GET /api/admin/reports?status=&page=` - staff.
    func reports(status: AdminReportStatusFilter, page: Int) async throws -> AdminReportsPage {
        try await client.send(
            Endpoint.get(
                "admin/reports",
                query: [
                    ("status", status.rawValue),
                    ("page", String(page)),
                    ("limit", String(Self.pageSize)),
                ]
            )
        )
    }

    private struct ReportUpdateRequest: Encodable {
        let status: String
        let actionType: String?
        let actionNote: String?
    }

    /// `PUT /api/admin/reports/{id}` `{status, actionType?, actionNote?}`
    /// - staff. `actionType`/`actionNote` only matter when `status` is
    /// `.actioned`; the route itself clears both whenever the status is
    /// anything else, so sending them unconditionally is harmless.
    ///
    /// This **only records a label and a note** - it does not delete a
    /// post, ban a user, or do anything else `actionType` describes.
    /// Carrying out the action is a separate trip to Users or Posts; see
    /// `AdminReportActionType`.
    func setReportStatus(
        id: String,
        status: AdminReportStatusFilter,
        actionType: AdminReportActionType?,
        actionNote: String?
    ) async throws {
        try await client.sendIgnoringResponse(
            try Endpoint.put(
                "admin/reports/\(Endpoint.segment(id))",
                body: ReportUpdateRequest(
                    status: status.rawValue,
                    actionType: actionType?.rawValue,
                    actionNote: actionNote?.isEmpty == false ? actionNote : nil
                )
            )
        )
    }

    /// `DELETE /api/admin/reports/{id}` - **admin-only**. The route
    /// itself refuses a still-`pending` report (409) and one with an
    /// appeal on file (409) - both surface as `ApiError.server(409, …)`
    /// with the route's own explanation, which the view shows rather
    /// than hiding the button only to have it fail anyway.
    func deleteReport(id: String) async throws {
        try await client.sendIgnoringResponse(
            Endpoint.delete("admin/reports/\(Endpoint.segment(id))")
        )
    }

    // MARK: - Appeals

    /// `GET /api/admin/appeals?status=&page=` - staff.
    func appeals(status: AdminAppealStatusFilter, page: Int) async throws -> AdminAppealsPage {
        try await client.send(
            Endpoint.get(
                "admin/appeals",
                query: [
                    ("status", status.rawValue),
                    ("page", String(page)),
                    ("limit", String(Self.pageSize)),
                ]
            )
        )
    }

    private struct AppealResolveRequest: Encodable {
        let status: String
        let resolutionNote: String?
    }

    /// `PUT /api/admin/appeals/{id}` `{status, resolutionNote}` - staff.
    /// Refused with 409 if the appeal was already resolved - shown as the
    /// server's own message, not retried silently.
    ///
    /// Overturning a `BAN_USER` action unbans the user server-side as
    /// part of this same call; every other action type has no automated
    /// undo (deleted content, warnings, mutes), which the resolution
    /// screen explains rather than implying a restoration that will not
    /// happen.
    func resolveAppeal(
        id: String,
        decision: AdminAppealDecision,
        resolutionNote: String
    ) async throws {
        try await client.sendIgnoringResponse(
            try Endpoint.put(
                "admin/appeals/\(Endpoint.segment(id))",
                body: AppealResolveRequest(
                    status: decision.rawValue,
                    resolutionNote: resolutionNote.isEmpty ? nil : resolutionNote
                )
            )
        )
    }

    // MARK: - Posts

    /// `GET /api/admin/posts?search=&page=` - staff.
    func posts(search: String, page: Int) async throws -> AdminPostsPage {
        try await client.send(
            Endpoint.get(
                "admin/posts",
                query: [
                    ("search", search),
                    ("page", String(page)),
                    ("limit", String(Self.pageSize)),
                ]
            )
        )
    }

    /// `DELETE /api/admin/posts/{id}` - staff. Irreversible; the route
    /// also cleans up the post's (and its comments') UploadThing files
    /// once nothing else references them.
    func deletePost(id: String) async throws {
        try await client.sendIgnoringResponse(
            Endpoint.delete("admin/posts/\(Endpoint.segment(id))")
        )
    }
}
