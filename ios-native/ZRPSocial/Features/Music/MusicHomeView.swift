import SwiftUI

@MainActor
final class MusicHomeViewModel: ObservableObject {

    enum Phase: Equatable {
        case idle
        case loading
        case loaded
        case failed(ApiError)
    }

    @Published private(set) var home: MusicHome?
    @Published private(set) var phase: Phase = .idle

    /// Per-track like state, held apart from the decoded rows for the
    /// same reason post interactions are: the same track appears in
    /// several sections of one response, and liking it in one should show
    /// in all of them.
    @Published private(set) var liked: [String: Bool] = [:]

    private let repository: MusicRepositoryProtocol

    init(repository: MusicRepositoryProtocol = MusicRepository()) {
        self.repository = repository
    }

    func isLiked(_ track: MusicTrack) -> Bool {
        liked[track.id] ?? track.liked ?? false
    }

    func loadIfNeeded() async {
        guard phase == .idle else { return }
        await load()
    }

    func load() async {
        if home == nil { phase = .loading }
        do {
            let fetched = try await repository.home()
            home = fetched
            phase = .loaded
            seedLikes(from: fetched)
        } catch {
            if home == nil {
                phase = .failed(error as? ApiError ?? .transport(underlying: "\(error)"))
            } else {
                phase = .loaded
            }
        }
    }

    private func seedLikes(from home: MusicHome) {
        for track in home.trending + home.newReleases + home.recentlyPlayed + home.likedPreview {
            if let value = track.liked { liked[track.id] = value }
        }
        // Everything in the liked preview is liked by definition - the
        // route builds it from the viewer's own likes.
        for track in home.likedPreview { liked[track.id] = true }
    }

    func toggleLike(_ track: MusicTrack) async {
        let previous = isLiked(track)
        liked[track.id] = !previous
        do {
            let result = try await repository.toggleLike(trackId: track.id)
            liked[track.id] = result
        } catch {
            liked[track.id] = previous
        }
    }
}

/// ZRP Music's home screen.
struct MusicHomeView: View {

    @EnvironmentObject private var player: MusicPlayer
    @StateObject private var viewModel = MusicHomeViewModel()

    var body: some View {
        content
            .background(ZrpColor.background.ignoresSafeArea())
            .navigationTitle(Text(.navMusic))
            .navigationBarTitleDisplayMode(.inline)
            .task { await viewModel.loadIfNeeded() }
    }

    @ViewBuilder
    private var content: some View {
        switch viewModel.phase {
        case .idle, .loading:
            TimelineStateView.loading()
        case .failed(let error):
            TimelineStateView.error(error) { Task { await viewModel.load() } }
        case .loaded:
            if let home = viewModel.home, !home.isEmpty {
                sections(home)
            } else {
                TimelineStateView.empty(
                    systemImage: "music.note.list",
                    title: .iosMusicEmptyTitle,
                    subtitle: .iosMusicEmptyBody
                )
            }
        }
    }

    private func sections(_ home: MusicHome) -> some View {
        ScrollView {
            LazyVStack(alignment: .leading, spacing: ZrpSpacing.xl) {
                trackSection(.iosMusicTrending, tracks: home.trending)
                trackSection(.iosMusicNewReleases, tracks: home.newReleases)
                trackSection(.musicHistoryTitle, tracks: home.recentlyPlayed)
                trackSection(.musicLikedTitle, tracks: home.likedPreview)
                albumSection(home.latestAlbums)
                artistSection(home.popularArtists)
            }
            .padding(.vertical, ZrpSpacing.lg)
            .frame(maxWidth: ZrpMetrics.contentMaxWidth)
            .frame(maxWidth: .infinity)
        }
        .refreshable { await viewModel.load() }
    }

    // MARK: - Sections

    @ViewBuilder
    private func trackSection(_ title: L10nKey, tracks: [MusicTrack]) -> some View {
        if !tracks.isEmpty {
            VStack(alignment: .leading, spacing: ZrpSpacing.sm) {
                header(title)
                ForEach(Array(tracks.enumerated()), id: \.element.id) { index, track in
                    TrackRowView(
                        track: track,
                        isLiked: viewModel.isLiked(track),
                        isCurrent: player.current?.id == track.id,
                        isPlaying: player.current?.id == track.id && player.isPlaying,
                        onPlay: {
                            // The whole section becomes the queue, so
                            // playback continues past the tapped row.
                            player.play(tracks, startingAt: index)
                        },
                        onToggleLike: { Task { await viewModel.toggleLike(track) } }
                    )
                }
            }
        }
    }

