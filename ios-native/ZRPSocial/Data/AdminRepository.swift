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

    // Review queues
    func marketplaceListings(status: AdminReviewStatusFilter, page: Int) async throws -> AdminPageResult<AdminMarketplaceListing>
    func reviewMarketplaceListing(id: String, action: AdminReviewAction, rejectionReason: String?) async throws
    func opportunityListings(status: AdminReviewStatusFilter, page: Int) async throws -> AdminPageResult<AdminOpportunityListing>
    func reviewOpportunityListing(id: String, action: AdminReviewAction, rejectionReason: String?) async throws
    func helpCampaigns(status: AdminReviewStatusFilter, page: Int) async throws -> AdminPageResult<AdminHelpCampaignReview>
    func reviewHelpCampaign(id: String, action: AdminReviewAction, rejectionReason: String?) async throws

    // Ads
    func adCampaigns(status: AdminAdStatusFilter, page: Int) async throws -> AdminPageResult<AdminAdCampaign>
    func reviewAdCampaign(id: String, action: AdminAdAction, rejectionReason: String?, adminNote: String?) async throws

    // Withdrawals
    func creatorWithdrawals(status: AdminWithdrawalStatusFilter) async throws -> [AdminCreatorWithdrawal]
    func approveCreatorWithdrawal(id: String) async throws -> ApiResult
    func rejectCreatorWithdrawal(id: String) async throws
    func helpWithdrawals(status: AdminWithdrawalStatusFilter) async throws -> [AdminHelpWithdrawal]
    func approveHelpWithdrawal(id: String) async throws -> ApiResult
    func rejectHelpWithdrawal(id: String) async throws

    // Journalists
    func journalists(status: AdminJournalistStatusFilter, search: String, page: Int) async throws -> AdminJournalistsPage
    func grantJournalist(username: String) async throws
    func reviewJournalist(userId: String, action: AdminJournalistAction, reason: String?) async throws

    // Music artist verification
    func musicArtists(status: AdminMusicArtistStatusFilter, search: String, page: Int) async throws -> AdminMusicArtistsPage
    func setMusicArtistVerified(id: String, verified: Bool) async throws
    func deleteMusicArtist(id: String) async throws

    // Ambassadors
    func ambassadors(status: AdminAmbassadorStatusFilter, search: String, page: Int) async throws -> AdminAmbassadorsPage
    func reviewAmbassador(userId: String, action: AdminAmbassadorAction, reason: String?) async throws

    // Support tickets (ADMIN only)
    func supportTickets(status: AdminTicketStatusFilter, search: String, page: Int) async throws -> AdminSupportTicketsPage
    func supportTicketStats() async throws -> AdminSupportTicketStats
    func supportTicket(id: String) async throws -> AdminSupportTicketDetail
    func setSupportTicketStatus(id: String, status: String) async throws
    func replySupportTicket(id: String, message: String, isInternal: Bool) async throws
    func resolveSupportTicket(id: String, resolution: String?) async throws
    func deleteSupportTicket(id: String) async throws

    // Analytics (ADMIN only)
    func analytics(range: AdminAnalyticsRange) async throws -> AdminAnalytics
    func analyticsGeography(range: AdminAnalyticsRange) async throws -> AdminAnalyticsGeographyResponse

    // Audit log (ADMIN only)
    func auditLog(action: String, targetType: String, targetId: String, cursor: String?) async throws -> AdminAuditLogPage

    // Charity disbursements (ADMIN only)
    func charityDisbursements() async throws -> [AdminCharityDisbursement]
    func recordCharityDisbursement(
        beneficiaryName: String,
        cause: AdminCharityCause,
        amount: Double,
        currency: String,
        disbursedAt: Date,
        note: String?,
        proofUrl: String?
    ) async throws

    // Subscriptions & Billing (ADMIN only)
    func subscriptions(search: String, plan: String, status: String, page: Int) async throws -> AdminSubscriptionsPage
    func subscription(userId: String) async throws -> AdminSubscriptionDetail
    func grantSubscription(userId: String, plan: AdminGrantablePlan, billingInterval: AdminBillingInterval) async throws
    func cancelSubscription(userId: String, reason: String?) async throws
    func restoreSubscription(userId: String) async throws

    // Payments (ADMIN only)
    func pendingPayments() async throws -> [AdminPaymentRequest]
    func verifyPayment(id: String) async throws

    // Upgrade requests (ADMIN only, outside /api/admin/**)
    func upgradeRequests(status: AdminUpgradeRequestStatusFilter) async throws -> [AdminUpgradeRequest]
    func approveUpgradeRequest(id: String, billingInterval: AdminBillingInterval) async throws
    func denyUpgradeRequest(id: String) async throws

    // Storage cleanup (ADMIN only)
    func scanStorage() async throws -> AdminStorageScanResult
    func cleanUpStorage() async throws -> AdminStorageCleanupResult

    // News CMS (staff)
    func newsArticles(status: AdminNewsStatusFilter, search: String, page: Int) async throws -> AdminNewsArticlesPage
    func newsArticle(id: String) async throws -> AdminNewsArticle
    func createNewsArticle(_ draft: AdminNewsArticleDraft) async throws -> AdminNewsArticle
    func updateNewsArticle(id: String, _ draft: AdminNewsArticleDraft) async throws -> AdminNewsArticle
    func deleteNewsArticle(id: String) async throws

    // News Network automation overview (staff for status, admin for settings/run)
    func newsNetworkStatus() async throws -> AdminNewsNetworkStatus
    func setNewsNetworkPaused(_ paused: Bool) async throws
    func runNewsNetworkCycle() async throws -> AdminNewsNetworkRunResult
}

