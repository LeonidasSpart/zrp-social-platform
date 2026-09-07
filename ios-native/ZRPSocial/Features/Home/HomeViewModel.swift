import Foundation
import SwiftUI

/// Drives the two Home feed tabs.
///
/// Each tab keeps its own posts, cursor, and phase, so switching between
/// For You and Following does not throw away a loaded timeline or the
/// user's scroll position - and does not fire a redundant request for a
/// feed that is already loaded.
@MainActor
final class HomeViewModel: ObservableObject {

    @Published var selectedTab: FeedTab = .forYou
    @Published private(set) var states: [FeedTab: FeedState] = [
        .forYou: FeedState(),
        .following: FeedState(),
    ]

    /// Keyed by post id and shared across both tabs, so liking a post in
    /// For You is reflected if the same post appears under Following.
    @Published private(set) var interactions: [String: PostInteraction] = [:]

    /// Set when an action (not a page load) failed, for a transient
    /// message that does not replace the whole timeline with an error.
    @Published var actionError: String?

    private let repository: PostsRepositoryProtocol
    private var inFlight: [FeedTab: Task<Void, Never>] = [:]

    init(repository: PostsRepositoryProtocol = PostsRepository()) {
        self.repository = repository
    }

    var currentState: FeedState {
        states[selectedTab] ?? FeedState()
    }

    func interaction(for post: Post) -> PostInteraction {
        interactions[post.id] ?? PostInteraction(post: post)
    }

    // MARK: - Loading

    /// Loads the tab's first page if it has never loaded. Safe to call on
    /// every appearance - it no-ops for an already-loaded tab.
    func loadIfNeeded(_ tab: FeedTab) {
        let state = states[tab] ?? FeedState()
        guard state.phase == .idle else { return }
        load(tab, replacingExisting: true)
    }

    /// Pull to refresh. Runs to completion so SwiftUI keeps the spinner up
    /// until the new page has actually arrived.
    func refresh(_ tab: FeedTab) async {
        inFlight[tab]?.cancel()
        await performLoad(tab, cursor: nil, replacingExisting: true)
    }

    func retry(_ tab: FeedTab) {
        load(tab, replacingExisting: true)
    }

    /// Called as the last few rows come into view.
    func loadMoreIfNeeded(_ tab: FeedTab, currentPost: Post) {
        let state = states[tab] ?? FeedState()
        guard
            state.phase == .loaded,
            state.hasMore,
            !state.isLoadingMore,
            // Trigger three rows from the end rather than at the very
            // last one, so the next page is usually already in place by
            // the time the user reaches it.
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
        var state = states[tab] ?? FeedState()
        if replacingExisting {
            // Only show the full-screen loading state when there is
            // nothing to show yet; a refresh over existing content keeps
            // the content visible under the refresh control.
            if state.posts.isEmpty { state.phase = .loading }
        } else {
            state.isLoadingMore = true
        }
        states[tab] = state

        do {
            let page = try await repository.feed(tab, cursor: cursor)
            guard !Task.isCancelled else { return }

            var updated = states[tab] ?? FeedState()
            if replacingExisting {
                updated.posts = page.posts
            } else {
                // The explore feed pages by offset into a cached ranked
                // list, which can shift between pages and re-serve a post
                // already on screen. De-duplicating by id keeps SwiftUI's
                // identity stable instead of crashing on a duplicate.
                let existing = Set(updated.posts.map(\.id))
                updated.posts.append(contentsOf: page.posts.filter { !existing.contains($0.id) })
            }
            updated.cursor = page.nextCursor
            updated.phase = .loaded
            updated.isLoadingMore = false
            states[tab] = updated

            seedInteractions(from: page.posts, replacing: replacingExisting)
        } catch ApiError.cancelled {
            var updated = states[tab] ?? FeedState()
            updated.isLoadingMore = false
            states[tab] = updated
        } catch {
            guard !Task.isCancelled else { return }
            var updated = states[tab] ?? FeedState()
            updated.isLoadingMore = false
            // A failed "load more" must not wipe a timeline that is
            // already on screen - only a first-page failure becomes the
            // error state.
            if updated.posts.isEmpty {
                updated.phase = .failed(error as? ApiError ?? .transport(underlying: "\(error)"))
            } else {
                updated.phase = .loaded
                actionError = (error as? ApiError)?.userFacingMessage
            }
            states[tab] = updated
        }
    }

