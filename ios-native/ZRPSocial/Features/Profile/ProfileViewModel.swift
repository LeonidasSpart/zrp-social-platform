import Foundation
import SwiftUI

/// The tabs on a profile.
///
/// Four of them list posts and share one loader; `replies` returns a
/// different shape from its own route and is loaded separately. The
/// order matches the website's.
enum ProfileTab: Hashable, CaseIterable {
    case posts
    case reposts
    case replies
    case likes
    case media

    /// The post-listing route behind this tab, or `nil` for replies.
    var postsTab: ProfilePostsTab? {
        switch self {
        case .posts: return .posts
        case .reposts: return .reposts
        case .likes: return .likes
        case .media: return .media
        case .replies: return nil
        }
    }

    var titleKey: L10nKey {
        postsTab?.titleKey ?? .profileReplies
    }

    var emptyKey: L10nKey {
        postsTab?.emptyKey ?? .profileNoReplies
    }

    var systemImage: String {
        postsTab?.systemImage ?? "bubble.left"
    }
}

/// The replies tab's own paging state - the same shape as `FeedState`,
/// over a different row type.
struct ProfileRepliesState {
    var replies: [ProfileReply] = []
    var cursor: String?
    var phase: FeedState.Phase = .idle
    var isLoadingMore = false

    var hasMore: Bool { cursor != nil }
}

@MainActor
final class ProfileViewModel: ObservableObject {

    enum Phase: Equatable {
        case loading
        case loaded(UserProfile)
        case failed(ApiError)
    }

    @Published private(set) var phase: Phase = .loading

    /// One paging state per post tab. Their cursors are not
    /// interchangeable - `likes` and `reposts` page on the join row, not
    /// on the post - and switching tabs must not discard what a tab has
    /// already read, so each keeps its own.
    @Published private(set) var feeds: [ProfilePostsTab: FeedState] = [:]
    @Published private(set) var repliesState = ProfileRepliesState()

    /// The author's pinned post, fetched separately.
    ///
    /// The profile route reports only `pinnedPostId`; the post itself
    /// comes from `GET /api/posts/{id}`, exactly as the website does it.
    /// It is shown above the Posts tab and removed from the list below,
    /// so it appears once rather than twice.
    @Published private(set) var pinnedPost: Post?

    /// True while a pin toggle is in flight, so the menu item cannot be
    /// tapped twice into two racing requests.
    @Published private(set) var isTogglingPin = false

    /// Which tab is showing. Changing it loads that tab's first page on
    /// first visit and does nothing on a return visit.
    @Published var selectedTab: ProfileTab = .posts

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
    private let postsRepository: PostsRepositoryProtocol
    private weak var interactions: PostInteractionStore?
    private var tabTask: Task<Void, Never>?

    init(
        username: String,
        repository: UsersRepositoryProtocol = UsersRepository(),
        postsRepository: PostsRepositoryProtocol = PostsRepository()
    ) {
        self.username = username
        self.repository = repository
        self.postsRepository = postsRepository
    }

    func attach(interactions: PostInteractionStore) {
        self.interactions = interactions
    }

    var profile: UserProfile? {
        if case .loaded(let profile) = phase { return profile }
        return nil
    }

    // MARK: - Loading