/// The outcome of a call that can succeed outright, or succeed with a
/// caveat the caller must show rather than swallow - specifically the
/// withdrawal-approve routes' 202 "outcome uncertain, do not resubmit"
/// responses, which are not failures (the HTTP status is 2xx-adjacent in
/// meaning even though `ApiClient` maps a real 202 through the success
/// path already) but also not a clean "done".
enum ApiResult {
    case success
    /// The server's own message - shown as information, not an error.
    case pending(message: String)
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

    // MARK: - Review queues

    private struct ReviewActionRequest: Encodable {
        let action: String
        let rejectionReason: String?
    }

    func marketplaceListings(status: AdminReviewStatusFilter, page: Int) async throws -> AdminPageResult<AdminMarketplaceListing> {
        struct Raw: Decodable { let listings: [AdminMarketplaceListing]; let total: Int; let page: Int; let totalPages: Int }
        let raw: Raw = try await client.send(
            Endpoint.get("admin/marketplace", query: [("status", status.rawValue), ("page", String(page)), ("limit", String(Self.pageSize))])
        )
        return AdminPageResult(items: raw.listings, total: raw.total, page: raw.page, totalPages: raw.totalPages)
    }

    /// `PUT /api/admin/marketplace/{id}` - staff.
    func reviewMarketplaceListing(id: String, action: AdminReviewAction, rejectionReason: String?) async throws {
        try await client.sendIgnoringResponse(
            try Endpoint.put(
                "admin/marketplace/\(Endpoint.segment(id))",
                body: ReviewActionRequest(action: action.rawValue, rejectionReason: rejectionReason)
            )
        )
    }

    func opportunityListings(status: AdminReviewStatusFilter, page: Int) async throws -> AdminPageResult<AdminOpportunityListing> {
        struct Raw: Decodable { let listings: [AdminOpportunityListing]; let total: Int; let page: Int; let totalPages: Int }
        let raw: Raw = try await client.send(
            Endpoint.get("admin/opportunity", query: [("status", status.rawValue), ("page", String(page)), ("limit", String(Self.pageSize))])
        )
        return AdminPageResult(items: raw.listings, total: raw.total, page: raw.page, totalPages: raw.totalPages)
    }

    /// `PUT /api/admin/opportunity/{id}` - staff.
    func reviewOpportunityListing(id: String, action: AdminReviewAction, rejectionReason: String?) async throws {
        try await client.sendIgnoringResponse(
            try Endpoint.put(
                "admin/opportunity/\(Endpoint.segment(id))",
                body: ReviewActionRequest(action: action.rawValue, rejectionReason: rejectionReason)
            )
        )
    }

