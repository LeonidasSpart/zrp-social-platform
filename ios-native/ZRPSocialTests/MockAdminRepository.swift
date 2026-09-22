import Foundation
@testable import ZRPSocial

/// A scriptable stand-in for `AdminRepository`, used by the admin
/// ViewModel tests so they exercise paging/mutation/error-handling logic
/// without a network call. Each `*Result` is consumed once per matching
/// call and defaults to a small, deterministic fixture so a test that
/// doesn't care about the exact payload doesn't have to build one.
final class MockAdminRepository: AdminRepositoryProtocol, @unchecked Sendable {

    // MARK: - Call recording

    private(set) var usersCalls: [(search: String, page: Int, role: AdminRoleFilter, badge: AdminBadgeFilter, status: AdminStatusFilter)] = []
    private(set) var setUserRoleCalls: [(id: String, role: AdminAssignableRole)] = []
    private(set) var setUserBadgeCalls: [(id: String, badge: AdminBadgeType?)] = []
    private(set) var toggleBanCalls: [String] = []
    private(set) var deleteUserCalls: [String] = []

    private(set) var reportsCalls: [(status: AdminReportStatusFilter, page: Int)] = []
    private(set) var setReportStatusCalls: [(id: String, status: AdminReportStatusFilter, actionType: AdminReportActionType?, actionNote: String?)] = []
    private(set) var deleteReportCalls: [String] = []

    private(set) var appealsCalls: [(status: AdminAppealStatusFilter, page: Int)] = []
    private(set) var resolveAppealCalls: [(id: String, decision: AdminAppealDecision, note: String)] = []

    private(set) var postsCalls: [(search: String, page: Int)] = []
    private(set) var deletePostCalls: [String] = []

    // MARK: - Scripted results

    var statsResult: Result<AdminStats, Error> = .success(
        AdminStats(users: 0, posts: 0, comments: 0, reports: 0, pendingReports: 0, roleCounts: [:])
    )
    var usersResult: Result<AdminUsersPage, Error> = .success(
        AdminUsersPage(users: [], total: 0, page: 1, totalPages: 1, stats: AdminUserStats(total: 0, active: 0, banned: 0, admins: 0, mods: 0))
    )
    var mutationError: Error?

    var reportsResult: Result<AdminReportsPage, Error> = .success(
        AdminReportsPage(reports: [], total: 0, page: 1, totalPages: 1)
    )
    var appealsResult: Result<AdminAppealsPage, Error> = .success(
        AdminAppealsPage(appeals: [], total: 0, page: 1, totalPages: 1)
    )
    var postsResult: Result<AdminPostsPage, Error> = .success(
        AdminPostsPage(posts: [], total: 0, page: 1, totalPages: 1)
    )
    var banToggleResult: Result<Bool, Error> = .success(true)

    // MARK: - AdminRepositoryProtocol

    func stats() async throws -> AdminStats { try statsResult.get() }

    func users(
        search: String,
        page: Int,
        role: AdminRoleFilter,
        badge: AdminBadgeFilter,
        status: AdminStatusFilter
    ) async throws -> AdminUsersPage {
        usersCalls.append((search, page, role, badge, status))
        return try usersResult.get()
    }

    func setUserRole(id: String, role: AdminAssignableRole) async throws {
        setUserRoleCalls.append((id, role))
        if let mutationError { throw mutationError }
    }

    func setUserBadge(id: String, badge: AdminBadgeType?) async throws {
        setUserBadgeCalls.append((id, badge))
        if let mutationError { throw mutationError }
    }

    @discardableResult
    func toggleBan(userId: String) async throws -> Bool {
        toggleBanCalls.append(userId)
        if let mutationError { throw mutationError }
        return try banToggleResult.get()
    }

    func deleteUser(id: String) async throws {
        deleteUserCalls.append(id)
        if let mutationError { throw mutationError }
    }

    func reports(status: AdminReportStatusFilter, page: Int) async throws -> AdminReportsPage {
        reportsCalls.append((status, page))
        return try reportsResult.get()
    }

