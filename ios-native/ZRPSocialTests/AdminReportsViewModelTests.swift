import XCTest
@testable import ZRPSocial

@MainActor
final class AdminReportsViewModelTests: XCTestCase {

    func testLoadIfNeededDefaultsToPendingFilter() async {
        let mock = MockAdminRepository()
        let viewModel = AdminReportsViewModel(repository: mock)

        await viewModel.loadIfNeeded()

        XCTAssertEqual(mock.reportsCalls.first?.status, .pending)
    }

    func testChangingStatusFilterReloads() async {
        let mock = MockAdminRepository()
        let viewModel = AdminReportsViewModel(repository: mock)
        await viewModel.loadIfNeeded()

        viewModel.statusFilter = .actioned
        // `didSet` schedules the reload asynchronously; yield once so it
        // runs before asserting.
        await Task.yield()
        await viewModel.reload()

        XCTAssertTrue(mock.reportsCalls.contains { $0.status == .actioned })
    }

    /// Recording an action sends the exact label and note chosen, and the
    /// requested status - `setStatus` is the one call the report action
    /// sheet makes, so its arguments reaching the repository unmodified
    /// matters more here than anywhere else in this screen.
    func testSetStatusActionedForwardsActionTypeAndNote() async {
        let mock = MockAdminRepository()
        let viewModel = AdminReportsViewModel(repository: mock)
        let report = AdminFixtures.report(id: "r7")

        let ok = await viewModel.setStatus(report, to: .actioned, actionType: .banUser, actionNote: "3rd offense")

        XCTAssertTrue(ok)
        let call = try? XCTUnwrap(mock.setReportStatusCalls.first)
        XCTAssertEqual(call?.id, "r7")
        XCTAssertEqual(call?.status, .actioned)
        XCTAssertEqual(call?.actionType, .banUser)
        XCTAssertEqual(call?.actionNote, "3rd offense")
    }

    func testDeleteFailureSurfacesServerMessage() async {
        let mock = MockAdminRepository()
        mock.mutationError = ApiError.server(status: 409, message: "Resolve, dismiss, or action this report before deleting it.", code: nil)
        let viewModel = AdminReportsViewModel(repository: mock)

        let ok = await viewModel.delete(AdminFixtures.report(id: "r1", status: "pending"))

        XCTAssertFalse(ok)
        XCTAssertEqual(viewModel.errorMessage, "Resolve, dismiss, or action this report before deleting it.")
    }

    func testLoadMoreIfNeededDoesNothingWhenNoMorePages() async {
        let mock = MockAdminRepository()
        let reports = [AdminFixtures.report(id: "r1")]
        mock.reportsResult = .success(AdminReportsPage(reports: reports, total: 1, page: 1, totalPages: 1))
        let viewModel = AdminReportsViewModel(repository: mock)
        await viewModel.loadIfNeeded()
        let callsBefore = mock.reportsCalls.count

        await viewModel.loadMoreIfNeeded(currentReport: reports[0])

        XCTAssertEqual(mock.reportsCalls.count, callsBefore)
    }
}
