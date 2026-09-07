import Foundation
import SwiftUI

@MainActor
final class ProfileViewModel: ObservableObject {

    enum Phase: Equatable {
        case loading
        case loaded(UserProfile)
        case failed(ApiError)
    }

    @Published private(set) var phase: Phase = .loading
    @Published private(set) var posts = FeedState()

    /// Whether a follow toggle is in flight, so the button can show
    /// progress and refuse a second tap rather than sending two requests
    /// that would cancel each other out.
    @Published private(set) var isTogglingFollow = false

    /// The server's own wording when a follow becomes a pending request
    /// ("Follow request sent.", "Follow request already sent."). Shown
    /// verbatim - the client has no better way to say it, and a private
    /// account's follow genuinely is a different outcome from a public
    /// one.
    @Published var followNotice: String?

    let username: String

    /// Set by the view from the session, so visibility checks know who is
    /// looking without this type reaching for global state.
    var viewerId: String?

    private let repository: UsersRepositoryProtocol
    private weak var interactions: PostInteractionStore?
    private var postsTask: Task<Void, Never>?

    init(username: String, repository: UsersRepositoryProtocol = UsersRepository()) {
        self.username = username
        self.repository = repository
    }

    func attach(interactions: PostInteractionStore) {
        self.interactions = interactions
    }

    var profile: UserProfile? {
        if case .loaded(let profile) = phase { return profile }
        return nil
    }

    // MARK: - Loading

    func loadIfNeeded() async {
        guard case .loading = phase else { return }
        await load()
    }

    func load() async {
        do {
            let profile = try await repository.profile(username: username)
            phase = .loaded(profile)
        } catch {
            phase = .failed(error as? ApiError ?? .transport(underlying: "\(error)"))
            return
        }
        await loadPosts(replacingExisting: true)
    }

    func refresh() async {
        postsTask?.cancel()
        await load()
    }

    func loadMoreIfNeeded(currentPost: Post) {
        guard
            posts.phase == .loaded,
            posts.hasMore,
            !posts.isLoadingMore,
            let index = posts.posts.firstIndex(where: { $0.id == currentPost.id }),
            index >= posts.posts.count - 3
        else { return }

        postsTask?.cancel()
        postsTask = Task { [weak self] in
            await self?.loadPosts(replacingExisting: false)
        }
    }

    private func loadPosts(replacingExisting: Bool) async {
        // A private account the viewer cannot see answers `{items: []}`
        // rather than a 403, which would render as a misleading "No posts
        // yet". The view shows the private-account explanation instead,
        // so there is nothing to fetch here at all.
        guard let profile, profile.isContentVisible(toViewerId: viewerId) else {
            posts.phase = .loaded
            return
        }

        if replacingExisting {
            if posts.posts.isEmpty { posts.phase = .loading }
        } else {
            posts.isLoadingMore = true
        }

        do {
            let page = try await repository.posts(
                username: username,
                cursor: replacingExisting ? nil : posts.cursor
            )
            guard !Task.isCancelled else { return }

            if replacingExisting {
                posts.posts = page.posts
            } else {
                let existing = Set(posts.posts.map(\.id))
                posts.posts.append(contentsOf: page.posts.filter { !existing.contains($0.id) })
            }
            posts.cursor = page.nextCursor
            posts.phase = .loaded
            posts.isLoadingMore = false

            interactions?.seed(page.posts, replacing: replacingExisting)
        } catch ApiError.cancelled {
            posts.isLoadingMore = false
        } catch {
            guard !Task.isCancelled else { return }
            posts.isLoadingMore = false
            if posts.posts.isEmpty {
                posts.phase = .failed(error as? ApiError ?? .transport(underlying: "\(error)"))
            } else {
                posts.phase = .loaded
            }
        }
    }

    // MARK: - Follow

    /// `POST /api/users/{username}/follow` toggles server-side and
    /// reports the resulting state. A private account yields
    /// `requested: true` rather than `following: true` - a genuinely
    /// different outcome, so the UI does not claim the viewer is
    /// following when they are only queued.
    func toggleFollow() async {
        guard let profile, !isTogglingFollow else { return }
        isTogglingFollow = true
        defer { isTogglingFollow = false }

        do {
            let response = try await repository.toggleFollow(username: username)
            phase = .loaded(profile.applyingFollowState(response.following))
            followNotice = response.requested ? response.message : nil
        } catch let error as ApiError {
            followNotice = error.userFacingMessage
        } catch {
            followNotice = L10n.string(.authErrTryAgain)
        }
    }
}

private extension UserProfile {
    /// Rebuilds the profile with a new follow state and the follower
    /// count adjusted to match.
    ///
    /// The follow route returns only the resulting flag, not a refreshed
    /// profile, so the count is adjusted locally rather than left stale
    /// or re-fetched with a second round trip the website does not make
    /// either.
    func applyingFollowState(_ nowFollowing: Bool) -> UserProfile {
        guard nowFollowing != isFollowing else { return self }
        var updated = self
        updated.isFollowing = nowFollowing
        updated.counts = ProfileCounts(
            posts: counts.posts,
            followers: max(0, counts.followers + (nowFollowing ? 1 : -1)),
            following: counts.following
        )
        return updated
    }
}
