import AVFoundation
import AVKit
import CoreMedia
import SwiftUI
import UIKit

/// Full-screen story playback.
///
/// Auto-advances on a timer, pauses while held, steps back and forward on
/// tap, and dismisses on a downward swipe - the behaviour the web and
/// Android viewers both have. Every visible control performs a real
/// action against the backend.
struct StoryViewerView: View {

    let group: StoryGroup
    let startIndex: Int

    /// Who is watching, so the viewer can show view counts to the story's
    /// own author and to nobody else - without reaching for global
    /// session state from inside a view.
    let viewerId: String?

    @ObservedObject var viewModel: StoriesViewModel
    @Environment(\.dismiss) private var dismiss
    @Environment(\.accessibilityReduceMotion) private var reduceMotion

    @State private var index: Int
    @State private var progress: Double = 0
    @State private var isPaused = false
    @State private var player: AVPlayer?

    /// The real length of the current video story, once its asset has
    /// reported one. `nil` for an image or text story, and for a video
    /// whose duration has not loaded yet.
    @State private var videoDuration: Double?

    /// How long an image or text story is shown. A video story runs for
    /// its own loaded duration instead - see `advanceInterval`.
    private let imageDuration: Double = 5

    /// Timer granularity. Fine enough that the progress bar looks
    /// continuous, coarse enough not to wake the CPU needlessly.
    private let tick: Double = 0.02

    init(
        group: StoryGroup,
        startIndex: Int,
        viewerId: String?,
        viewModel: StoriesViewModel
    ) {
        self.group = group
        self.startIndex = startIndex
        self.viewerId = viewerId
        self.viewModel = viewModel
        _index = State(initialValue: min(startIndex, max(0, group.stories.count - 1)))
    }

    private var story: Story? {
        guard group.stories.indices.contains(index) else { return nil }
        return viewModel.current(group.stories[index])
    }

    var body: some View {
        ZStack {
            Color.black.ignoresSafeArea()

            if let story {
                media(for: story)
                overlay(for: story)
            }
        }
        .statusBarHidden()
        .onAppear { start() }
        .onDisappear { teardown() }
        .onChange(of: index) { _, _ in start() }
        // A downward drag dismisses, matching every other story viewer.
        // The threshold is generous so it does not fight the tap targets.
        .gesture(
            DragGesture(minimumDistance: 30)
                .onEnded { value in
                    if value.translation.height > 80 { dismiss() }
                }
        )
        .task(id: "\(index)-\(isPaused)-\(videoDuration ?? 0)") { await runTimer() }
    }

    // MARK: - Media

    @ViewBuilder
    private func media(for story: Story) -> some View {
        if let mediaUrl = story.mediaUrl, let url = URL(string: mediaUrl) {
            if story.isVideo {
                videoLayer(url: url)
            } else {
                AsyncImage(url: url) { phase in
                    switch phase {
                    case .success(let image):
                        image.resizable().scaledToFit()
                    case .failure:
                        Image(systemName: "photo")
                            .font(.largeTitle)
                            .foregroundStyle(.white.opacity(0.6))
                    case .empty:
                        ProgressView().tint(.white)
                    @unknown default:
                        EmptyView()
                    }
                }
                .frame(maxWidth: .infinity, maxHeight: .infinity)
            }
        } else {
            // A text-only story: the API allows content with no media.
            Text(verbatim: story.content ?? "")
                .font(.title2.weight(.medium))
                .foregroundStyle(.white)
                .multilineTextAlignment(.center)
                .padding(ZrpSpacing.xxl)
                .frame(maxWidth: .infinity, maxHeight: .infinity)
                .background(
                    LinearGradient(
                        colors: [ZrpColor.red, ZrpColor.darkRed],
                        startPoint: .topLeading,
                        endPoint: .bottomTrailing
                    )
                )
        }
    }

    @ViewBuilder
    private func videoLayer(url: URL) -> some View {
        if let player {
            VideoPlayer(player: player)
                .disabled(true)
                .ignoresSafeArea()
        } else {
            ProgressView()
                .tint(.white)
                .task {
                    try? AVAudioSession.sharedInstance().setCategory(.playback)
                    try? AVAudioSession.sharedInstance().setActive(true)

                    let asset = AVURLAsset(url: url)
                    // Load the real duration so a video story runs for its
                    // own length rather than an arbitrary fixed one. A
                    // failure here is not fatal: the timer falls back to
                    // the image duration.
                    if let duration = try? await asset.load(.duration) {
                        let seconds = CMTimeGetSeconds(duration)
                        if seconds.isFinite, seconds > 0 {
                            videoDuration = seconds
                        }
                    }
                    guard !Task.isCancelled else { return }

                    let created = AVPlayer(playerItem: AVPlayerItem(asset: asset))
                    player = created
                    created.play()
                }
        }
    }

    // MARK: - Overlay

    private func overlay(for story: Story) -> some View {
        VStack(spacing: 0) {
            progressBars
            header(for: story)
            Spacer()
            if story.mediaUrl != nil, let content = story.content, !content.isEmpty {
                Text(verbatim: content)
                    .font(.subheadline)
                    .foregroundStyle(.white)
                    .padding(ZrpSpacing.md)
                    .frame(maxWidth: .infinity, alignment: .leading)
                    .background(.black.opacity(0.35))
            }
            footer(for: story)
        }
        .background(tapAndHoldLayer)
    }

