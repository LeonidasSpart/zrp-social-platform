import XCTest
@testable import ZRPSocial

@MainActor
final class AdminAppealsViewModelTests: XCTestCase {

    func testLoadIfNeededDefaultsToPendingFilter() async {
        let mock = MockAdminRepository()
        let viewModel = AdminAppealsViewModel(repository: mock)

        await viewModel.loadIfNeeded()

        XCTAssertEqual(mock.appealsCalls.first?.status, .pending)
    }

    func testResolveForwardsDecisionAndNoteThenReloads() async {
        let mock = MockAdminRepository()
        let viewModel = AdminAppealsViewModel(repository: mock)
        await viewModel.loadIfNeeded()
        let callsBefore = mock.appealsCalls.count

        let ok = await viewModel.resolve(
            AdminFixtures.appeal(id: "a5"),
            decision: .overturned,
            resolutionNote: "action was disproportionate"
        )

        XCTAssertTrue(ok)
        let call = try? XCTUnwrap(mock.resolveAppealCalls.first)
        XCTAssertEqual(call?.id, "a5")
        XCTAssertEqual(call?.decision, .overturned)
        XCTAssertEqual(call?.note, "action was disproportionate")
        XCTAssertEqual(mock.appealsCalls.count, callsBefore + 1, "resolving must reload the current page")
    }

    /// A 409 (already resolved) must be shown, not swallowed - two staff
    /// members racing to resolve the same appeal should each see what
    /// actually happened.
    func testResolveConflictSurfacesServerMessage() async {
        let mock = MockAdminRepository()
        mock.mutationError = ApiError.server(status: 409, message: "This appeal was already resolved.", code: nil)
        let viewModel = AdminAppealsViewModel(repository: mock)

        let ok = await viewModel.resolve(AdminFixtures.appeal(), decision: .upheld, resolutionNote: "note")

        XCTAssertFalse(ok)
        XCTAssertEqual(viewModel.errorMessage, "This appeal was already resolved.")
    }

    func testFailedLoadWithNoExistingAppealsSurfacesError() async {
        let mock = MockAdminRepository()
        mock.appealsResult = .failure(ApiError.unauthorized)
        let viewModel = AdminAppealsViewModel(repository: mock)

        await viewModel.loadIfNeeded()

        guard case .failed(let error) = viewModel.phase else {
            return XCTFail("Expected .failed, got \(viewModel.phase)")
        }
        XCTAssertEqual(error, .unauthorized)
    }
}