    /// Seeds interaction state from a freshly fetched page.
    ///
    /// A refresh resets `liked` and the counts to what the server just
    /// said. Locally-known repost and bookmark flags are preserved,
    /// because the feed response does not carry them - dropping them would
    /// visibly un-highlight a post the user just reposted.
    private func seedInteractions(from posts: [Post], replacing: Bool) {
        for post in posts {
            var seeded = PostInteraction(post: post)
            if let existing = interactions[post.id] {
                seeded.reposted = existing.reposted
                seeded.bookmarked = existing.bookmarked
                if !replacing {
                    seeded.liked = existing.liked
                    seeded.likeCount = existing.likeCount
                    seeded.repostCount = existing.repostCount
                }
            }
            interactions[post.id] = seeded
        }
    }

    // MARK: - Interactions

    /// Optimistic toggles, reconciled against the server's answer.
    ///
    /// Each of these routes toggles server-side and returns the resulting
    /// state, so the response is applied verbatim rather than assumed - a
    /// tap that raced another device still converges on the truth. On
    /// failure the optimistic change is rolled back exactly.
    func toggleLike(_ post: Post) async {
        var pending = interaction(for: post)
        guard !pending.isMutating else { return }

        let previous = pending
        pending.liked.toggle()
        pending.likeCount += pending.liked ? 1 : -1
        pending.isMutating = true
        interactions[post.id] = pending

        do {
            let liked = try await repository.toggleLike(postId: post.id)
            var settled = interactions[post.id] ?? pending
            if settled.liked != liked {
                settled.liked = liked
                settled.likeCount = previous.likeCount + (liked ? 1 : 0)
            }
            settled.isMutating = false
            interactions[post.id] = settled
        } catch {
            interactions[post.id] = previous
            reportActionFailure(error)
        }
    }

    func toggleRepost(_ post: Post) async {
        var pending = interaction(for: post)
        guard !pending.isMutating else { return }

        let previous = pending
        let next = !(pending.reposted ?? false)
        pending.reposted = next
        pending.repostCount += next ? 1 : -1
        pending.isMutating = true
        interactions[post.id] = pending

        do {
            let reposted = try await repository.toggleRepost(postId: post.id)
            var settled = interactions[post.id] ?? pending
            if settled.reposted != reposted {
                settled.reposted = reposted
                settled.repostCount = previous.repostCount + (reposted ? 1 : 0)
            }
            settled.isMutating = false
            interactions[post.id] = settled
        } catch {
            interactions[post.id] = previous
            reportActionFailure(error)
        }
    }

    func toggleBookmark(_ post: Post) async {
        var pending = interaction(for: post)
        guard !pending.isMutating else { return }

        let previous = pending
        pending.bookmarked = !(pending.bookmarked ?? false)
        pending.isMutating = true
        interactions[post.id] = pending

        do {
            let bookmarked = try await repository.toggleBookmark(postId: post.id)
            var settled = interactions[post.id] ?? pending
            settled.bookmarked = bookmarked
            settled.isMutating = false
            interactions[post.id] = settled
        } catch {
            interactions[post.id] = previous
            reportActionFailure(error)
        }
    }

    /// Deletion is author-only, enforced server-side with a 403. The row
    /// is removed from both tabs only after the server confirms.
    func deletePost(_ post: Post) async {
        do {
            try await repository.deletePost(id: post.id)
            for tab in FeedTab.allCases {
                states[tab]?.posts.removeAll { $0.id == post.id }
            }
            interactions.removeValue(forKey: post.id)
        } catch {
            reportActionFailure(error)
        }
    }

    private func reportActionFailure(_ error: Error) {
        if case ApiError.cancelled = error { return }
        actionError = (error as? ApiError)?.userFacingMessage
            ?? L10n.string(.authErrTryAgain)
    }
}
