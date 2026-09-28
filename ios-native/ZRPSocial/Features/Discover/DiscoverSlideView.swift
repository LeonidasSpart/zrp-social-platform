import AVFoundation
import SwiftUI

/// One full-screen Discover item: the video (or, for a locked premium
/// post, a real preview with no purchase button), and the controls over
/// it. Structured like `ShortPageView` (`ShortsView.swift`), Discover's
/// own sibling feed, but with the richer action set `DiscoverSlide.tsx`
/// has on web: a follow button, a comments count, and an overflow menu
/// (why am I seeing this / not interested / mute / block / report).
struct DiscoverSlideView: View {

    let item: DiscoverItem
    let isCurrent: Bool
    let followState: DiscoverFollowState
    /// 0...1, only meaningful while this slide is the active one -
    /// drives the thin progress bar at the top of the video.
    let activeProgress: Double

    let onToggleLike: () -> Void
    let onToggleRepost: () -> Void
    let onToggleSave: () -> Void
    let onToggleFollow: () -> Void
    let onPlaying: () -> Void
    let onProgress: (Double, Double) -> Void
    let onPlaybackError: () -> Void
    let onNotInterested: () -> Void
    let onMuteCreator: () -> Void
    let onBlockCreator: () -> Void

    @EnvironmentObject private var session: SessionController
    @EnvironmentObject private var videos: FeedVideoCoordinator
    @EnvironmentObject private var music: MusicPlayer
    @EnvironmentObject private var navigator: Navigator

    @State private var isReporting = false
    @State private var isExplainingReason = false

    private var isOwnItem: Bool {
        session.currentUser?.id == item.author.id
    }

    private var isAuthenticated: Bool {
        session.currentUser != nil
    }

    private var isActivePlayer: Bool {
        isCurrent && videos.activeId == item.id
    }

    private var shareURL: URL? {
        URL(string: "https://zrp.one/post/\(item.id)")
    }

    var body: some View {
        ZStack {
            Color.black

            if let premiumPost = item.premiumPost, premiumPost.locked {
                lockedContent(premiumPost)
            } else if isActivePlayer {
                PlayerSurface(player: videos.player)
                    .task(id: isActivePlayer) {
                        guard isActivePlayer else { return }
                        onPlaying()
                        while !Task.isCancelled {
                            // `FeedVideoCoordinator` exposes no error
                            // signal of its own (Shorts has never needed
                            // one), so a failed item is caught here on
                            // the same poll that already reports
                            // progress, rather than adding KVO/
                            // NotificationCenter plumbing to shared
                            // infrastructure for this one feed.
                            if videos.player.currentItem?.status == .failed {
                                onPlaybackError()
                                return
                            }
                            let position = videos.player.currentTime().seconds
                            let duration = videos.player.currentItem?.duration.seconds ?? .nan
                            onProgress(position, duration)
                            try? await Task.sleep(for: .milliseconds(250))
                        }
                    }
            } else {
                Image(systemName: "play.circle.fill")
                    .font(.system(size: 56))
                    .foregroundStyle(.white.opacity(0.9))
            }
        }
        .overlay(alignment: .top) { progressBar }
        .overlay(alignment: .bottomLeading) { caption }
        .overlay(alignment: .bottomTrailing) { actions }
        .clipped()
        .onAppear {
            if let url = item.media.url { videos.register(id: item.id, url: url) }
        }
        .onDisappear { videos.unregister(id: item.id) }
        .sheet(isPresented: $isReporting) {
            ReportSheet(target: .post(item.id))
        }
        .sheet(isPresented: $isExplainingReason) {
            whyAmISeeingSheet
        }
    }

    @ViewBuilder
    private func lockedContent(_ premiumPost: DiscoverPremiumPost) -> some View {
        VStack(spacing: ZrpSpacing.md) {
            Image(systemName: "lock.fill")
                .font(.largeTitle)
                .padding(ZrpSpacing.lg)
                .background(.white.opacity(0.1), in: Circle())
            Text(.shortsPremiumLockedTitle)
                .font(.headline)
            Text(.shortsPremiumLockedBody, ["price": formattedPrice(premiumPost.price), "currency": premiumPost.currency])
                .font(.subheadline)
                .foregroundStyle(.white.opacity(0.7))
            Button {
                navigator.push(.postDetail(postId: item.id, preloaded: nil, targetCommentId: nil))
            } label: {
                Text(.shortsPremiumLockedCta)
                    .font(.subheadline.weight(.semibold))
                    .padding(.horizontal, ZrpSpacing.lg)
                    .padding(.vertical, ZrpSpacing.sm)
                    .background(.white.opacity(0.15), in: Capsule())
            }
            .padding(.top, ZrpSpacing.xs)
        }
        .foregroundStyle(.white)
        .multilineTextAlignment(.center)
        .padding(ZrpSpacing.xl)
    }

    private func formattedPrice(_ price: Double) -> String {
        price == price.rounded() ? String(Int(price)) : String(format: "%.2f", price)
    }

    private var progressBar: some View {
        Group {
            if isCurrent, item.premiumPost?.locked != true {
                GeometryReader { geometry in
                    Rectangle()
                        .fill(.white)
                        .frame(width: geometry.size.width * activeProgress)
                }
                .frame(height: 2)
                .background(.white.opacity(0.2))
            }
        }
    }