    func helpCampaigns(status: AdminReviewStatusFilter, page: Int) async throws -> AdminPageResult<AdminHelpCampaignReview> {
        struct Raw: Decodable { let campaigns: [AdminHelpCampaignReview]; let total: Int; let page: Int; let totalPages: Int }
        let raw: Raw = try await client.send(
            Endpoint.get("admin/help", query: [("status", status.rawValue), ("page", String(page)), ("limit", String(Self.pageSize))])
        )
        return AdminPageResult(items: raw.campaigns, total: raw.total, page: raw.page, totalPages: raw.totalPages)
    }

    /// `PUT /api/admin/help/{id}` - staff.
    func reviewHelpCampaign(id: String, action: AdminReviewAction, rejectionReason: String?) async throws {
        try await client.sendIgnoringResponse(
            try Endpoint.put(
                "admin/help/\(Endpoint.segment(id))",
                body: ReviewActionRequest(action: action.rawValue, rejectionReason: rejectionReason)
            )
        )
    }

    // MARK: - Ads

    func adCampaigns(status: AdminAdStatusFilter, page: Int) async throws -> AdminPageResult<AdminAdCampaign> {
        let raw: AdminAdsPage = try await client.send(
            Endpoint.get("admin/ads", query: [("status", status.rawValue), ("page", String(page)), ("limit", String(Self.pageSize))])
        )
        return AdminPageResult(items: raw.campaigns, total: raw.total, page: raw.page, totalPages: raw.totalPages)
    }

    private struct AdReviewRequest: Encodable {
        let action: String
        let rejectionReason: String?
        let adminNote: String?
    }

    /// `PUT /api/admin/ads/{id}` `{action, rejectionReason?, adminNote?}`
    /// - staff. Validated against `src/lib/ads/lifecycle.ts` server-side;
    /// see `AdminAdCampaign.availableActions` for the client-side mirror.
    func reviewAdCampaign(id: String, action: AdminAdAction, rejectionReason: String?, adminNote: String?) async throws {
        try await client.sendIgnoringResponse(
            try Endpoint.put(
                "admin/ads/\(Endpoint.segment(id))",
                body: AdReviewRequest(
                    action: action.rawValue,
                    rejectionReason: rejectionReason?.isEmpty == false ? rejectionReason : nil,
                    adminNote: adminNote
                )
            )
        )
    }

    // MARK: - Withdrawals

    /// The approve routes answer either `{success: true, transactionHash}`
    /// (200) or, for a genuinely ambiguous on-chain outcome, `{error,
    /// transactionHash}` with a 2xx-range status that `ApiClient` does not
    /// treat as a failure - see `ApiResult`'s own doc comment. Decoding
    /// leniently into one type that fits both shapes is simpler and safer
    /// than trying to branch on the raw HTTP status here.
    private struct WithdrawalApproveResponse: Decodable {
        let success: Bool?
        let error: String?
    }

    func creatorWithdrawals(status: AdminWithdrawalStatusFilter) async throws -> [AdminCreatorWithdrawal] {
        try await client.send(Endpoint.get("admin/withdrawals", query: [("status", status.rawValue)]))
    }

    /// `POST /api/admin/withdrawals/{id}/approve` - **admin-only**.
    /// Triggers a real on-chain USDC transfer; see this repository's own
    /// module doc and the route's extensive comments on crash-safety.
    func approveCreatorWithdrawal(id: String) async throws -> ApiResult {
        let response: WithdrawalApproveResponse = try await client.send(
            Endpoint.post("admin/withdrawals/\(Endpoint.segment(id))/approve")
        )
        return response.success == true
            ? .success
            : .pending(message: response.error ?? "Transfer outcome is uncertain and requires manual review.")
    }

    /// `POST /api/admin/withdrawals/{id}/reject` - **admin-only**. Refunds
    /// the reserved amount back to the creator's balance.
    func rejectCreatorWithdrawal(id: String) async throws {
        try await client.sendIgnoringResponse(
            Endpoint.post("admin/withdrawals/\(Endpoint.segment(id))/reject")
        )
    }

