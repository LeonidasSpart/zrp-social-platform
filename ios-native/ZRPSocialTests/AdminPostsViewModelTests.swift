import XCTest
@testable import ZRPSocial

@MainActor
final class AdminPostsViewModelTests: XCTestCase {

    func testLoadIfNeededPopulatesPosts() async {
        let mock = MockAdminRepository()
        mock.postsResult = .success(
            AdminPostsPage(posts: [AdminFixtures.post(id: "p1"), AdminFixtures.post(id: "p2")], total: 2, page: 1, totalPages: 1)
        )
        let viewModel = AdminPostsViewModel(repository: mock)

        await viewModel.loadIfNeeded()

        XCTAssertEqual(viewModel.posts.map(\.id), ["p1", "p2"])
    }

    /// Unlike Users/Reports/Appeals, a deleted post has no updated row to
    /// re-fetch - the view model removes it from the in-memory list
    /// directly rather than reloading, so this pins down that it does
    /// exactly that and nothing else.
    func testDeleteRemovesPostLocallyWithoutReloading() async {
        let mock = MockAdminRepository()
        mock.postsResult = .success(
            AdminPostsPage(posts: [AdminFixtures.post(id: "p1"), AdminFixtures.post(id: "p2")], total: 2, page: 1, totalPages: 1)
        )
        let viewModel = AdminPostsViewModel(repository: mock)
        await viewModel.loadIfNeeded()
        let callsBefore = mock.postsCalls.count

        let ok = await viewModel.delete(AdminFixtures.post(id: "p1"))

        XCTAssertTrue(ok)
        XCTAssertEqual(viewModel.posts.map(\.id), ["p2"])
        XCTAssertEqual(mock.deletePostCalls, ["p1"])
        XCTAssertEqual(mock.postsCalls.count, callsBefore, "deleting a post must not re-fetch the list")
    }

    func testDeleteFailureLeavesPostInPlace() async {
        let mock = MockAdminRepository()
        mock.postsResult = .success(
            AdminPostsPage(posts: [AdminFixtures.post(id: "p1")], total: 1, page: 1, totalPages: 1)
        )
        mock.mutationError = ApiError.forbidden(message: nil, code: nil)
        let viewModel = AdminPostsViewModel(repository: mock)
        await viewModel.loadIfNeeded()

        let ok = await viewModel.delete(AdminFixtures.post(id: "p1"))

        XCTAssertFalse(ok)
        XCTAssertEqual(viewModel.posts.map(\.id), ["p1"])
    }

    func testSearchTextTriggersDebouncedReload() async throws {
        let mock = MockAdminRepository()
        let viewModel = AdminPostsViewModel(repository: mock)
        await viewModel.loadIfNeeded()
        let callsBefore = mock.postsCalls.count

        viewModel.searchText = "hello world"
        // The debounce is 350ms; wait comfortably past it rather than
        // asserting immediately, which would just test that it *isn't*
        // instant (already obviously true) instead of that it eventually
        // fires.
        try await Task.sleep(nanoseconds: 600_000_000)

        XCTAssertGreaterThan(mock.postsCalls.count, callsBefore)
        XCTAssertEqual(mock.postsCalls.last?.search, "hello world")
    }
}
