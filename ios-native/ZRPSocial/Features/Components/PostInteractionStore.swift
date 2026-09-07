import Foundation
import SwiftUI

/// One app-wide record of the viewer's relationship to every post they
/// have seen, plus the only path through which those relationships are
/// changed.
///
/// Shared rather than per-screen on purpose. Liking a post in the Home
/// feed must show as liked when the same post appears on its author's
/// profile, in a hashtag timeline, or in bookmarks - and each of those
/// screens must not re-implement the same optimistic-toggle-and-reconcile
/// logic. A single injected store gives both properties for free.
@MainActor
final class PostInteractionStore: ObservableObject {

    @Published private(set) var interactions: [String: PostInteraction] = [:]

    /// Posts the viewer has successfully deleted this session. Lists
    /// filter against this instead of each holding its own removal logic,
    /// so a post deleted from the feed also disappears from the author's
    /// profile without the two screens knowing about each other.
    @Published private(set) var deletedPostIDs: Set<String> = []

    /// Set when an action fails, for a transient message. Not an error
    /// state for a whole screen - a failed like should not blank a
    /// timeline.
    @Published var actionError: String?

    /// Posts whose view this app run has already counted.
    ///
    /// `POST /api/posts/{id}/view` increments unconditionally - there is
    /// no server-side dedupe at all - so the client is the only thing
    /// stopping a scroll back and forth from inflating the number. The
    /// website guards it with `sessionStorage`; the process-lifetime
    /// equivalent here is this set, which is deliberately NOT persisted:
    /// a new session counts a new view, exactly as a new browser tab
    /// does.
    private var countedViewIDs: Set<String> = []

    private let repository: PostsRepositoryProtocol

    init(repository: PostsRepositoryProtocol = PostsRepository()) {
        self.repository = repository
    }

    /// Counts one view of a post, at most once per app run.
    ///
    /// Silent on failure, and deliberately so: the route itself answers
    /// `{views: null}` with a 200 for a post that no longer exists
    /// rather than an error, because a view tally is not worth
    /// interrupting anyone over. The count is only replaced when the
    /// server actually reports a number.
    func countView(_ post: Post) {
        guard !countedViewIDs.contains(post.id) else { return }
        countedViewIDs.insert(post.id)
        Task { [weak self] in
            guard let self else { return }
            do {
                guard let views = try await repository.countView(postId: post.id) else { return }
                var updated = interactions[post.id] ?? PostInteraction(post: post)
                updated.viewCount = views
                interactions[post.id] = updated
            } catch {
                // Deliberately swallowed - see the doc comment above.
            }
        }
    }

    func interaction(for post: Post) -> PostInteraction {
        interactions[post.id] ?? PostInteraction(post: post)
    }

    /// Records what a freshly fetched page says.
    ///
    /// `replacing` is true for a first page or a refresh. Locally-known
    /// repost and bookmark flags always survive, because no list endpoint
    /// reports them - dropping them would visibly un-highlight a post the
    /// viewer just reposted.
    func seed(_ posts: [Post], replacing: Bool) {
        for post in posts {
            var seeded = PostInteraction(post: post)
            if let existing = interactions[post.id] {
                seeded.reposted = existing.reposted
                seeded.bookmarked = existing.bookmarked
                // The view route's answer is newer than any page that
                // was in flight alongside it.
                seeded.viewCount = max(seeded.viewCount, existing.viewCount)
                // A refresh that returns the pre-edit text must not undo
                // an edit the server has already accepted.
                seeded.contentOverride = existing.contentOverride
                if !replacing {
                    seeded.liked = existing.liked
                    seeded.likeCount = existing.likeCount
                    seeded.repostCount = existing.repostCount
                }
            }
            interactions[post.id] = seeded
        }
    }

    /// Called when the session ends. Everything here is one viewer's
    /// relationship to a post, so it must not survive into the next
    /// viewer's session on a shared device.
    func clear() {
        interactions.removeAll()
        deletedPostIDs.removeAll()
        actionError = nil
    }

    // MARK: - Toggles

    /// Each toggle route flips state server-side and returns the result,
    /// so the response is applied verbatim rather than assumed - a tap
    /// that raced another device converges on the truth. A failure rolls
    /// the optimistic change back exactly.

    func toggleLike(_ post: Post) async {
        var pending = interaction(for: post)
        guard !pending.isMutating else { return }
        let previous = pending

        pending.liked.toggle()
        pending.likeCount = max(0, pending.likeCount + (pending.liked ? 1 : -1))
        pending.isMutating = true
        interactions[post.id] = pending

        do {
            let liked = try await repository.toggleLike(postId: post.id)
            var settled = interactions[post.id] ?? pending
            if settled.liked != liked {
                settled.liked = liked
                settled.likeCount = max(0, previous.likeCount + (liked ? 1 : 0))
            }
            settled.isMutating = false
            interactions[post.id] = settled
        } catch {
            interactions[post.id] = previous
            report(error)
        }
    }

    func toggleRepost(_ post: Post) async {
        var pending = interaction(for: post)
        guard !pending.isMutating else { return }
        let previous = pending

        let next = !(pending.reposted ?? false)
        pending.reposted = next
        pending.repostCount = max(0, pending.repostCount + (next ? 1 : -1))
        pending.isMutating = true
        interactions[post.id] = pending

        do {
            let reposted = try await repository.toggleRepost(postId: post.id)
            var settled = interactions[post.id] ?? pending
            if settled.reposted != reposted {
                settled.reposted = reposted
                settled.repostCount = max(0, previous.repostCount + (reposted ? 1 : 0))
            }
            settled.isMutating = false
            interactions[post.id] = settled
        } catch {
            interactions[post.id] = previous
            report(error)
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
            report(error)
        }
    }

    /// The content to render for a post: the edited text when there is
    /// one, otherwise what the server sent.
    func displayContent(for post: Post) -> String {
        interactions[post.id]?.contentOverride ?? post.content
    }

    /// Text-only edit, matching the website's own modal exactly - it
    /// never sends `imageUrl` either, and the route only touches that
    /// field when the body includes it, so omitting it is what keeps the
    /// post's media intact rather than silently clearing it.
    ///
    /// Author-only and plan-length-checked server-side.
    func editPost(_ post: Post, content: String) async {
        let trimmed = content.trimmingCharacters(in: .whitespacesAndNewlines)
        guard !trimmed.isEmpty, trimmed != displayContent(for: post) else { return }
        do {
            let updated = try await repository.updatePost(id: post.id, content: trimmed)
            var pending = interaction(for: post)
            pending.contentOverride = updated.content
            interactions[post.id] = pending
        } catch {
            report(error)
        }
    }

    /// Deletion is author-only, enforced server-side with a 403. The post
    /// is only recorded as deleted once the server confirms.
    func deletePost(_ post: Post) async {
        do {
            try await repository.deletePost(id: post.id)
            deletedPostIDs.insert(post.id)
            interactions.removeValue(forKey: post.id)
        } catch {
            report(error)
        }
    }

    private func report(_ error: Error) {
        if case ApiError.cancelled = error { return }
        actionError = (error as? ApiError)?.userFacingMessage
            ?? L10n.string(.authErrTryAgain)
    }
}