    func helpWithdrawals(status: AdminWithdrawalStatusFilter) async throws -> [AdminHelpWithdrawal] {
        try await client.send(Endpoint.get("admin/help-withdrawals", query: [("status", status.rawValue)]))
    }

    /// `POST /api/admin/help-withdrawals/{id}/approve` - **admin-only**.
    /// Same real on-chain transfer as the creator withdrawal above.
    func approveHelpWithdrawal(id: String) async throws -> ApiResult {
        let response: WithdrawalApproveResponse = try await client.send(
            Endpoint.post("admin/help-withdrawals/\(Endpoint.segment(id))/approve")
        )
        return response.success == true
            ? .success
            : .pending(message: response.error ?? "Transfer outcome is uncertain and requires manual review.")
    }

    /// `POST /api/admin/help-withdrawals/{id}/reject` - **admin-only**.
    func rejectHelpWithdrawal(id: String) async throws {
        try await client.sendIgnoringResponse(
            Endpoint.post("admin/help-withdrawals/\(Endpoint.segment(id))/reject")
        )
    }

    // MARK: - Journalists

    func journalists(status: AdminJournalistStatusFilter, search: String, page: Int) async throws -> AdminJournalistsPage {
        try await client.send(
            Endpoint.get(
                "admin/journalists",
                query: [
                    ("status", status == .all ? nil : status.rawValue),
                    ("search", search),
                    ("page", String(page)),
                    ("limit", String(Self.pageSize)),
                ]
            )
        )
    }

    private struct GrantJournalistRequest: Encodable {
        let username: String
    }

    /// `POST /api/admin/journalists` `{username}` - staff. Direct grant,
    /// no application involved; the target must already have a ZRP account.
    func grantJournalist(username: String) async throws {
        try await client.sendIgnoringResponse(
            try Endpoint.post(
                "admin/journalists",
                body: GrantJournalistRequest(username: username.trimmingCharacters(in: .whitespacesAndNewlines))
            )
        )
    }

    /// Shared by journalist and ambassador review - both routes take the
    /// exact same `{action, reason?}` body.
    private struct ActionReasonRequest: Encodable {
        let action: String
        let reason: String?
    }

    /// `PATCH /api/admin/journalists/{userId}` `{action, reason?}` - staff.
    func reviewJournalist(userId: String, action: AdminJournalistAction, reason: String?) async throws {
        try await client.sendIgnoringResponse(
            try Endpoint.patch(
                "admin/journalists/\(Endpoint.segment(userId))",
                body: ActionReasonRequest(action: action.rawValue, reason: reason?.isEmpty == false ? reason : nil)
            )
        )
    }

    // MARK: - Music artist verification

    func musicArtists(status: AdminMusicArtistStatusFilter, search: String, page: Int) async throws -> AdminMusicArtistsPage {
        try await client.send(
            Endpoint.get(
                "admin/music/artists",
                query: [
                    ("status", status.rawValue),
                    ("q", search),
                    ("page", String(page)),
                    ("limit", String(Self.pageSize)),
                ]
            )
        )
    }

    private struct VerifyArtistRequest: Encodable {
        let verified: Bool
    }

    /// `POST /api/admin/music/artists/{id}/verify` `{verified}` - staff.
    func setMusicArtistVerified(id: String, verified: Bool) async throws {
        try await client.sendIgnoringResponse(
            try Endpoint.post(
                "admin/music/artists/\(Endpoint.segment(id))/verify",
                body: VerifyArtistRequest(verified: verified)
            )
        )
    }

    /// `DELETE /api/admin/music/artists/{id}` - staff. Cascades to every
    /// track, album and follow the artist has - see the route's own
    /// comment on why that is deliberate for this specific action.
    func deleteMusicArtist(id: String) async throws {
        try await client.sendIgnoringResponse(
            Endpoint.delete("admin/music/artists/\(Endpoint.segment(id))")
        )
    }

    // MARK: - Ambassadors