    func setReportStatus(
        id: String,
        status: AdminReportStatusFilter,
        actionType: AdminReportActionType?,
        actionNote: String?
    ) async throws {
        setReportStatusCalls.append((id, status, actionType, actionNote))
        if let mutationError { throw mutationError }
    }

    func deleteReport(id: String) async throws {
        deleteReportCalls.append(id)
        if let mutationError { throw mutationError }
    }

    func appeals(status: AdminAppealStatusFilter, page: Int) async throws -> AdminAppealsPage {
        appealsCalls.append((status, page))
        return try appealsResult.get()
    }

    func resolveAppeal(id: String, decision: AdminAppealDecision, resolutionNote: String) async throws {
        resolveAppealCalls.append((id, decision, resolutionNote))
        if let mutationError { throw mutationError }
    }

    func posts(search: String, page: Int) async throws -> AdminPostsPage {
        postsCalls.append((search, page))
        return try postsResult.get()
    }

    func deletePost(id: String) async throws {
        deletePostCalls.append(id)
        if let mutationError { throw mutationError }
    }

    // MARK: - Review queues / Ads / Withdrawals / People / Ops / News
    //
    // Minimal conforming stubs for the phase-2 protocol surface, added
    // once phase 2 extended `AdminRepositoryProtocol` well past what
    // phase 1's tests exercise - this mock must keep conforming or the
    // whole test target stops compiling. No call-recording arrays here
    // (nothing in this file's existing tests needs them); add some the
    // same way the phase-1 ones above do, if/when tests are written
    // against these ViewModels.

    var reviewQueueError: Error?

    func marketplaceListings(status: AdminReviewStatusFilter, page: Int) async throws -> AdminPageResult<AdminMarketplaceListing> {
        AdminPageResult(items: [], total: 0, page: 1, totalPages: 1)
    }
    func reviewMarketplaceListing(id: String, action: AdminReviewAction, rejectionReason: String?) async throws {
        if let reviewQueueError { throw reviewQueueError }
    }
    func opportunityListings(status: AdminReviewStatusFilter, page: Int) async throws -> AdminPageResult<AdminOpportunityListing> {
        AdminPageResult(items: [], total: 0, page: 1, totalPages: 1)
    }
    func reviewOpportunityListing(id: String, action: AdminReviewAction, rejectionReason: String?) async throws {
        if let reviewQueueError { throw reviewQueueError }
    }
    func helpCampaigns(status: AdminReviewStatusFilter, page: Int) async throws -> AdminPageResult<AdminHelpCampaignReview> {
        AdminPageResult(items: [], total: 0, page: 1, totalPages: 1)
    }
    func reviewHelpCampaign(id: String, action: AdminReviewAction, rejectionReason: String?) async throws {
        if let reviewQueueError { throw reviewQueueError }
    }

    func adCampaigns(status: AdminAdStatusFilter, page: Int) async throws -> AdminPageResult<AdminAdCampaign> {
        AdminPageResult(items: [], total: 0, page: 1, totalPages: 1)
    }
    func reviewAdCampaign(id: String, action: AdminAdAction, rejectionReason: String?, adminNote: String?) async throws {
        if let reviewQueueError { throw reviewQueueError }
    }

    func creatorWithdrawals(status: AdminWithdrawalStatusFilter) async throws -> [AdminCreatorWithdrawal] { [] }
    func approveCreatorWithdrawal(id: String) async throws -> ApiResult { .success }
    func rejectCreatorWithdrawal(id: String) async throws {}
    func helpWithdrawals(status: AdminWithdrawalStatusFilter) async throws -> [AdminHelpWithdrawal] { [] }
    func approveHelpWithdrawal(id: String) async throws -> ApiResult { .success }
    func rejectHelpWithdrawal(id: String) async throws {}

