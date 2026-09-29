import XCTest
@testable import ZRPSocial

/// Coverage for `DiscoverViewModel` (the vertical video feed, `GET
/// /api/discover`) - pagination, optimistic like/repost/save/follow, and
/// playback-progress clamping. Task #3's Discover/Explore parity audit
/// found only the pure watch-event decision logic
/// (`DiscoverWatchEventsTests.swift`) was tested; the ViewModel itself -
/// paging, toggles, error handling - had none. Follows the same stub-
/// repository pattern `PlayDuelsViewModelTests.swift`,
/// `HomeViewModelTests.swift` and `ExploreViewModelTests.swift` already
/// established. Toggle methods (`toggleLike`/`toggleRepost`/etc.) apply
/// their optimistic mutation synchronously before spawning a
/// reconciliation `Task`, so their immediate effect is asserted directly
/// without awaiting anything.
@MainActor
final class DiscoverViewModelTests: XCTestCase {

    private final class StubDiscoverRepository: DiscoverRepositoryProtocol, @unchecked Sendable {
        var feedResults: [Result<DiscoverPage, Error>] = [.success(DiscoverPage(items: [], nextCursor: nil))]
        private var feedCallIndex = 0

        func feed(cursor: String?) async throws -> DiscoverPage {
            let result = feedResults[min(feedCallIndex, feedResults.count - 1)]
            feedCallIndex += 1
            switch result {
            case .success(let page): return page
            case .failure(let error): throw error
            }
        }
        func recordEvent(postId: String, eventType: DiscoverEventType, watchedMs: Int?) async {}
        func markNotInterested(postId: String) async throws -> Bool { fatalError("not exercised by these tests") }
        func toggleLike(postId: String) async throws -> Bool { true }
        func toggleRepost(postId: String) async throws -> Bool { true }
        func toggleSave(postId: String) async throws -> Bool { true }
        func toggleFollow(username: String) async throws -> FollowToggleResponse {
            FollowToggleResponse(following: true, requested: false, message: nil)
        }
        func muteCreator(userId: String) async throws -> Bool { fatalError("not exercised by these tests") }
        func blockCreator(username: String) async throws -> Bool { fatalError("not exercised by these tests") }
        func nearbyPeople(limit: Int) async throws -> NearbyPeoplePage { fatalError("not exercised by these tests") }
    }

    private static func makeItem(id: String, authorId: String = "author-1", liked: Bool = false, reposted: Bool = false, saved: Bool = false, likes: Int = 0, reposts: Int = 0) -> DiscoverItem {
        DiscoverItem(
            id: id,
            author: DiscoverAuthor(id: authorId, username: "leonidas", name: "Leonidas", avatarUrl: nil, badgeType: nil),
            media: DiscoverMedia(url: "https://cdn.zrp.one/video.mp4", type: "video"),
            caption: "Hello Discover",
            stats: DiscoverStats(likes: likes, comments: 0, reposts: reposts, saves: 0, views: 0),
            viewerState: DiscoverViewerState(liked: liked, saved: saved, reposted: reposted, followsAuthor: false),
            commentsEnabled: true,
            createdAt: Date(timeIntervalSince1970: 0),
            reason: "recent",
            premiumPost: nil
        )
    }

    // ---- Pagination ----

    func testLoadIfNeededLoadsTheFirstPage() async {
        let repository = StubDiscoverRepository()
        repository.feedResults = [.success(DiscoverPage(items: [Self.makeItem(id: "1"), Self.makeItem(id: "2")], nextCursor: "cursor-2"))]
        let viewModel = DiscoverViewModel(repository: repository)

        await viewModel.loadIfNeeded()

        XCTAssertEqual(viewModel.phase, .loaded)
        XCTAssertEqual(viewModel.items.map(\.id), ["1", "2"])
        XCTAssertTrue(viewModel.hasMore)
    }

    func testLoadIfNeededIsANoOpOnceAlreadyLoaded() async {
        let repository = StubDiscoverRepository()
        repository.feedResults = [.success(DiscoverPage(items: [Self.makeItem(id: "1")], nextCursor: nil))]
        let viewModel = DiscoverViewModel(repository: repository)
        await viewModel.loadIfNeeded()

        // A second feed result queued, but loadIfNeeded must not fetch it -
        // it only fires once, from .idle.
        repository.feedResults.append(.success(DiscoverPage(items: [Self.makeItem(id: "2")], nextCursor: nil)))
        await viewModel.loadIfNeeded()

        XCTAssertEqual(viewModel.items.map(\.id), ["1"])
    }

    func testLoadMoreAppendsWithinTwoItemsOfTheEndAndRespectsHasMore() async {
        let repository = StubDiscoverRepository()
        repository.feedResults = [
            .success(DiscoverPage(items: [Self.makeItem(id: "1"), Self.makeItem(id: "2")], nextCursor: "cursor-2")),
            .success(DiscoverPage(items: [Self.makeItem(id: "3")], nextCursor: nil)),
        ]
        let viewModel = DiscoverViewModel(repository: repository)
        await viewModel.loadIfNeeded()

        await viewModel.loadMoreIfNeeded(currentId: "2") // index 1 of 2 -> within two of the end

        XCTAssertEqual(viewModel.items.map(\.id), ["1", "2", "3"])
        XCTAssertFalse(viewModel.hasMore)
    }