    func ambassadors(status: AdminAmbassadorStatusFilter, search: String, page: Int) async throws -> AdminAmbassadorsPage {
        try await client.send(
            Endpoint.get(
                "admin/ambassadors",
                query: [
                    ("status", status == .all ? nil : status.rawValue),
                    ("search", search),
                    ("page", String(page)),
                    ("limit", String(Self.pageSize)),
                ]
            )
        )
    }

    /// `PATCH /api/admin/ambassadors/{userId}` `{action, reason?}` - staff.
    func reviewAmbassador(userId: String, action: AdminAmbassadorAction, reason: String?) async throws {
        try await client.sendIgnoringResponse(
            try Endpoint.patch(
                "admin/ambassadors/\(Endpoint.segment(userId))",
                body: ActionReasonRequest(action: action.rawValue, reason: reason?.isEmpty == false ? reason : nil)
            )
        )
    }

    // MARK: - Support tickets (ADMIN only)

    func supportTickets(status: AdminTicketStatusFilter, search: String, page: Int) async throws -> AdminSupportTicketsPage {
        try await client.send(
            Endpoint.get(
                "admin/support/tickets",
                query: [
                    ("status", status == .all ? nil : status.rawValue),
                    ("search", search.isEmpty ? nil : search),
                    ("page", String(page)),
                    ("limit", String(Self.pageSize)),
                ]
            )
        )
    }

    func supportTicketStats() async throws -> AdminSupportTicketStats {
        try await client.send(Endpoint.get("admin/support/tickets/stats"))
    }

    func supportTicket(id: String) async throws -> AdminSupportTicketDetail {
        try await client.send(Endpoint.get("admin/support/tickets/\(Endpoint.segment(id))"))
    }

    private struct TicketStatusRequest: Encodable {
        let status: String
    }

    /// `PUT /api/admin/support/tickets/{id}` `{status}` - admin-only.
    func setSupportTicketStatus(id: String, status: String) async throws {
        try await client.sendIgnoringResponse(
            try Endpoint.put("admin/support/tickets/\(Endpoint.segment(id))", body: TicketStatusRequest(status: status))
        )
    }

    private struct TicketReplyRequest: Encodable {
        let message: String
        let isInternal: Bool
    }

    /// `POST /api/admin/support/tickets/{id}/reply` - admin-only. Also
    /// moves the ticket to IN_PROGRESS server-side.
    func replySupportTicket(id: String, message: String, isInternal: Bool) async throws {
        try await client.sendIgnoringResponse(
            try Endpoint.post(
                "admin/support/tickets/\(Endpoint.segment(id))/reply",
                body: TicketReplyRequest(message: message, isInternal: isInternal)
            )
        )
    }

    private struct TicketResolveRequest: Encodable {
        let resolution: String?
    }

    /// `POST /api/admin/support/tickets/{id}/resolve` - admin-only.
    func resolveSupportTicket(id: String, resolution: String?) async throws {
        try await client.sendIgnoringResponse(
            try Endpoint.post(
                "admin/support/tickets/\(Endpoint.segment(id))/resolve",
                body: TicketResolveRequest(resolution: resolution?.isEmpty == false ? resolution : nil)
            )
        )
    }

    /// `DELETE /api/admin/support/tickets/{id}` - admin-only. Replies
    /// cascade with it.
    func deleteSupportTicket(id: String) async throws {
        try await client.sendIgnoringResponse(
            Endpoint.delete("admin/support/tickets/\(Endpoint.segment(id))")
        )
    }

    // MARK: - Analytics (ADMIN only)

    func analytics(range: AdminAnalyticsRange) async throws -> AdminAnalytics {
        try await client.send(Endpoint.get("admin/analytics", query: [("range", range.rawValue)]))
    }

    /// `GET /api/admin/analytics/geography?range=` - admin-only. Same
    /// `range` value the core analytics call above takes.
    func analyticsGeography(range: AdminAnalyticsRange) async throws -> AdminAnalyticsGeographyResponse {
        try await client.send(Endpoint.get("admin/analytics/geography", query: [("range", range.rawValue)]))
    }

    // MARK: - Audit log (ADMIN only)