    @ViewBuilder
    private func albumSection(_ albums: [MusicAlbum]) -> some View {
        if !albums.isEmpty {
            VStack(alignment: .leading, spacing: ZrpSpacing.sm) {
                header(.iosMusicLatestAlbums)
                ScrollView(.horizontal, showsIndicators: false) {
                    HStack(alignment: .top, spacing: ZrpSpacing.md) {
                        ForEach(albums) { album in
                            VStack(alignment: .leading, spacing: ZrpSpacing.xs) {
                                TrackArtworkView(url: album.coverUrl, side: 132)
                                Text(verbatim: album.title)
                                    .font(.footnote.weight(.semibold))
                                    .foregroundStyle(ZrpColor.onSurface)
                                    .lineLimit(1)
                                Text(verbatim: album.artist?.displayName ?? "")
                                    .font(.caption2)
                                    .foregroundStyle(ZrpColor.onSurfaceMuted)
                                    .lineLimit(1)
                            }
                            .frame(width: 132)
                            .accessibilityElement(children: .combine)
                        }
                    }
                    .padding(.horizontal, ZrpSpacing.lg)
                }
            }
        }
    }

    @ViewBuilder
    private func artistSection(_ artists: [MusicArtist]) -> some View {
        if !artists.isEmpty {
            VStack(alignment: .leading, spacing: ZrpSpacing.sm) {
                header(.iosMusicPopularArtists)
                ScrollView(.horizontal, showsIndicators: false) {
                    HStack(alignment: .top, spacing: ZrpSpacing.md) {
                        ForEach(artists) { artist in
                            VStack(spacing: ZrpSpacing.xs) {
                                AvatarView(
                                    url: artist.avatarUrl,
                                    displayName: artist.displayName,
                                    size: 88
                                )
                                HStack(spacing: 2) {
                                    Text(verbatim: artist.displayName)
                                        .font(.caption.weight(.medium))
                                        .foregroundStyle(ZrpColor.onSurface)
                                        .lineLimit(1)
                                    if artist.verified {
                                        Image(systemName: "checkmark.seal.fill")
                                            .font(.caption2)
                                            .foregroundStyle(ZrpColor.blue)
                                    }
                                }
                            }
                            .frame(width: 96)
                            .accessibilityElement(children: .combine)
                        }
                    }
                    .padding(.horizontal, ZrpSpacing.lg)
                }
            }
        }
    }

    private func header(_ title: L10nKey) -> some View {
        Text(title)
            .font(.headline)
            .foregroundStyle(ZrpColor.onSurface)
            .padding(.horizontal, ZrpSpacing.lg)
    }
}

/// One track row: artwork, title, artist, duration, like, play.
struct TrackRowView: View {

    let track: MusicTrack
    let isLiked: Bool
    let isCurrent: Bool
    let isPlaying: Bool

    var onPlay: () -> Void
    var onToggleLike: () -> Void

    var body: some View {
        HStack(spacing: ZrpSpacing.md) {
            Button(action: onPlay) {
                HStack(spacing: ZrpSpacing.md) {
                    ZStack {
                        TrackArtworkView(url: track.artworkURL, side: 48)
                        if isCurrent {
                            Image(systemName: isPlaying ? "speaker.wave.2.fill" : "pause.fill")
                                .font(.caption)
                                .foregroundStyle(.white)
                                .padding(5)
                                .background(.black.opacity(0.55), in: Circle())
                        }
                    }

                    VStack(alignment: .leading, spacing: 2) {
                        Text(verbatim: track.title)
                            .font(.subheadline.weight(isCurrent ? .semibold : .regular))
                            .foregroundStyle(isCurrent ? ZrpColor.red : ZrpColor.onSurface)
                            .lineLimit(1)
                        HStack(spacing: ZrpSpacing.xs) {
                            Text(verbatim: track.artistName)
                                .font(.caption)
                                .foregroundStyle(ZrpColor.onSurfaceMuted)
                                .lineLimit(1)
                            if track.explicit {
                                Text(verbatim: "E")
                                    .font(.system(size: 9, weight: .bold))
                                    .padding(.horizontal, 3)
                                    .background(ZrpColor.surfaceHighest)
                                    .foregroundStyle(ZrpColor.onSurfaceMuted)
                                    .clipShape(RoundedRectangle(cornerRadius: 2))
                                    .accessibilityLabel(Text(.iosMusicExplicit))
                            }
                        }
                    }

                    Spacer(minLength: 0)

                    Text(verbatim: NowPlayingView.timeLabel(Double(track.durationSec ?? 0)))
                        .font(.caption.monospacedDigit())
                        .foregroundStyle(ZrpColor.onSurfaceMuted)
                }
                .contentShape(Rectangle())
            }
            .buttonStyle(.plain)
            // A track with no audio URL cannot play, so it is not offered
            // as if it could.
            .disabled(!track.isPlayable)

            Button(action: onToggleLike) {
                Image(systemName: isLiked ? "heart.fill" : "heart")
                    .font(.subheadline)
                    .foregroundStyle(isLiked ? ZrpColor.red : ZrpColor.onSurfaceMuted)
                    .frame(width: ZrpMetrics.minTouchTarget, height: ZrpMetrics.minTouchTarget)
                    .contentShape(Rectangle())
            }
            .buttonStyle(.plain)
            .accessibilityLabel(
                Text(isLiked ? L10nKey.iosA11yUnlikeTrack : L10nKey.iosA11yLikeTrack)
            )
        }
        .padding(.horizontal, ZrpSpacing.lg)
    }
}