    /// Tap left/right to step, press and hold to pause. Placed behind the
    /// controls so the like button and close button still receive their
    /// own taps.
    private var tapAndHoldLayer: some View {
        HStack(spacing: 0) {
            Color.clear.contentShape(Rectangle()).onTapGesture { step(-1) }
            Color.clear.contentShape(Rectangle()).onTapGesture { step(1) }
        }
        .simultaneousGesture(
            LongPressGesture(minimumDuration: 0.18)
                .onChanged { _ in setPaused(true) }
                .onEnded { _ in }
        )
        .simultaneousGesture(
            DragGesture(minimumDistance: 0)
                .onEnded { _ in setPaused(false) }
        )
        .accessibilityHidden(true)
    }

    private var progressBars: some View {
        HStack(spacing: 4) {
            ForEach(group.stories.indices, id: \.self) { position in
                GeometryReader { geometry in
                    ZStack(alignment: .leading) {
                        Capsule().fill(.white.opacity(0.3))
                        Capsule()
                            .fill(.white)
                            .frame(width: geometry.size.width * fill(for: position))
                    }
                }
                .frame(height: 2.5)
            }
        }
        .padding(.horizontal, ZrpSpacing.md)
        .padding(.top, ZrpSpacing.sm)
    }

    private func fill(for position: Int) -> Double {
        if position < index { return 1 }
        if position > index { return 0 }
        return min(max(progress, 0), 1)
    }

    private func header(for story: Story) -> some View {
        HStack(spacing: ZrpSpacing.sm) {
            AvatarView(
                url: group.user.avatarUrl,
                displayName: group.user.displayName,
                size: ZrpMetrics.avatarSmall
            )
            VStack(alignment: .leading, spacing: 0) {
                Text(verbatim: group.user.displayName)
                    .font(.footnote.weight(.semibold))
                    .foregroundStyle(.white)
                Text(verbatim: RelativeTime.compact(from: story.createdAt))
                    .font(.caption2)
                    .foregroundStyle(.white.opacity(0.75))
            }
            Spacer()
            Button { dismiss() } label: {
                Image(systemName: "xmark")
                    .font(.headline)
                    .foregroundStyle(.white)
                    .frame(width: ZrpMetrics.minTouchTarget, height: ZrpMetrics.minTouchTarget)
                    .contentShape(Rectangle())
            }
            .accessibilityLabel(Text(.iosA11yCloseStory))
        }
        .padding(.horizontal, ZrpSpacing.md)
        .padding(.top, ZrpSpacing.sm)
    }

    private func footer(for story: Story) -> some View {
        HStack(spacing: ZrpSpacing.lg) {
            Button {
                UIImpactFeedbackGenerator(style: .light).impactOccurred()
                Task { await viewModel.toggleLike(story) }
            } label: {
                HStack(spacing: ZrpSpacing.xs) {
                    Image(systemName: story.liked ? "heart.fill" : "heart")
                        .font(.title3)
                    if let count = CountFormatting.compact(story.likeCount) {
                        Text(verbatim: count).font(.footnote).monospacedDigit()
                    }
                }
                .foregroundStyle(story.liked ? ZrpColor.red : .white)
                .frame(minHeight: ZrpMetrics.minTouchTarget)
                .contentShape(Rectangle())
            }
            .buttonStyle(.plain)
            .accessibilityLabel(
                Text(story.liked ? L10nKey.iosA11yUnlikeStory : L10nKey.iosA11yLikeStory)
            )

            Spacer()

            // Views are the author's own metric; the API returns the count
            // to everyone, but only the author is shown it.
            if group.user.id == viewerId {
                Label {
                    Text(.iosStoriesViewCount, ["n": CountFormatting.exact(story.viewCount)])
                } icon: {
                    Image(systemName: "eye")
                }
                .font(.caption)
                .foregroundStyle(.white.opacity(0.8))
            }
        }
        .padding(.horizontal, ZrpSpacing.lg)
        .padding(.bottom, ZrpSpacing.lg)
    }

    // MARK: - Playback

    private func start() {
        progress = 0
        isPaused = false
        videoDuration = nil
        teardownPlayer()
        if let story { viewModel.markViewed(story) }
    }

    private func setPaused(_ paused: Bool) {
        guard isPaused != paused else { return }
        isPaused = paused
        if paused { player?.pause() } else { player?.play() }
    }

    private func step(_ delta: Int) {
        let next = index + delta
        if next < 0 {
            // Already at the first story - nothing before it in this
            // group, so stay put rather than dismissing unexpectedly.
            return
        }
        if next >= group.stories.count {
            dismiss()
            return
        }
        index = next
    }

    /// Drives the progress bar and the auto-advance.
    ///
    /// A `Task` loop rather than a `Timer`: it is cancelled automatically
    /// when the view goes away or `id:` changes, so a dismissed viewer
    /// cannot keep ticking in the background.
    private func runTimer() async {
        guard !isPaused else { return }

        let duration = advanceInterval
        while progress < 1 {
            try? await Task.sleep(for: .seconds(tick))
            if Task.isCancelled { return }
            guard !isPaused else { return }
            progress += tick / duration
        }
        step(1)
    }

    private var advanceInterval: Double {
        // A video runs for its own length; an image or text story gets the
        // fixed dwell. Reduced Motion lengthens that dwell rather than
        // removing progression entirely - a story that never advances
        // would strand the viewer with no way forward.
        let base = videoDuration ?? imageDuration
        return reduceMotion ? base * 1.6 : base
    }

    private func teardown() {
        teardownPlayer()
    }

    private func teardownPlayer() {
        player?.pause()
        player = nil
    }
}
