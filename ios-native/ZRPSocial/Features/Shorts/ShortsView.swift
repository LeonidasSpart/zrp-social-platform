import SwiftUI

@MainActor
final class ShortsViewModel: ObservableObject {

    enum Phase: Equatable {
        case idle
        case loading
        case loaded
        case failed(ApiError)
    }

    @Published private(set) var videos: [Post] = []
    @Published private(set) var phase: Phase = .idle
    @Published private(set) var isLoadingMore = false

    private var cursor: String?
    private let startId: String?
    private let repository: VideosRepositoryProtocol
    private weak var interactions: PostInteractionStore?

    init(startId: String?, repository: VideosRepositoryProtocol = VideosRepository()) {
        self.startId = startId
        self.repository = repository
    }

    func attach(interactions: PostInteractionStore) {
        self.interactions = interactions
    }

    var hasMore: Bool { cursor != nil }

    func loadIfNeeded() async {
        guard phase == .idle else { return }
        await load(replacingExisting: true)
    }

    func retry() async {
        await load(replacingExisting: true)
    }

    /// Pages when the reader is within two videos of the end.
    ///
    /// Two, not the timelines' three: a short is one screen tall, so
    /// "two away" is already only two swipes of warning, and each page
    /// is ten items.
    func loadMoreIfNeeded(currentId: String) async {
        guard
            phase == .loaded,
            hasMore,
            !isLoadingMore,
            let index = videos.firstIndex(where: { $0.id == currentId }),
            index >= videos.count - 2
        else { return }
        await load(replacingExisting: false)
    }

    private func load(replacingExisting: Bool) async {
        if replacingExisting {
            if videos.isEmpty { phase = .loading }
        } else {
            isLoadingMore = true
        }

        do {
            let page = try await repository.videos(
                cursor: replacingExisting ? nil : cursor,
                startId: startId
            )
            if replacingExisting {
                videos = page.posts
            } else {
                let existing = Set(videos.map(\.id))
                videos.append(contentsOf: page.posts.filter { !existing.contains($0.id) })
            }
            cursor = page.nextCursor
            phase = .loaded
            isLoadingMore = false
            interactions?.seed(page.posts, replacing: replacingExisting)
        } catch {
            isLoadingMore = false
            if videos.isEmpty {
                phase = .failed(error as? ApiError ?? .transport(underlying: "\(error)"))
            } else {
                phase = .loaded
            }
        }
    }
}

/// ZRP Shorts: the vertical video feed.
///
/// The same `GET /api/videos` the website's /shorts page and Android's
/// ShortsScreen read - one video per screen, swiped vertically, looping
/// and muted until asked, exactly as both of those behave.
///
/// Playback goes through the app's existing `FeedVideoCoordinator`
/// rather than a second player built for this screen: one `AVQueuePlayer`
/// for the whole app is what keeps a video feed from holding several
/// decoders and their buffers alive at once. Here the coordinator's job
/// is simpler than in a timeline - a page is either the one on screen or
/// it is not - so visibility is reported as 1 or 0 rather than measured.
struct ShortsView: View {

    @EnvironmentObject private var interactions: PostInteractionStore
    @EnvironmentObject private var videos: FeedVideoCoordinator

    @StateObject private var viewModel: ShortsViewModel
    @State private var currentId: String?

