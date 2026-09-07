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

    private let repository: MusicRepositoryProtocol

    /// Like state lives in the app-wide store rather than here, so a
    /// track liked on this screen is also liked on the artist page, in
    /// the album it came from, and in the queue.
    private weak var likes: MusicLikeStore?

    init(repository: MusicRepositoryProtocol = MusicRepository()) {
        self.repository = repository
    }

    func attach(likes: MusicLikeStore) {
        self.likes = likes
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
        likes?.seed(home.trending + home.newReleases + home.recentlyPlayed)
        // Everything in the liked preview is liked by definition - the
        // route builds it from the viewer's own likes, and those track
        // rows carry no `liked` flag to seed from.
        likes?.markLiked(home.likedPreview)
    }
}

/// ZRP Music's home screen.
struct MusicHomeView: View {

    @EnvironmentObject private var player: MusicPlayer
    @EnvironmentObject private var likes: MusicLikeStore
    @EnvironmentObject private var navigator: Navigator
    @StateObject private var viewModel = MusicHomeViewModel()

    var body: some View {
        content
            .background(ZrpColor.background.ignoresSafeArea())
            .navigationTitle(Text(.navMusic))
            .navigationBarTitleDisplayMode(.inline)
            // Only offered when there is a queue to look at - an empty
            // control that opens an empty screen is not worth a toolbar
            // slot.
            .toolbar {
                if !player.queue.isEmpty {
                    ToolbarItem(placement: .topBarTrailing) {
                        Button {
                            navigator.push(.musicQueue)
                        } label: {
                            Image(systemName: "list.bullet")
                        }
                        .accessibilityLabel(Text(.musicNavQueueTitle))
                    }
                }
            }
            .task {
                viewModel.attach(likes: likes)
                await viewModel.loadIfNeeded()
            }
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
                browseRow
                trackSection(.iosMusicTrending, tracks: home.trending, seeAll: .musicDiscover)
                trackSection(.iosMusicNewReleases, tracks: home.newReleases, seeAll: .musicDiscover)
                trackSection(.musicHistoryTitle, tracks: home.recentlyPlayed, seeAll: .musicHistory)
                trackSection(.musicLikedTitle, tracks: home.likedPreview, seeAll: .musicLiked)
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

    /// Every browsable surface of ZRP Music, reachable from its home.
    ///
    /// A row of destinations rather than a tab bar: the music section is
    /// one destination inside the app's own navigation stack, and giving
    /// it a second tab bar would put two of them on screen at once.
    private var browseRow: some View {
        ScrollView(.horizontal, showsIndicators: false) {
            HStack(spacing: ZrpSpacing.sm) {
                browseChip(.musicNavDiscoverTitle, systemImage: "sparkles", route: .musicDiscover)
                browseChip(.musicArtistsTitle, systemImage: "music.mic", route: .musicArtists)
                browseChip(.musicAlbumsTitle, systemImage: "square.stack", route: .musicAlbums)
                browseChip(.musicNavPlaylistsTitle, systemImage: "music.note.list", route: .musicPlaylists)
                browseChip(.musicLikedTitle, systemImage: "heart", route: .musicLiked)
                browseChip(.musicHistoryTitle, systemImage: "clock.arrow.circlepath", route: .musicHistory)
            }
            .padding(.horizontal, ZrpSpacing.lg)
        }
    }

    private func browseChip(_ title: L10nKey, systemImage: String, route: Route) -> some View {
        Button {
            navigator.push(route)
        } label: {
            Label { Text(title) } icon: { Image(systemName: systemImage) }
                .font(.footnote.weight(.medium))
                .padding(.horizontal, ZrpSpacing.md)
                .frame(minHeight: ZrpMetrics.minTouchTarget)
                .background(ZrpColor.surfaceHighest)
                .foregroundStyle(ZrpColor.onSurface)
                .clipShape(Capsule())
        }
        .buttonStyle(.plain)
    }

    @ViewBuilder
    private func trackSection(_ title: L10nKey, tracks: [MusicTrack], seeAll: Route?) -> some View {
        if !tracks.isEmpty {
            VStack(alignment: .leading, spacing: ZrpSpacing.sm) {
                header(title, seeAll: seeAll)
                ForEach(Array(tracks.enumerated()), id: \.element.id) { index, track in
                    TrackRowView(
                        track: track,
                        isLiked: likes.isLiked(track),
                        isCurrent: player.current?.id == track.id,
                        isPlaying: player.current?.id == track.id && player.isPlaying,
                        onPlay: {
                            // The whole section becomes the queue, so
                            // playback continues past the tapped row.
                            player.play(tracks, startingAt: index)
                        },
                        onToggleLike: { Task { await likes.toggle(track) } }
                    )
                }
            }
        }
    }

    @ViewBuilder
    private func albumSection(_ albums: [MusicAlbum]) -> some View {
        if !albums.isEmpty {
            VStack(alignment: .leading, spacing: ZrpSpacing.sm) {
                header(.iosMusicLatestAlbums, seeAll: .musicAlbums)
                ScrollView(.horizontal, showsIndicators: false) {
                    HStack(alignment: .top, spacing: ZrpSpacing.md) {
                        ForEach(albums) { album in
                            Button {
                                navigator.push(.musicAlbum(id: album.id))
                            } label: {
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
                                .contentShape(Rectangle())
                            }
                            .buttonStyle(.plain)
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
                header(.iosMusicPopularArtists, seeAll: .musicArtists)
                ScrollView(.horizontal, showsIndicators: false) {
                    HStack(alignment: .top, spacing: ZrpSpacing.md) {
                        ForEach(artists) { artist in
                            Button {
                                navigator.push(.musicArtist(id: artist.id))
                            } label: {
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
                                .contentShape(Rectangle())
                            }
                            .buttonStyle(.plain)
                            .accessibilityElement(children: .combine)
                        }
                    }
                    .padding(.horizontal, ZrpSpacing.lg)
                }
            }
        }
    }

    private func header(_ title: L10nKey, seeAll: Route?) -> some View {
        HStack(alignment: .firstTextBaseline) {
            Text(title)
                .font(.headline)
                .foregroundStyle(ZrpColor.onSurface)
            Spacer(minLength: ZrpSpacing.md)
            if let seeAll {
                Button {
                    navigator.push(seeAll)
                } label: {
                    Text(.musicShellSeeAll)
                        .font(.footnote.weight(.medium))
                        .foregroundStyle(ZrpColor.red)
                }
                .buttonStyle(.plain)
            }
        }
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
