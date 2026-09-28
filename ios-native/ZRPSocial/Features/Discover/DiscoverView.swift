import SwiftUI

/// The viewer's relationship to a Discover item's author, tracked apart
/// from `DiscoverItem.viewerState.followsAuthor` (a plain bool the wire
/// format carries) because a follow toggle on a private account can
/// resolve to a *pending request* rather than an immediate follow - a
/// third state the feed response itself never reports, only the toggle
/// route's own answer does. Mirrors `FollowState` in
/// `src/app/discover/types.ts` exactly.
enum DiscoverFollowState: Equatable {
    case none
    case following
    case requested
}

/// A one-shot, non-error UI event - matches page.tsx's own transient
/// `toast` state (auto-dismissed after 3.5s, see `DiscoverView`'s own
/// `.task(id:)`).
enum DiscoverToast: Equatable {
    case notInterestedConfirmed
    case notInterestedFailed
    case creatorMuted
    case creatorBlocked
    case actionFailed

    var key: L10nKey {
        switch self {
        case .notInterestedConfirmed: return .discoverNotInterestedConfirmed
        case .notInterestedFailed: return .discoverNotInterestedFailed
        case .creatorMuted: return .discoverCreatorMuted
        case .creatorBlocked: return .discoverCreatorBlocked
        case .actionFailed: return .discoverActionFailed
        }
    }
}

@MainActor
final class DiscoverViewModel: ObservableObject {

    enum Phase: Equatable {
        case idle
        case loading
        case loaded
        case failed(ApiError)
    }

    @Published private(set) var items: [DiscoverItem] = []
    @Published private(set) var phase: Phase = .idle
    @Published private(set) var isLoadingMore = false
    @Published var toast: DiscoverToast?
    /// The active slide's playback progress, 0...1 - drives the thin
    /// progress bar `DiscoverSlideView` draws, the same signal that
    /// feeds the watch-event thresholds below.
    @Published private(set) var activeProgress: Double = 0
    /// Follow-toggle results that diverge from the plain bool the feed
    /// response carries (see `DiscoverFollowState`'s own doc comment).
    /// Keyed by author id, not post id: the same creator can legitimately
    /// appear more than once in the feed, and following them flips every
    /// one of their items at once.
    @Published private(set) var followOverrides: [String: DiscoverFollowState] = [:]

    private var cursor: String?
    private let repository: DiscoverRepositoryProtocol

    /// Per-post watch-event dedup for this viewing session - the native
    /// equivalent of page.tsx's own `firedEvents` ref. Not published: it
    /// drives no rendering. See `DiscoverWatchEvents`'s own doc comment
    /// for why this, not the server's own dedup window alone, decides
    /// whether a request is even sent.
    private var firedEvents: [String: Set<DiscoverEventType>] = [:]

    init(repository: DiscoverRepositoryProtocol = DiscoverRepository()) {
        self.repository = repository
    }

    var hasMore: Bool { cursor != nil }

    func followState(for item: DiscoverItem) -> DiscoverFollowState {
        followOverrides[item.author.id] ?? (item.viewerState.followsAuthor ? .following : .none)
    }

    func loadIfNeeded() async {
        guard phase == .idle else { return }
        await load(replacingExisting: true)
        // IMPRESSION for whatever lands on page 0 once the first page loads.
        if let first = items.first { fireImpressionIfNeeded(first.id) }
    }

    func retry() async {
        await load(replacingExisting: true)
    }

    func loadMoreIfNeeded(currentId: String) async {
        guard
            phase == .loaded, hasMore, !isLoadingMore,
            let index = items.firstIndex(where: { $0.id == currentId }),
            index >= items.count - 2
        else { return }
        await load(replacingExisting: false)
    }