    /// The video to open on, when Shorts was entered by tapping one in a
    /// timeline. `nil` opens at the top of the feed.
    init(startId: String? = nil) {
        _viewModel = StateObject(wrappedValue: ShortsViewModel(startId: startId))
    }

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
                if viewModel.videos.isEmpty {
                    empty
                } else {
                    pager
                }
            }
        }
        .navigationTitle(Text(.navShorts))
        .navigationBarTitleDisplayMode(.inline)
        .toolbarBackground(.black, for: .navigationBar)
        .toolbarColorScheme(.dark, for: .navigationBar)
        // The tab bar and the mini-player both belong to the timeline,
        // not to a full-screen video. Hiding them is what makes this a
        // viewer rather than a screen with a video on it.
        .toolbar(.hidden, for: .tabBar)
        .task {
            viewModel.attach(interactions: interactions)
            await viewModel.loadIfNeeded()
        }
        // The feed's own video must not keep playing behind this, and
        // this one must not keep playing after it is left.
        .onDisappear { videos.stop() }
    }

    private var empty: some View {
        VStack(spacing: ZrpSpacing.md) {
            Image(systemName: "play.rectangle.on.rectangle")
                .font(.largeTitle)
            Text(.shortsNoShortsYet)
                .font(.subheadline)
                .multilineTextAlignment(.center)
        }
        .foregroundStyle(.white.opacity(0.85))
        .padding(ZrpSpacing.xl)
    }

    private var pager: some View {
        ScrollView(.vertical) {
            LazyVStack(spacing: 0) {
                ForEach(viewModel.videos) { post in
                    ShortPageView(post: post, isCurrent: post.id == currentId)
                        .containerRelativeFrame([.horizontal, .vertical])
                        .id(post.id)
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
            // happened, and nothing else would tell the coordinator that.
            if currentId == nil { currentId = viewModel.videos.first?.id }
        }
        .onChange(of: currentId) { previous, current in
            // Exactly one video plays: the one filling the screen.
            if let previous { videos.report(id: previous, visibleFraction: 0) }
            guard let current else { return }
            videos.report(id: current, visibleFraction: 1)
            Task { await viewModel.loadMoreIfNeeded(currentId: current) }
        }
    }
}

/// One full-screen short: the video, and the controls over it.
private struct ShortPageView: View {

    let post: Post
    let isCurrent: Bool

    @EnvironmentObject private var interactions: PostInteractionStore
    @EnvironmentObject private var videos: FeedVideoCoordinator
    @EnvironmentObject private var music: MusicPlayer
    @EnvironmentObject private var navigator: Navigator

    private var interaction: PostInteraction { interactions.interaction(for: post) }

    private var shareURL: URL? {
        URL(string: "https://zrp.one/post/\(post.id)")
    }

    var body: some View {
        ZStack {
            Color.black

            if isCurrent, videos.activeId == post.id {
                // `resizeAspect` inside a black screen rather than a
                // crop: a short can be filmed at any ratio, and filling
                // the screen would cut the subject out of a wide one.
                PlayerSurface(player: videos.player)
            } else {
                Image(systemName: "play.circle.fill")
                    .font(.system(size: 56))
                    .foregroundStyle(.white.opacity(0.9))
            }
        }
        .overlay(alignment: .bottomLeading) { caption }
        .overlay(alignment: .bottomTrailing) { actions }
        .clipped()
        .onAppear {
            if let url = post.imageUrl { videos.register(id: post.id, url: url) }
            if isCurrent { videos.report(id: post.id, visibleFraction: 1) }
        }
        .onDisappear { videos.unregister(id: post.id) }
    }

    private var caption: some View {
        VStack(alignment: .leading, spacing: ZrpSpacing.sm) {
            Button {
                navigator.push(.profile(username: post.author.username))
            } label: {
                HStack(spacing: ZrpSpacing.sm) {
                    AvatarView(
                        url: post.author.avatarUrl,
                        displayName: post.author.displayName,
                        size: ZrpMetrics.avatarSmall
                    )
                    Text(verbatim: post.author.displayName)
                        .font(.subheadline.weight(.semibold))
                    VerifiedBadge(badgeType: post.author.badgeType)
                }
                .foregroundStyle(.white)
            }
            .buttonStyle(.plain)

            if !post.content.isEmpty {
                Text(verbatim: interaction.contentOverride ?? post.content)
                    .font(.footnote)
                    .foregroundStyle(.white.opacity(0.92))
                    .lineLimit(3)
            }
        }
        .padding(ZrpSpacing.lg)
        .padding(.bottom, ZrpSpacing.xxl)
        .frame(maxWidth: .infinity, alignment: .leading)
        .background(
            LinearGradient(
                colors: [.clear, .black.opacity(0.65)],
                startPoint: .top,
                endPoint: .bottom
            )
        )
    }

    private var actions: some View {
        VStack(spacing: ZrpSpacing.lg) {
            action(
                systemImage: interaction.liked ? "heart.fill" : "heart",
                count: interaction.likeCount,
                tint: interaction.liked ? ZrpColor.red : .white,
                label: .shortsLike
            ) {
                Task { await interactions.toggleLike(post) }
            }

            action(
                systemImage: "arrow.2.squarepath",
                count: interaction.repostCount,
                tint: interaction.reposted == true ? ZrpColor.green : .white,
                label: .shortsRepost
            ) {
                Task { await interactions.toggleRepost(post) }
            }

            action(
                systemImage: "bubble.right",
                count: post.counts.comments,
                tint: .white,
                label: .actionReply
            ) {
                navigator.push(.postDetail(postId: post.id, preloaded: post))
            }

            if let shareURL {
                ShareLink(item: shareURL) {
                    icon("square.and.arrow.up", tint: .white)
                }
                .accessibilityLabel(Text(.shortsShare))
            }

            Button {
                // Unmuting while ZRP's own music plays would put two
                // things through the speaker at once. The video is what
                // is being watched, so the music yields - and only on a
                // deliberate unmute, never on autoplay.
                if videos.isMuted, music.isPlaying { music.pause() }
                videos.toggleMute()
            } label: {
                icon(videos.isMuted ? "speaker.slash.fill" : "speaker.wave.2.fill", tint: .white)
            }
            .accessibilityLabel(Text(videos.isMuted ? L10nKey.shortsUnmute : L10nKey.shortsMute))
        }
        .buttonStyle(.plain)
        .padding(ZrpSpacing.lg)
        .padding(.bottom, ZrpSpacing.xxl)
    }

    private func action(
        systemImage: String,
        count: Int,
        tint: Color,
        label: L10nKey,
        action: @escaping () -> Void
    ) -> some View {
        Button(action: action) {
            VStack(spacing: 2) {
                icon(systemImage, tint: tint)
                if let formatted = CountFormatting.compact(count) {
                    Text(verbatim: formatted)
                        .font(.caption2.weight(.semibold))
                        .foregroundStyle(.white)
                }
            }
        }
        .accessibilityLabel(Text(label))
        .accessibilityValue(Text(verbatim: CountFormatting.exact(count)))
    }

    private func icon(_ systemImage: String, tint: Color) -> some View {
        Image(systemName: systemImage)
            .font(.title2)
            .foregroundStyle(tint)
            .frame(width: ZrpMetrics.minTouchTarget, height: ZrpMetrics.minTouchTarget)
            .background(.black.opacity(0.35), in: Circle())
    }
}