    func auditLog(action: String, targetType: String, targetId: String, cursor: String?) async throws -> AdminAuditLogPage {
        try await client.send(
            Endpoint.get(
                "admin/audit-log",
                query: [
                    ("action", action.isEmpty ? nil : action),
                    ("targetType", targetType.isEmpty ? nil : targetType),
                    ("targetId", targetId.isEmpty ? nil : targetId),
                    ("cursor", cursor),
                    ("limit", "50"),
                ]
            )
        )
    }

    // MARK: - Charity disbursements (ADMIN only)

    func charityDisbursements() async throws -> [AdminCharityDisbursement] {
        struct Raw: Decodable { let disbursements: [AdminCharityDisbursement] }
        let raw: Raw = try await client.send(Endpoint.get("admin/charity-disbursements"))
        return raw.disbursements
    }

    private struct CharityDisbursementRequest: Encodable {
        let beneficiaryName: String
        let cause: String
        let amount: Double
        let currency: String
        let disbursedAt: String
        let note: String?
        let proofUrl: String?
    }

    /// `POST /api/admin/charity-disbursements` - admin-only. Every field
    /// here becomes part of ZRP's public charity ledger.
    func recordCharityDisbursement(
        beneficiaryName: String,
        cause: AdminCharityCause,
        amount: Double,
        currency: String,
        disbursedAt: Date,
        note: String?,
        proofUrl: String?
    ) async throws {
        try await client.sendIgnoringResponse(
            try Endpoint.post(
                "admin/charity-disbursements",
                body: CharityDisbursementRequest(
                    beneficiaryName: beneficiaryName,
                    cause: cause.rawValue,
                    amount: amount,
                    currency: currency,
                    disbursedAt: ISO8601DateFormatter().string(from: disbursedAt),
                    note: note?.isEmpty == false ? note : nil,
                    proofUrl: proofUrl?.isEmpty == false ? proofUrl : nil
                )
            )
        )
    }

    // MARK: - Subscriptions & Billing (ADMIN only)

    /// Deliberately a narrower filter set than the web page's - see
    /// `AdminSubscriptionsView`'s own doc comment and PARITY.md for
    /// exactly what's not offered here (billing interval, payment
    /// method, "expiring within" and sort order).
    func subscriptions(search: String, plan: String, status: String, page: Int) async throws -> AdminSubscriptionsPage {
        try await client.send(
            Endpoint.get(
                "admin/subscriptions",
                query: [
                    ("search", search.isEmpty ? nil : search),
                    ("plan", plan == "ALL" ? nil : plan),
                    ("status", status == "ALL" ? nil : status),
                    ("page", String(page)),
                    ("limit", String(Self.pageSize)),
                ]
            )
        )
    }

    func subscription(userId: String) async throws -> AdminSubscriptionDetail {
        try await client.send(Endpoint.get("admin/subscriptions/\(Endpoint.segment(userId))"))
    }

    private struct GrantSubscriptionRequest: Encodable {
        let plan: String
        let billingInterval: String
    }

    /// `POST /api/admin/subscriptions/{userId}/grant` - admin-only.
    func grantSubscription(userId: String, plan: AdminGrantablePlan, billingInterval: AdminBillingInterval) async throws {
        try await client.sendIgnoringResponse(
            try Endpoint.post(
                "admin/subscriptions/\(Endpoint.segment(userId))/grant",
                body: GrantSubscriptionRequest(plan: plan.rawValue, billingInterval: billingInterval.rawValue)
            )
        )
    }

    private struct CancelSubscriptionRequest: Encodable {
        let reason: String?
    }

    /// `POST /api/admin/subscriptions/{userId}/cancel` - admin-only.
    func cancelSubscription(userId: String, reason: String?) async throws {
        try await client.sendIgnoringResponse(
            try Endpoint.post(
                "admin/subscriptions/\(Endpoint.segment(userId))/cancel",
                body: CancelSubscriptionRequest(reason: reason?.isEmpty == false ? reason : nil)
            )
        )
    }

    /// `POST /api/admin/subscriptions/{userId}/restore` - admin-only.
    func restoreSubscription(userId: String) async throws {
        try await client.sendIgnoringResponse(
            Endpoint.post("admin/subscriptions/\(Endpoint.segment(userId))/restore")
        )
    }