    private func load(replacingExisting: Bool) async {
        if replacingExisting {
            if items.isEmpty { phase = .loading }
        } else {
            isLoadingMore = true
        }

        do {
            let page = try await repository.feed(cursor: replacingExisting ? nil : cursor)
            if replacingExisting {
                items = page.items
            } else {
                let existing = Set(items.map(\.id))
                items.append(contentsOf: page.items.filter { !existing.contains($0.id) })
            }
            cursor = page.nextCursor
            phase = .loaded
            isLoadingMore = false
        } catch {
            isLoadingMore = false
            if items.isEmpty {
                phase = .failed(error as? ApiError ?? .transport(underlying: "\(error)"))
            } else {
                // A failed page-2+ fetch leaves the feed exactly as it
                // was; `loadMoreIfNeeded` will simply try again the next
                // time the reader nears the end.
                phase = .loaded
            }
        }
    }

    // MARK: - Watch events

    private func fired(for postId: String) -> Set<DiscoverEventType> {
        firedEvents[postId] ?? []
    }

    /// The active slide changed - matches page.tsx's own `activePostId`
    /// effect: report SKIP for the outgoing post if it started but never
    /// finished, and IMPRESSION for the new one. Also resets the
    /// progress bar, since it belongs to whichever slide is now active.
    func activeSlideChanged(from previousId: String?, to currentId: String) {
        activeProgress = 0
        if let previousId {
            var previousFired = fired(for: previousId)
            if DiscoverWatchEvents.shouldFireSkip(alreadyFired: previousFired) {
                previousFired.insert(.skip)
                firedEvents[previousId] = previousFired
                sendEvent(previousId, .skip)
            }
        }
        fireImpressionIfNeeded(currentId)
    }

    private func fireImpressionIfNeeded(_ postId: String) {
        var postFired = fired(for: postId)
        if DiscoverWatchEvents.shouldFireImpression(alreadyFired: postFired) {
            postFired.insert(.impression)
            firedEvents[postId] = postFired
            sendEvent(postId, .impression)
        }
    }

    /// The active item's player actually started playing - matches
    /// `onPlaying`.
    func playbackStarted(_ postId: String) {
        var postFired = fired(for: postId)
        if DiscoverWatchEvents.shouldFireStart(alreadyFired: postFired) {
            postFired.insert(.start)
            firedEvents[postId] = postFired
            sendEvent(postId, .start)
        }
    }

    /// A position update from the active item's player - matches
    /// `onTimeUpdate`. `currentPosition`/`duration` are in seconds,
    /// `AVPlayer`'s own native unit.
    func playbackProgress(postId: String, currentPosition: Double, duration: Double) {
        if duration.isFinite, duration > 0 {
            activeProgress = min(1, max(0, currentPosition / duration))
        }

        var postFired = fired(for: postId)
        let toFire = DiscoverWatchEvents.progressEventsToFire(
            currentPosition: currentPosition,
            duration: duration,
            alreadyFired: postFired
        )
        guard !toFire.isEmpty else { return }
        for type in toFire { postFired.insert(type) }
        firedEvents[postId] = postFired
        for type in toFire {
            sendEvent(postId, type, watchedMs: Int(currentPosition * 1000))
        }
    }

    private func sendEvent(_ postId: String, _ type: DiscoverEventType, watchedMs: Int? = nil) {
        Task { await repository.recordEvent(postId: postId, eventType: type, watchedMs: watchedMs) }
    }

    /// A post whose video failed to play - matches `DiscoverSlide`'s own
    /// local playback-error state, dropped from the feed rather than
    /// left stuck on an error screen forever.
    func removeBrokenItem(_ postId: String) {
        items.removeAll { $0.id == postId }
    }

    // MARK: - Interactions
    //
    // Each toggle route flips state server-side and answers with the
    // result; a failure restores the pre-tap snapshot exactly, matching
    // `PostInteractionStore`'s own optimistic-toggle-and-reconcile
    // convention elsewhere in this app.