    func journalists(status: AdminJournalistStatusFilter, search: String, page: Int) async throws -> AdminJournalistsPage {
        AdminJournalistsPage(profiles: [], counts: [:], pagination: .init(page: 1, totalPages: 1, total: 0))
    }
    func grantJournalist(username: String) async throws {}
    func reviewJournalist(userId: String, action: AdminJournalistAction, reason: String?) async throws {}

    func musicArtists(status: AdminMusicArtistStatusFilter, search: String, page: Int) async throws -> AdminMusicArtistsPage {
        AdminMusicArtistsPage(artists: [], total: 0, page: 1, totalPages: 1)
    }
    func setMusicArtistVerified(id: String, verified: Bool) async throws {}
    func deleteMusicArtist(id: String) async throws {}

    func ambassadors(status: AdminAmbassadorStatusFilter, search: String, page: Int) async throws -> AdminAmbassadorsPage {
        AdminAmbassadorsPage(profiles: [], counts: [:], pagination: .init(page: 1, totalPages: 1, total: 0))
    }
    func reviewAmbassador(userId: String, action: AdminAmbassadorAction, reason: String?) async throws {}

    func supportTickets(status: AdminTicketStatusFilter, search: String, page: Int) async throws -> AdminSupportTicketsPage {
        AdminSupportTicketsPage(tickets: [], pagination: .init(page: 1, pages: 1, total: 0))
    }
    func supportTicketStats() async throws -> AdminSupportTicketStats {
        AdminSupportTicketStats(open: 0, inProgress: 0, awaitingReply: 0, resolved: 0, total: 0)
    }
    func supportTicket(id: String) async throws -> AdminSupportTicketDetail {
        AdminSupportTicketDetail(
            id: id, subject: "", message: "", category: "GENERAL", priority: "NORMAL", status: "OPEN",
            createdAt: Date(), resolution: nil, resolvedAt: nil,
            user: .init(id: "u1", username: "user", email: nil, avatarUrl: nil, plan: nil, createdAt: Date()),
            assignedAdmin: nil, replies: []
        )
    }
    func setSupportTicketStatus(id: String, status: String) async throws {}
    func replySupportTicket(id: String, message: String, isInternal: Bool) async throws {}
    func resolveSupportTicket(id: String, resolution: String?) async throws {}
    func deleteSupportTicket(id: String) async throws {}

    func analytics(range: AdminAnalyticsRange) async throws -> AdminAnalytics {
        AdminAnalytics(
            range: range.rawValue,
            summary: .init(users: 0, posts: 0, comments: 0, likes: 0, reposts: 0),
            daily: [],
            topPosts: [],
            engagement: .init(avgLikesPerPost: 0, avgCommentsPerPost: 0, totalLikes: 0, totalComments: 0, totalPosts: 0)
        )
    }

    func analyticsGeography(range: AdminAnalyticsRange) async throws -> AdminAnalyticsGeographyResponse {
        AdminAnalyticsGeographyResponse(
            range: range.rawValue,
            geography: .init(byCountry: [], byRegion: [], newUsersByCountry: [], unknownCountryCount: 0),
            acquisition: .init(bySource: []),
            platform: .init(byPlatform: []),
            language: .init(byLanguage: [])
        )
    }

    func auditLog(action: String, targetType: String, targetId: String, cursor: String?) async throws -> AdminAuditLogPage {
        AdminAuditLogPage(entries: [], nextCursor: nil)
    }

    func charityDisbursements() async throws -> [AdminCharityDisbursement] { [] }
    func recordCharityDisbursement(
        beneficiaryName: String,
        cause: AdminCharityCause,
        amount: Double,
        currency: String,
        disbursedAt: Date,
        note: String?,
        proofUrl: String?
    ) async throws {}