    // MARK: - Payments

    /// `GET /api/admin/payments` - admin-only. Always pending-only, no
    /// query params, no pagination - see `AdminPaymentRequest`'s own doc
    /// comment.
    func pendingPayments() async throws -> [AdminPaymentRequest] {
        try await client.send(Endpoint.get("admin/payments"))
    }

    private struct VerifyPaymentRequest: Encodable {
        let paymentId: String
    }

    /// `POST /api/admin/payments/verify` `{paymentId}` - admin-only. A
    /// **flat** POST with the id in the body, not a `[id]` path segment
    /// like most other admin routes - matches the route exactly. Verifies
    /// the payment and grants/extends the user's plan in one transaction;
    /// a 400/409 ("already processed") surfaces as an ordinary `ApiError`
    /// for the caller to show.
    func verifyPayment(id: String) async throws {
        try await client.sendIgnoringResponse(
            try Endpoint.post("admin/payments/verify", body: VerifyPaymentRequest(paymentId: id))
        )
    }

    // MARK: - Upgrade requests (outside /api/admin/**, still admin-only)

    /// `GET /api/upgrade-requests?status=` - admin-only.
    func upgradeRequests(status: AdminUpgradeRequestStatusFilter) async throws -> [AdminUpgradeRequest] {
        try await client.send(Endpoint.get("upgrade-requests", query: [("status", status.rawValue)]))
    }

    private struct UpgradeRequestActionBody: Encodable {
        let action: String
        let billingInterval: String?
    }

    /// `PUT /api/upgrade-requests/{id}` `{action: "approve", billingInterval}`
    /// - admin-only. Grants/extends the subscription in a transaction,
    /// the same crash-safe claim pattern as the payment/withdrawal
    /// routes; a 409 ("already processed") means another admin or tab
    /// claimed it first.
    func approveUpgradeRequest(id: String, billingInterval: AdminBillingInterval) async throws {
        try await client.sendIgnoringResponse(
            try Endpoint.put(
                "upgrade-requests/\(Endpoint.segment(id))",
                body: UpgradeRequestActionBody(action: "approve", billingInterval: billingInterval.rawValue)
            )
        )
    }

    /// `PUT /api/upgrade-requests/{id}` `{action: "deny"}` - admin-only.
    func denyUpgradeRequest(id: String) async throws {
        try await client.sendIgnoringResponse(
            try Endpoint.put(
                "upgrade-requests/\(Endpoint.segment(id))",
                body: UpgradeRequestActionBody(action: "deny", billingInterval: nil)
            )
        )
    }

    // MARK: - Storage cleanup (ADMIN only)

    /// `GET /api/admin/cleanup-uploadthing` - a dry run, changes nothing.
    func scanStorage() async throws -> AdminStorageScanResult {
        try await client.send(Endpoint.get("admin/cleanup-uploadthing"))
    }

    /// `POST /api/admin/cleanup-uploadthing` - admin-only. **Irreversibly
    /// deletes** every file the most recent scan found orphaned. The
    /// route re-scans internally right before deleting, so this always
    /// acts on a fresh result, not a possibly-stale one the app cached.
    func cleanUpStorage() async throws -> AdminStorageCleanupResult {
        try await client.send(Endpoint.post("admin/cleanup-uploadthing"))
    }

    // MARK: - News CMS

    func newsArticles(status: AdminNewsStatusFilter, search: String, page: Int) async throws -> AdminNewsArticlesPage {
        try await client.send(
            Endpoint.get(
                "admin/news",
                query: [
                    ("status", status == .all ? nil : status.rawValue),
                    ("search", search.isEmpty ? nil : search),
                    ("page", String(page)),
                    ("limit", String(Self.pageSize)),
                ]
            )
        )
    }

    func newsArticle(id: String) async throws -> AdminNewsArticle {
        let response: AdminNewsArticleResponse = try await client.send(Endpoint.get("admin/news/\(Endpoint.segment(id))"))
        return response.article
    }