    func toggleLike(_ item: DiscoverItem) {
        guard let index = items.firstIndex(where: { $0.id == item.id }) else { return }
        let previous = items
        items[index].viewerState.liked.toggle()
        items[index].stats.likes = max(0, items[index].stats.likes + (items[index].viewerState.liked ? 1 : -1))
        Task {
            do { _ = try await repository.toggleLike(postId: item.id) }
            catch { items = previous }
        }
    }

    func toggleRepost(_ item: DiscoverItem) {
        guard let index = items.firstIndex(where: { $0.id == item.id }) else { return }
        let previous = items
        items[index].viewerState.reposted.toggle()
        items[index].stats.reposts = max(0, items[index].stats.reposts + (items[index].viewerState.reposted ? 1 : -1))
        Task {
            do { _ = try await repository.toggleRepost(postId: item.id) }
            catch { items = previous }
        }
    }

    func toggleSave(_ item: DiscoverItem) {
        guard let index = items.firstIndex(where: { $0.id == item.id }) else { return }
        let previous = items
        items[index].viewerState.saved.toggle()
        Task {
            do { _ = try await repository.toggleSave(postId: item.id) }
            catch { items = previous }
        }
    }

    func toggleFollow(_ item: DiscoverItem) {
        let authorId = item.author.id
        let previous = followOverrides[authorId]
        let optimistic: DiscoverFollowState = followState(for: item) == .following ? .none : .following
        followOverrides[authorId] = optimistic
        Task {
            do {
                let response = try await repository.toggleFollow(username: item.author.username)
                followOverrides[authorId] = response.following ? .following : (response.requested ? .requested : .none)
            } catch {
                followOverrides[authorId] = previous
            }
        }
    }

    /// Removes the item immediately (matches `handleNotInterested`'s own
    /// optimistic removal) - a failure shows a toast but does not
    /// restore it, since a dismissal the viewer already saw disappear
    /// reappearing moments later would read as a bug, not a retry.
    func markNotInterested(_ postId: String) {
        items.removeAll { $0.id == postId }
        Task {
            do {
                _ = try await repository.markNotInterested(postId: postId)
                toast = .notInterestedConfirmed
            } catch {
                toast = .notInterestedFailed
            }
        }
    }

    func muteCreator(_ item: DiscoverItem) {
        let authorId = item.author.id
        items.removeAll { $0.author.id == authorId }
        Task {
            do {
                _ = try await repository.muteCreator(userId: authorId)
                toast = .creatorMuted
            } catch {
                toast = .actionFailed
            }
        }
    }

    func blockCreator(_ item: DiscoverItem) {
        let authorId = item.author.id
        items.removeAll { $0.author.id == authorId }
        Task {
            do {
                _ = try await repository.blockCreator(username: item.author.username)
                toast = .creatorBlocked
            } catch {
                toast = .actionFailed
            }
        }
    }

    func dismissToast() { toast = nil }
}

/// ZRP Discover - the real server-ranked, TikTok-style vertical video
/// feed (`GET /api/discover`), ported from `src/app/discover/page.tsx` +
/// `DiscoverSlide.tsx`. Distinct from Search's own "Discover" pre-search
/// state (suggested users/trending hashtags) - a different backend
/// concern entirely, despite the shared name.
///
/// Playback goes through the app's existing `FeedVideoCoordinator`
/// rather than a second player built for this screen - see
/// `ShortsView`'s own doc comment for why one shared `AVQueuePlayer` is
/// what keeps a video feed from holding several decoders alive at once.
/// Watch-event reporting (impression/start/25/50/75/complete/skip) is
/// this feed's own addition on top of that shared player - see
/// `DiscoverWatchEvents`.
struct DiscoverView: View {

    @EnvironmentObject private var videos: FeedVideoCoordinator

    @StateObject private var viewModel = DiscoverViewModel()
    @State private var currentId: String?

