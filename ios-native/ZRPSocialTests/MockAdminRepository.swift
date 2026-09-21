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
}

/// A minimal `Error` with a stable message, for tests that just need
/// *something* other than the real `ApiError` cases.
struct StubError: Error, Equatable {
    let message: String
}