    /// The paging state of one post tab. A tab never visited has none
    /// yet, which reads as `.idle` - the same "nothing asked for yet"
    /// the feeds use.
    func feed(_ tab: ProfilePostsTab) -> FeedState {
        feeds[tab] ?? FeedState()
    }

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
        await loadSelectedTab(replacingExisting: true)
        await loadPinnedPost()
    }

    func refresh() async {
        tabTask?.cancel()
        // A refresh re-reads the tab in view. The others keep what they
        // have and re-read when next selected, rather than firing four
        // more requests nobody is looking at.
        await load()
    }

    /// Called when the tab changes. The first visit loads; a return
    /// visit shows what is already there.
    func selectTab(_ tab: ProfileTab) async {
        selectedTab = tab
        let isEmpty: Bool
        switch tab.postsTab {
        case .some(let postsTab): isEmpty = feed(postsTab).phase == .idle
        case .none: isEmpty = repliesState.phase == .idle
        }
        guard isEmpty else { return }
        await loadSelectedTab(replacingExisting: true)
    }

    func loadMoreIfNeeded(currentPost: Post) {
        guard let postsTab = selectedTab.postsTab else { return }
        let state = feed(postsTab)
        guard
            state.phase == .loaded,
            state.hasMore,
            !state.isLoadingMore,
            let index = state.posts.firstIndex(where: { $0.id == currentPost.id }),
            index >= state.posts.count - 3
        else { return }

        tabTask?.cancel()
        tabTask = Task { [weak self] in
            await self?.loadPosts(postsTab, replacingExisting: false)
        }
    }

    func loadMoreIfNeeded(currentReply: ProfileReply) {
        guard
            selectedTab == .replies,
            repliesState.phase == .loaded,
            repliesState.hasMore,
            !repliesState.isLoadingMore,
            let index = repliesState.replies.firstIndex(where: { $0.id == currentReply.id }),
            index >= repliesState.replies.count - 3
        else { return }

        tabTask?.cancel()
        tabTask = Task { [weak self] in
            await self?.loadReplies(replacingExisting: false)
        }
    }

    private func loadSelectedTab(replacingExisting: Bool) async {
        if let postsTab = selectedTab.postsTab {
            await loadPosts(postsTab, replacingExisting: replacingExisting)
        } else {
            await loadReplies(replacingExisting: replacingExisting)
        }
    }

    /// True when there is genuinely nothing to fetch.
    ///
    /// A private account the viewer cannot see answers `{items: []}` from
    /// every content route rather than a 403, which would render as a
    /// misleading "No posts yet". The view shows the private-account
    /// explanation instead, so nothing is requested at all.
    private var isContentFetchable: Bool {
        guard let profile else { return false }
        return profile.isContentVisible(toViewerId: viewerId)
    }

    private func loadPosts(_ tab: ProfilePostsTab, replacingExisting: Bool) async {
        guard isContentFetchable else {
            var state = feed(tab)
            state.phase = .loaded
            feeds[tab] = state
            return
        }

        var state = feed(tab)
        if replacingExisting {
            if state.posts.isEmpty { state.phase = .loading }
        } else {
            state.isLoadingMore = true
        }
        feeds[tab] = state

        do {
            let page = try await repository.tabPosts(
                tab,
                username: username,
                cursor: replacingExisting ? nil : state.cursor
            )
            guard !Task.isCancelled else { return }

            var settled = feed(tab)
            if replacingExisting {
                settled.posts = page.posts
            } else {
                let existing = Set(settled.posts.map(\.id))
                settled.posts.append(contentsOf: page.posts.filter { !existing.contains($0.id) })
            }
            settled.cursor = page.nextCursor
            settled.phase = .loaded
            settled.isLoadingMore = false
            feeds[tab] = settled

            interactions?.seed(page.posts, replacing: replacingExisting)
        } catch ApiError.cancelled {
            var settled = feed(tab)
            settled.isLoadingMore = false
            feeds[tab] = settled
        } catch {
            guard !Task.isCancelled else { return }
            var settled = feed(tab)
            settled.isLoadingMore = false
            // A failed "load more" must not blank rows already read.
            if settled.posts.isEmpty {
                settled.phase = .failed(error as? ApiError ?? .transport(underlying: "\(error)"))
            } else {
                settled.phase = .loaded
            }
            feeds[tab] = settled
        }
    }

    private func loadReplies(replacingExisting: Bool) async {
        guard isContentFetchable else {
            repliesState.phase = .loaded
            return
        }

        if replacingExisting {
            if repliesState.replies.isEmpty { repliesState.phase = .loading }
        } else {
            repliesState.isLoadingMore = true
        }

        do {
            let page = try await repository.replies(
                username: username,
                cursor: replacingExisting ? nil : repliesState.cursor
            )
            guard !Task.isCancelled else { return }

            if replacingExisting {
                repliesState.replies = page.items
            } else {
                let existing = Set(repliesState.replies.map(\.id))
                repliesState.replies.append(contentsOf: page.items.filter { !existing.contains($0.id) })
            }
            repliesState.cursor = page.nextCursor
            repliesState.phase = .loaded
            repliesState.isLoadingMore = false
        } catch ApiError.cancelled {
            repliesState.isLoadingMore = false
        } catch {
            guard !Task.isCancelled else { return }
            repliesState.isLoadingMore = false
            if repliesState.replies.isEmpty {
                repliesState.phase = .failed(error as? ApiError ?? .transport(underlying: "\(error)"))
            } else {
                repliesState.phase = .loaded
            }
        }
    }

    /// Loads (or clears) the pinned post to match the profile.
    ///
    /// A failure here is silent: the pinned post is a decoration above a
    /// timeline that loads on its own, and an error banner over a whole
    /// profile because one extra request failed would be worse than its
    /// absence. A pinned post that has since been deleted answers 404,
    /// which lands in the same place.
    private func loadPinnedPost() async {
        guard
            let profile,
            let pinnedId = profile.pinnedPostId,
            profile.isContentVisible(toViewerId: viewerId)
        else {
            pinnedPost = nil
            return
        }
        pinnedPost = try? await postsRepository.post(id: pinnedId)
        if let pinnedPost {
            interactions?.seed([pinnedPost], replacing: false)
        }
    }

    /// `POST /api/posts/{id}/pin` toggles and reports the resulting
    /// state, so the profile is re-read afterwards rather than guessed
    /// at: one account has one pin, and pinning a second post silently
    /// unpins the first server-side.
    func togglePin(_ post: Post) async {
        guard !isTogglingPin else { return }
        isTogglingPin = true
        defer { isTogglingPin = false }

        do {
            _ = try await postsRepository.togglePin(postId: post.id)
        } catch let error as ApiError {
            followNotice = error.userFacingMessage
            return
        } catch {
            followNotice = L10n.string(.authErrTryAgain)
            return
        }
        await load()
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