    var body: some View {
        ZStack {
            Color.black.ignoresSafeArea()

            switch viewModel.phase {
            case .idle, .loading:
                ProgressView().tint(.white)
            case .failed(let error):
                TimelineStateView.error(error) {
                    Task { await viewModel.retry() }
                }
            case .loaded:
                if viewModel.items.isEmpty {
                    empty
                } else {
                    pager
                }
            }

            if let toast = viewModel.toast {
                Text(toast.key)
                    .font(.subheadline)
                    .foregroundStyle(.white)
                    .padding(.horizontal, ZrpSpacing.lg)
                    .padding(.vertical, ZrpSpacing.sm)
                    .background(.black.opacity(0.85), in: Capsule())
                    .padding(.bottom, ZrpSpacing.xxl)
                    .frame(maxHeight: .infinity, alignment: .bottom)
                    .allowsHitTesting(false)
            }
        }
        .navigationTitle(Text(.navDiscover))
        .navigationBarTitleDisplayMode(.inline)
        .toolbarBackground(.black, for: .navigationBar)
        .toolbarColorScheme(.dark, for: .navigationBar)
        // The tab bar and the mini-player both belong to the timeline,
        // not to a full-screen video.
        .toolbar(.hidden, for: .tabBar)
        .task {
            await viewModel.loadIfNeeded()
        }
        .onDisappear { videos.stop() }
        .task(id: viewModel.toast) {
            guard viewModel.toast != nil else { return }
            try? await Task.sleep(for: .seconds(3.5))
            if !Task.isCancelled { viewModel.dismissToast() }
        }
    }

    private var empty: some View {
        VStack(spacing: ZrpSpacing.md) {
            Image(systemName: "bolt.fill")
                .font(.largeTitle)
            Text(.discoverEndOfFeed)
                .font(.subheadline)
                .multilineTextAlignment(.center)
        }
        .foregroundStyle(.white.opacity(0.85))
        .padding(ZrpSpacing.xl)
    }

    private var pager: some View {
        ScrollView(.vertical) {
            LazyVStack(spacing: 0) {
                ForEach(viewModel.items) { item in
                    DiscoverSlideView(
                        item: item,
                        isCurrent: item.id == currentId,
                        followState: viewModel.followState(for: item),
                        activeProgress: viewModel.activeProgress,
                        onToggleLike: { viewModel.toggleLike(item) },
                        onToggleRepost: { viewModel.toggleRepost(item) },
                        onToggleSave: { viewModel.toggleSave(item) },
                        onToggleFollow: { viewModel.toggleFollow(item) },
                        onPlaying: { viewModel.playbackStarted(item.id) },
                        onProgress: { position, duration in
                            viewModel.playbackProgress(postId: item.id, currentPosition: position, duration: duration)
                        },
                        onPlaybackError: { viewModel.removeBrokenItem(item.id) },
                        onNotInterested: { viewModel.markNotInterested(item.id) },
                        onMuteCreator: { viewModel.muteCreator(item) },
                        onBlockCreator: { viewModel.blockCreator(item) }
                    )
                    .containerRelativeFrame([.horizontal, .vertical])
                    .id(item.id)
                }
            }
            .scrollTargetLayout()
        }
        .scrollTargetBehavior(.paging)
        .scrollPosition(id: $currentId)
        .scrollIndicators(.hidden)
        .ignoresSafeArea(edges: .bottom)
        .onAppear {
            // The first page is current before any scrolling has
            // happened, and nothing else would tell the coordinator (or
            // the watch-event pipeline) that.
            if currentId == nil { currentId = viewModel.items.first?.id }
        }
        .onChange(of: currentId) { previous, current in
            if let previous { videos.report(id: previous, visibleFraction: 0) }
            guard let current else { return }
            videos.report(id: current, visibleFraction: 1)
            viewModel.activeSlideChanged(from: previous, to: current)
            Task { await viewModel.loadMoreIfNeeded(currentId: current) }
        }
    }
}
