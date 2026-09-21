import XCTest
@testable import ZRPSocial

@MainActor
final class AdminUsersViewModelTests: XCTestCase {

    func testLoadIfNeededPopulatesUsersAndStats() async {
        let mock = MockAdminRepository()
        mock.usersResult = .success(
            AdminUsersPage(
                users: [AdminFixtures.user(id: "u1"), AdminFixtures.user(id: "u2")],
                total: 2,
                page: 1,
                totalPages: 1,
                stats: AdminUserStats(total: 2, active: 2, banned: 0, admins: 0, mods: 0)
            )
        )
        let viewModel = AdminUsersViewModel(repository: mock)

        await viewModel.loadIfNeeded()

        XCTAssertEqual(viewModel.users.map(\.id), ["u1", "u2"])
        XCTAssertEqual(viewModel.stats?.total, 2)
        XCTAssertEqual(viewModel.phase, .loaded)
        XCTAssertEqual(mock.usersCalls.count, 1)
    }

    /// `loadIfNeeded` must not issue a second request once the first has
    /// completed - it is called from `.task` on every appearance of the
    /// screen, and a paginated list re-fetching page 1 on every return
    /// visit would both waste a round trip and reset any scroll position.
    func testLoadIfNeededOnlyLoadsOnce() async {
        let mock = MockAdminRepository()
        let viewModel = AdminUsersViewModel(repository: mock)

        await viewModel.loadIfNeeded()
        await viewModel.loadIfNeeded()

        XCTAssertEqual(mock.usersCalls.count, 1)
    }

    func testFailedLoadWithNoExistingUsersSurfacesError() async {
        let mock = MockAdminRepository()
        mock.usersResult = .failure(ApiError.forbidden(message: "Forbidden", code: nil))
        let viewModel = AdminUsersViewModel(repository: mock)

        await viewModel.loadIfNeeded()

        guard case .failed(let error) = viewModel.phase else {
            return XCTFail("Expected .failed, got \(viewModel.phase)")
        }
        XCTAssertEqual(error, .forbidden(message: "Forbidden", code: nil))
    }

    func testReloadPassesCurrentFilters() async {
        let mock = MockAdminRepository()
        let viewModel = AdminUsersViewModel(repository: mock)
        // Each assignment below also schedules its own `reload()` via
        // `didSet`, but property mutation itself is synchronous and
        // completes before any of those scheduled tasks run - so by the
        // time anything actually calls `repository.users(...)`, every one
        // of them reads these same final filter values. The explicit
        // `reload()` below is just the call this test awaits directly.
        viewModel.roleFilter = .admin
        viewModel.badgeFilter = .verified
        viewModel.statusFilter = .banned

        await viewModel.reload()

        let last = try? XCTUnwrap(mock.usersCalls.last)
        XCTAssertEqual(last?.role, .admin)
        XCTAssertEqual(last?.badge, .verified)
        XCTAssertEqual(last?.status, .banned)
    }

    func testSetRoleReloadsOnSuccess() async {
        let mock = MockAdminRepository()
        let viewModel = AdminUsersViewModel(repository: mock)
        await viewModel.loadIfNeeded()
        let callsBefore = mock.usersCalls.count

        let ok = await viewModel.setRole(AdminFixtures.user(id: "u1"), to: .moderator)

        XCTAssertTrue(ok)
        XCTAssertEqual(mock.setUserRoleCalls.first?.id, "u1")
        XCTAssertEqual(mock.setUserRoleCalls.first?.role, .moderator)
        XCTAssertEqual(mock.usersCalls.count, callsBefore + 1, "a successful mutation must reload the list")
    }

    func testSetBadgeNilClearsBadge() async {
        let mock = MockAdminRepository()
        let viewModel = AdminUsersViewModel(repository: mock)

        _ = await viewModel.setBadge(AdminFixtures.user(id: "u1", badgeType: "verified"), to: nil)

        XCTAssertEqual(mock.setUserBadgeCalls.first?.id, "u1")
        XCTAssertNil(mock.setUserBadgeCalls.first?.badge)
    }

    func testMutationFailureSurfacesServerMessageAndDoesNotReload() async {
        let mock = MockAdminRepository()
        mock.mutationError = ApiError.forbidden(message: "Admins only.", code: nil)
        let viewModel = AdminUsersViewModel(repository: mock)
        await viewModel.loadIfNeeded()
        let callsBefore = mock.usersCalls.count

        let ok = await viewModel.delete(AdminFixtures.user(id: "u1"))

        XCTAssertFalse(ok)
        XCTAssertEqual(viewModel.errorMessage, "Admins only.")
        XCTAssertEqual(mock.usersCalls.count, callsBefore, "a failed mutation must not reload")
    }

    func testLoadMoreIfNeededFetchesNextPageNearEnd() async {
        let mock = MockAdminRepository()
        let firstPage = (1...20).map { AdminFixtures.user(id: "u\($0)") }
        mock.usersResult = .success(
            AdminUsersPage(
                users: firstPage,
                total: 40,
                page: 1,
                totalPages: 2,
                stats: AdminUserStats(total: 40, active: 40, banned: 0, admins: 0, mods: 0)
            )
        )
        let viewModel = AdminUsersViewModel(repository: mock)
        await viewModel.loadIfNeeded()

        mock.usersResult = .success(
            AdminUsersPage(
                users: (21...40).map { AdminFixtures.user(id: "u\($0)") },
                total: 40,
                page: 2,
                totalPages: 2,
                stats: AdminUserStats(total: 40, active: 40, banned: 0, admins: 0, mods: 0)
            )
        )

        // Near the end of the loaded page - should trigger page 2.
        await viewModel.loadMoreIfNeeded(currentUser: firstPage[18])

        XCTAssertEqual(viewModel.users.count, 40)
        XCTAssertEqual(mock.usersCalls.last?.page, 2)
    }

    func testLoadMoreIfNeededDoesNothingWhenNoMorePages() async {
        let mock = MockAdminRepository()
        let onlyPage = [AdminFixtures.user(id: "u1")]
        mock.usersResult = .success(
            AdminUsersPage(
                users: onlyPage,
                total: 1,
                page: 1,
                totalPages: 1,
                stats: AdminUserStats(total: 1, active: 1, banned: 0, admins: 0, mods: 0)
            )
        )
        let viewModel = AdminUsersViewModel(repository: mock)
        await viewModel.loadIfNeeded()
        let callsBefore = mock.usersCalls.count

        await viewModel.loadMoreIfNeeded(currentUser: onlyPage[0])

        XCTAssertEqual(mock.usersCalls.count, callsBefore)
    }
}
