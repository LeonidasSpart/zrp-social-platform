import Foundation
import SwiftUI

/// Drives the two Home feed tabs.
///
/// Paging only. Everything about the viewer's relationship to a post -
/// likes, reposts, bookmarks, deletion - lives in the shared
/// `PostInteractionStore`, so this and every other timeline screen share
/// one implementation and one source of truth rather than each keeping
/// their own.
///
/// Each tab keeps its own posts, cursor, and phase, so switching between
/// For You and Following does not throw away a loaded timeline or fire a
/// redundant request for a feed that is already loaded.
@MainActor
final class HomeViewModel: ObservableObject {

    @Published var selectedTab: FeedTab = .forYou
    @Published private(set) var states: [FeedTab: FeedState] = [
        .forYou: FeedState(),
        .following: FeedState(),
    ]

    /// The sponsored post to interleave, if the route had one to serve.
    ///
    /// `nil` is the ordinary case, not a failure: the route answers with
    /// no ad whenever nothing is active, every active campaign has spent
    /// its budget, or the only eligible campaign belongs to the viewer.
    @Published private(set) var sponsoredAd: SponsoredAd?

    private let repository: PostsRepositoryProtocol
    private let ads: AdsRepositoryProtocol
    private var inFlight: [FeedTab: Task<Void, Never>] = [:]

    /// Fetched once per app run rather than per feed load.
    ///
    /// The route picks at random among eligible campaigns, so refetching
    /// on every pull-to-refresh would swap the ad under a reader mid-
    /// scroll and bill a second impression for what is, to them, the
    /// same slot. The website fetches once on mount too.
    private var hasRequestedAd = false

    /// Set by the view once, so page loads can record what they fetched.
    private weak var interactions: PostInteractionStore?

    init(
        repository: PostsRepositoryProtocol = PostsRepository(),
        ads: AdsRepositoryProtocol = AdsRepository()
    ) {
        self.repository = repository
        self.ads = ads
    }

    /// Asks for one ad, once.
    ///
    /// Failure is silence. An ad is not content anyone came for, and a
    /// feed that showed an error because its ad slot could not be filled
    /// would be worse than a feed with no ad in it.
    func loadSponsoredAdIfNeeded() async {
        guard !hasRequestedAd else { return }
        hasRequestedAd = true
        sponsoredAd = try? await ads.serve()
    }

    func attach(interactions: PostInteractionStore) {
        self.interactions = interactions
    }

    /// Places a just-created post at the top of both feeds.
    ///
    /// `POST /api/posts` returns the created post in full, so the
    /// composer's result is shown immediately rather than triggering a
    /// refetch that would also lose the reader's scroll position. A
    /// scheduled post is not inserted: it has `status: "scheduled"` and
    /// genuinely is not in any feed yet.
    func insertCreated(_ post: Post, interactions: PostInteractionStore) {
        for tab in FeedTab.allCases {
            var state = state(for: tab)
            guard state.phase == .loaded else { continue }
            guard !state.posts.contains(where: { $0.id == post.id }) else { continue }
            state.posts.insert(post, at: 0)
            states[tab] = state
        }
        interactions.seed([post], replacing: true)
    }

    func state(for tab: FeedTab) -> FeedState {
        states[tab] ?? FeedState()
    }

    var currentState: FeedState { state(for: selectedTab) }

    // MARK: - Loading

    /// Loads the tab's first page if it has never loaded. Safe to call on
    /// every appearance - it no-ops for an already-loaded tab.
    func loadIfNeeded(_ tab: FeedTab) {
        guard state(for: tab).phase == .idle else { return }
        load(tab, replacingExisting: true)
    }

    /// Pull to refresh. Runs to completion so SwiftUI keeps the spinner
    /// up until the new page has actually arrived.
    func refresh(_ tab: FeedTab) async {
        inFlight[tab]?.cancel()
        await performLoad(tab, cursor: nil, replacingExisting: true)
    }

    func retry(_ tab: FeedTab) {
        load(tab, replacingExisting: true)
    }

    /// Called as the last few rows come into view.
    func loadMoreIfNeeded(_ tab: FeedTab, currentPost: Post) {
        let state = state(for: tab)
        guard
            state.phase == .loaded,
            state.hasMore,
            !state.isLoadingMore,
            // Trigger three rows from the end rather than at the very
            // last one, so the next page is usually already in place by
            // the time the viewer reaches it.
            let index = state.posts.firstIndex(where: { $0.id == currentPost.id }),
            index >= state.posts.count - 3
        else { return }

        load(tab, replacingExisting: false)
    }

    private func load(_ tab: FeedTab, replacingExisting: Bool) {
        inFlight[tab]?.cancel()
        let cursor = replacingExisting ? nil : states[tab]?.cursor
        inFlight[tab] = Task { [weak self] in
            await self?.performLoad(tab, cursor: cursor, replacingExisting: replacingExisting)
        }
    }

    private func performLoad(_ tab: FeedTab, cursor: String?, replacingExisting: Bool) async {
        var state = state(for: tab)
        if replacingExisting {
            // Only show the full-screen loading state when there is
            // nothing to show yet; a refresh over existing content keeps
            // that content visible under the refresh control.
            if state.posts.isEmpty { state.phase = .loading }
        } else {
            state.isLoadingMore = true
        }
        states[tab] = state

        do {
            let page = try await repository.feed(tab, cursor: cursor)
            guard !Task.isCancelled else { return }

            var updated = self.state(for: tab)
            if replacingExisting {
                updated.posts = page.posts
            } else {
                // The explore feed pages by offset into a cached ranked
                // list, which can shift between pages and re-serve a post
                // already on screen. De-duplicating by id keeps SwiftUI's
                // identity stable rather than crashing on a duplicate.
                let existing = Set(updated.posts.map(\.id))
                updated.posts.append(contentsOf: page.posts.filter { !existing.contains($0.id) })
            }
            updated.cursor = page.nextCursor
            updated.phase = .loaded
            updated.isLoadingMore = false
            states[tab] = updated

            interactions?.seed(page.posts, replacing: replacingExisting)
        } catch ApiError.cancelled {
            var updated = self.state(for: tab)
            updated.isLoadingMore = false
            states[tab] = updated
        } catch {
            guard !Task.isCancelled else { return }
            var updated = self.state(for: tab)
            updated.isLoadingMore = false
            // A failed "load more" must not wipe a timeline already on
            // screen - only a first-page failure becomes the error state.
            if updated.posts.isEmpty {
                updated.phase = .failed(error as? ApiError ?? .transport(underlying: "\(error)"))
            } else {
                updated.phase = .loaded
                interactions?.actionError = (error as? ApiError)?.userFacingMessage
            }
            states[tab] = updated
        }
    }
}