    private struct NewsArticleWriteRequest: Encodable {
        let title: String
        let slug: String
        let excerpt: String?
        let content: String
        let coverImage: String?
        let sourceName: String?
        let sourceUrl: String?
        let category: String
        let status: String
        let authorId: String
        let featured: Bool
        let reviewNote: String?
    }

    private static func writeBody(_ draft: AdminNewsArticleDraft) -> NewsArticleWriteRequest {
        NewsArticleWriteRequest(
            title: draft.title.trimmingCharacters(in: .whitespacesAndNewlines),
            slug: draft.slug.trimmingCharacters(in: .whitespacesAndNewlines),
            excerpt: draft.excerpt.isEmpty ? nil : draft.excerpt,
            content: draft.content,
            coverImage: draft.coverImage.isEmpty ? nil : draft.coverImage,
            sourceName: draft.sourceName.isEmpty ? nil : draft.sourceName,
            sourceUrl: draft.sourceUrl.isEmpty ? nil : draft.sourceUrl,
            category: draft.category.rawValue,
            status: draft.status.rawValue,
            authorId: draft.authorId,
            featured: draft.featured,
            reviewNote: draft.reviewNote.isEmpty ? nil : draft.reviewNote
        )
    }

    /// `POST /api/admin/news` - staff.
    func createNewsArticle(_ draft: AdminNewsArticleDraft) async throws -> AdminNewsArticle {
        let response: AdminNewsArticleResponse = try await client.send(
            try Endpoint.post("admin/news", body: Self.writeBody(draft))
        )
        return response.article
    }

    /// `PUT /api/admin/news/{id}` (aliased to the same handler as
    /// `PATCH` server-side - see that route's own comment on why) - staff.
    func updateNewsArticle(id: String, _ draft: AdminNewsArticleDraft) async throws -> AdminNewsArticle {
        let response: AdminNewsArticleResponse = try await client.send(
            try Endpoint.put("admin/news/\(Endpoint.segment(id))", body: Self.writeBody(draft))
        )
        return response.article
    }

    /// `DELETE /api/admin/news/{id}` - staff.
    func deleteNewsArticle(id: String) async throws {
        try await client.sendIgnoringResponse(Endpoint.delete("admin/news/\(Endpoint.segment(id))"))
    }

    // MARK: - News Network automation overview

    /// `GET /api/admin/news-network/status` - staff.
    func newsNetworkStatus() async throws -> AdminNewsNetworkStatus {
        struct Raw: Decodable {
            let status: AdminNewsNetworkSettings
            let lastRun: AdminNewsNetworkJobRun?
            let feeds: AdminNewsNetworkStatus.Feeds
            let publications: AdminNewsNetworkStatus.Publications
            let stories: AdminNewsNetworkStatus.Stories
            let duplicatesPreventedToday: Int
            let sourceHealth: AdminNewsNetworkStatus.SourceHealth
        }
        let raw: Raw = try await client.send(Endpoint.get("admin/news-network/status"))
        return AdminNewsNetworkStatus(
            status: raw.status,
            lastRun: raw.lastRun,
            feeds: raw.feeds,
            publications: raw.publications,
            stories: raw.stories,
            duplicatesPreventedToday: raw.duplicatesPreventedToday,
            sourceHealth: raw.sourceHealth
        )
    }

    private struct PausedRequest: Encodable {
        let paused: Bool
    }

    /// `PATCH /api/admin/news-network/settings` `{paused}` - **admin-
    /// only**. The platform-wide kill switch: takes effect on the very
    /// next cycle.
    func setNewsNetworkPaused(_ paused: Bool) async throws {
        try await client.sendIgnoringResponse(
            try Endpoint.patch("admin/news-network/settings", body: PausedRequest(paused: paused))
        )
    }

    /// `POST /api/admin/news-network/run` - **admin-only**. Runs one
    /// editorial cycle immediately, outside the schedule. Rate-limited to
    /// a handful per hour server-side.
    func runNewsNetworkCycle() async throws -> AdminNewsNetworkRunResult {
        try await client.send(Endpoint.post("admin/news-network/run"))
    }
}