    func testLoadMoreDoesNothingWhileFarFromTheEnd() async {
        let repository = StubDiscoverRepository()
        repository.feedResults = [
            .success(DiscoverPage(items: (1...5).map { Self.makeItem(id: "\($0)") }, nextCursor: "cursor-2")),
        ]
        let viewModel = DiscoverViewModel(repository: repository)
        await viewModel.loadIfNeeded()

        await viewModel.loadMoreIfNeeded(currentId: "1") // far from the end of 5 items

        XCTAssertEqual(viewModel.items.count, 5)
    }

    func testAFirstPageFailureWithNothingOnScreenBecomesTheFailedPhase() async {
        let repository = StubDiscoverRepository()
        repository.feedResults = [.failure(ApiError.transport(underlying: "offline"))]
        let viewModel = DiscoverViewModel(repository: repository)

        await viewModel.loadIfNeeded()

        XCTAssertEqual(viewModel.phase, .failed(.transport(underlying: "offline")))
        XCTAssertTrue(viewModel.items.isEmpty)
    }

    func testAFailedPageTwoFetchLeavesTheFeedExactlyAsItWas() async {
        let repository = StubDiscoverRepository()
        repository.feedResults = [
            .success(DiscoverPage(items: [Self.makeItem(id: "1"), Self.makeItem(id: "2")], nextCursor: "cursor-2")),
            .failure(ApiError.transport(underlying: "offline")),
        ]
        let viewModel = DiscoverViewModel(repository: repository)
        await viewModel.loadIfNeeded()

        await viewModel.loadMoreIfNeeded(currentId: "2")

        XCTAssertEqual(viewModel.phase, .loaded)
        XCTAssertEqual(viewModel.items.map(\.id), ["1", "2"])
    }

    // ---- Optimistic toggles (immediate, synchronous effect) ----

    /// Builds a ViewModel already loaded with `items`, via a real
    /// `loadIfNeeded()` call against a repository configured to answer
    /// with exactly those items - the same path production code takes,
    /// rather than reaching into private state.
    private func loadedViewModel(with items: [DiscoverItem]) async -> DiscoverViewModel {
        let repository = StubDiscoverRepository()
        repository.feedResults = [.success(DiscoverPage(items: items, nextCursor: nil))]
        let viewModel = DiscoverViewModel(repository: repository)
        await viewModel.loadIfNeeded()
        return viewModel
    }

    func testTogglingLikeFlipsLikedAndIncrementsTheCount() async {
        let item = Self.makeItem(id: "1", liked: false, likes: 4)
        let viewModel = await loadedViewModel(with: [item])

        viewModel.toggleLike(item)

        XCTAssertTrue(viewModel.items[0].viewerState.liked)
        XCTAssertEqual(viewModel.items[0].stats.likes, 5)
    }

    func testUnlikingNeverDrivesTheLikeCountNegative() async {
        let item = Self.makeItem(id: "1", liked: true, likes: 0)
        let viewModel = await loadedViewModel(with: [item])

        viewModel.toggleLike(item)

        XCTAssertEqual(viewModel.items[0].stats.likes, 0)
    }

    func testTogglingRepostFlipsRepostedAndIncrementsTheCount() async {
        let item = Self.makeItem(id: "1", reposted: false, reposts: 2)
        let viewModel = await loadedViewModel(with: [item])

        viewModel.toggleRepost(item)

        XCTAssertTrue(viewModel.items[0].viewerState.reposted)
        XCTAssertEqual(viewModel.items[0].stats.reposts, 3)
    }

    func testTogglingSaveFlipsSaved() async {
        let item = Self.makeItem(id: "1", saved: false)
        let viewModel = await loadedViewModel(with: [item])

        viewModel.toggleSave(item)

        XCTAssertTrue(viewModel.items[0].viewerState.saved)
    }

    func testFollowStateReflectsTheOptimisticOverrideImmediately() async {
        let item = Self.makeItem(id: "1", authorId: "author-1")
        let viewModel = await loadedViewModel(with: [item])

        XCTAssertEqual(viewModel.followState(for: item), .none)
        viewModel.toggleFollow(item)
        XCTAssertEqual(viewModel.followState(for: item), .following)
    }

    func testFollowingOneItemFromACreatorAppearingTwiceIsReflectedForBoth() async {
        let first = Self.makeItem(id: "1", authorId: "author-1")
        let second = Self.makeItem(id: "2", authorId: "author-1")
        let viewModel = await loadedViewModel(with: [first, second])

        viewModel.toggleFollow(first)

        XCTAssertEqual(viewModel.followState(for: first), .following)
        XCTAssertEqual(viewModel.followState(for: second), .following)
    }

    // ---- Playback progress ----

    func testPlaybackProgressComputesAFractionClampedBetweenZeroAndOne() async {
        let item = Self.makeItem(id: "1")
        let viewModel = await loadedViewModel(with: [item])

        viewModel.playbackProgress(postId: "1", currentPosition: 5, duration: 10)
        XCTAssertEqual(viewModel.activeProgress, 0.5, accuracy: 0.0001)

        viewModel.playbackProgress(postId: "1", currentPosition: 20, duration: 10)
        XCTAssertEqual(viewModel.activeProgress, 1, accuracy: 0.0001)
    }

    func testPlaybackProgressIgnoresANonPositiveOrNonFiniteDuration() async {
        let item = Self.makeItem(id: "1")
        let viewModel = await loadedViewModel(with: [item])
        viewModel.playbackProgress(postId: "1", currentPosition: 5, duration: 10)
        XCTAssertEqual(viewModel.activeProgress, 0.5, accuracy: 0.0001)

        // A degenerate duration must not corrupt the already-known progress.
        viewModel.playbackProgress(postId: "1", currentPosition: 1, duration: 0)
        XCTAssertEqual(viewModel.activeProgress, 0.5, accuracy: 0.0001)
    }
}