    func subscriptions(search: String, plan: String, status: String, page: Int) async throws -> AdminSubscriptionsPage {
        AdminSubscriptionsPage(
            overview: .init(
                active: 0, expired: 0, canceled: 0, pending: 0, expiringWithin7Days: 0, expiringWithin30Days: 0,
                failedPayments: 0, paidUsers: 0, freeUsers: 0, needsReconciliation: 0
            ),
            subscriptions: [],
            pagination: .init(page: 1, totalPages: 1, total: 0)
        )
    }
    func subscription(userId: String) async throws -> AdminSubscriptionDetail {
        AdminSubscriptionDetail(
            user: .init(id: userId, username: "user", email: nil, name: nil, plan: "free", badgeType: nil, createdAt: Date()),
            subscription: nil
        )
    }
    func grantSubscription(userId: String, plan: AdminGrantablePlan, billingInterval: AdminBillingInterval) async throws {}
    func cancelSubscription(userId: String, reason: String?) async throws {}
    func restoreSubscription(userId: String) async throws {}

    func pendingPayments() async throws -> [AdminPaymentRequest] { [] }
    func verifyPayment(id: String) async throws {}

    func upgradeRequests(status: AdminUpgradeRequestStatusFilter) async throws -> [AdminUpgradeRequest] { [] }
    func approveUpgradeRequest(id: String, billingInterval: AdminBillingInterval) async throws {}
    func denyUpgradeRequest(id: String) async throws {}

    func scanStorage() async throws -> AdminStorageScanResult {
        AdminStorageScanResult(
            totalFilesInUploadThing: 0, totalReferencedInDb: 0, nonUploadedStatusCount: 0,
            orphanedCount: 0, orphanedSizeMB: 0, heldForReviewCount: 0, heldForReviewSizeMB: 0
        )
    }
    func cleanUpStorage() async throws -> AdminStorageCleanupResult {
        AdminStorageCleanupResult(orphanedCount: 0, orphanedSizeMB: 0, heldForReviewCount: 0, deleted: 0)
    }

    func newsArticles(status: AdminNewsStatusFilter, search: String, page: Int) async throws -> AdminNewsArticlesPage {
        AdminNewsArticlesPage(articles: [], pagination: .init(page: 1, totalPages: 1, total: 0))
    }
    func newsArticle(id: String) async throws -> AdminNewsArticle {
        AdminNewsArticle(
            id: id, title: "", slug: "", excerpt: nil, content: "", coverImage: nil, sourceName: nil, sourceUrl: nil,
            category: "WORLD", status: "DRAFT", views: 0, featured: false, publishedAt: nil, submittedAt: nil,
            reviewNote: nil, reviewedAt: nil, createdAt: Date(), author: AdminActorRef(id: "u1", username: "author", name: nil)
        )
    }
    func createNewsArticle(_ draft: AdminNewsArticleDraft) async throws -> AdminNewsArticle {
        try await newsArticle(id: "new")
    }
    func updateNewsArticle(id: String, _ draft: AdminNewsArticleDraft) async throws -> AdminNewsArticle {
        try await newsArticle(id: id)
    }
    func deleteNewsArticle(id: String) async throws {}

    func newsNetworkStatus() async throws -> AdminNewsNetworkStatus {
        AdminNewsNetworkStatus(
            status: .init(
                paused: false, lastCycleAt: nil, nextCycleAt: nil, requireHumanReviewForSensitive: false,
                enabledLanguages: [], maxPublicationsPerCycle: 0, maxPublicationsPerDay: 0, minMinutesBetweenPublications: 0
            ),
            lastRun: nil,
            feeds: .init(total: 0, enabled: 0),
            publications: .init(today: 0, scheduled: 0, failed: 0),
            stories: .init(ready: 0, pendingSensitiveReview: 0),
            duplicatesPreventedToday: 0,
            sourceHealth: .init(healthy: 0, warning: 0, failed: 0, disabled: 0)
        )
    }
    func setNewsNetworkPaused(_ paused: Bool) async throws {}
    func runNewsNetworkCycle() async throws -> AdminNewsNetworkRunResult {
        AdminNewsNetworkRunResult(result: .init(ran: false, reason: "stub", published: nil, scheduled: nil))
    }
}

/// A minimal `Error` with a stable message, for tests that just need
/// *something* other than the real `ApiError` cases.
struct StubError: Error, Equatable {
    let message: String
}