    private var caption: some View {
        VStack(alignment: .leading, spacing: ZrpSpacing.sm) {
            HStack(spacing: ZrpSpacing.sm) {
                Button {
                    navigator.push(.profile(username: item.author.username))
                } label: {
                    HStack(spacing: ZrpSpacing.sm) {
                        AvatarView(url: item.author.avatarUrl, displayName: item.author.displayName, size: ZrpMetrics.avatarSmall)
                        Text(verbatim: item.author.displayName)
                            .font(.subheadline.weight(.semibold))
                        VerifiedBadge(badgeType: item.author.badgeType)
                        Text(verbatim: RelativeTime.compact(from: item.createdAt))
                            .font(.footnote)
                            .foregroundStyle(.white.opacity(0.7))
                    }
                    .foregroundStyle(.white)
                }
                .buttonStyle(.plain)

                if !isOwnItem {
                    Button(action: onToggleFollow) {
                        Text(followLabel)
                            .font(.caption.weight(.semibold))
                            .padding(.horizontal, ZrpSpacing.sm)
                            .padding(.vertical, 4)
                            .background(followState == .following ? .white.opacity(0.15) : .white, in: Capsule())
                            .foregroundStyle(followState == .following ? .white : .black)
                    }
                }
            }

            if !item.caption.isEmpty {
                Text(verbatim: item.caption)
                    .font(.footnote)
                    .foregroundStyle(.white.opacity(0.92))
                    .lineLimit(3)
            }
        }
        .padding(ZrpSpacing.lg)
        .padding(.bottom, ZrpSpacing.xxl)
        .frame(maxWidth: .infinity, alignment: .leading)
        .background(
            LinearGradient(colors: [.clear, .black.opacity(0.65)], startPoint: .top, endPoint: .bottom)
        )
    }

    private var followLabel: L10nKey {
        switch followState {
        case .none: return .actionFollow
        case .following: return .actionFollowing
        case .requested: return .actionRequested
        }
    }

    private var actions: some View {
        VStack(spacing: ZrpSpacing.lg) {
            action(
                systemImage: item.viewerState.liked ? "heart.fill" : "heart",
                count: item.stats.likes,
                tint: item.viewerState.liked ? ZrpColor.red : .white,
                label: .shortsLike,
                action: onToggleLike
            )

            if item.commentsEnabled {
                action(
                    systemImage: "bubble.right",
                    count: item.stats.comments,
                    tint: .white,
                    label: .discoverComments
                ) {
                    navigator.push(.postDetail(postId: item.id, preloaded: nil, targetCommentId: nil))
                }
            }

            action(
                systemImage: "arrow.2.squarepath",
                count: item.stats.reposts,
                tint: item.viewerState.reposted ? ZrpColor.green : .white,
                label: .shortsRepost,
                action: onToggleRepost
            )

            // No count, matching web's own bookmark button - a save
            // tally is not something this feed reports per post.
            Button(action: onToggleSave) {
                icon(item.viewerState.saved ? "bookmark.fill" : "bookmark", tint: .white)
            }
            .accessibilityLabel(Text(.navBookmarks))

            if let shareURL {
                ShareLink(item: shareURL) {
                    icon("square.and.arrow.up", tint: .white)
                }
                .accessibilityLabel(Text(.shortsShare))
            }

            Menu {
                Button {
                    isExplainingReason = true
                } label: {
                    Label { Text(.discoverWhyAmISeeing) } icon: { Image(systemName: "info.circle") }
                }

                if isAuthenticated, !isOwnItem {
                    Button(action: onNotInterested) {
                        Label { Text(.discoverNotInterested) } icon: { Image(systemName: "eye.slash") }
                    }
                    Button(action: onMuteCreator) {
                        Label { Text(.discoverMuteCreator) } icon: { Image(systemName: "speaker.slash") }
                    }
                    Button(action: onBlockCreator) {
                        Label { Text(.discoverBlockCreator) } icon: { Image(systemName: "hand.raised") }
                    }
                    Button {
                        isReporting = true
                    } label: {
                        Label { Text(.reportModalTitle) } icon: { Image(systemName: "flag") }
                    }
                }
            } label: {
                icon("ellipsis", tint: .white)
            }
            .accessibilityLabel(Text(.discoverMore))

            Button {
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

    private var whyAmISeeingSheet: some View {
        NavigationStack {
            VStack(alignment: .leading, spacing: ZrpSpacing.md) {
                Text(item.reason == "recent" ? L10nKey.discoverReasonRecent : L10nKey.discoverReasonPopular)
                    .font(.body)
            }
            .padding(ZrpSpacing.lg)
            .frame(maxWidth: .infinity, alignment: .leading)
            .navigationTitle(Text(.discoverWhyAmISeeing))
            .navigationBarTitleDisplayMode(.inline)
            .toolbar {
                ToolbarItem(placement: .cancellationAction) {
                    Button {
                        isExplainingReason = false
                    } label: {
                        Text(.discoverCloseExplanation)
                    }
                }
            }
            .presentationDetents([.fraction(0.3)])
        }
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
