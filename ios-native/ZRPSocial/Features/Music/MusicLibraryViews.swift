import SwiftUI

/// Liked tracks and listening history, both from `GET /api/music/library`.
///
/// One screen type for both because they are the same list from the same
/// response - only which slice differs.
struct MusicLibraryListView: View {

    enum Kind {
        case liked
        case history

        var titleKey: L10nKey {
            switch self {
            case .liked: return .musicLikedTitle
            case .history: return .musicHistoryTitle
            }
        }

        var emptyTitleKey: L10nKey {
            switch self {
            case .liked: return .musicLikedEmptyTitle
            case .history: return .musicHistoryEmptyTitle
            }
        }

        var emptyBodyKey: L10nKey {
            switch self {
            case .liked: return .musicLikedEmptyBody
            case .history: return .musicHistoryEmptyBody
            }
        }

        var systemImage: String {
            switch self {
            case .liked: return "heart"
            case .history: return "clock.arrow.circlepath"
            }
        }
    }

    let kind: Kind

    @EnvironmentObject private var player: MusicPlayer
    @EnvironmentObject private var likes: MusicLikeStore
    @State private var library: MusicLibrary?
    @State private var loadError: ApiError?

    private let repository = MusicRepository()

    private var tracks: [MusicTrack] {
        guard let library else { return [] }
        switch kind {
        case .liked: return library.likedTracks
        case .history: return library.recentlyPlayedTracks
        }
    }

    var body: some View {
        Group {
            if let loadError, library == nil {
                TimelineStateView.error(loadError) { Task { await load() } }
            } else if library == nil {
                TimelineStateView.loading()
            } else if tracks.isEmpty {
                TimelineStateView.empty(
                    systemImage: kind.systemImage,
                    title: kind.emptyTitleKey,
                    subtitle: kind.emptyBodyKey
                )
            } else {
                list
            }
        }
        .background(ZrpColor.background.ignoresSafeArea())
        .navigationTitle(Text(kind.titleKey))
        .navigationBarTitleDisplayMode(.inline)
        .task { await load() }
    }

    private func load() async {
        do {
            let fetched = try await repository.library()
            library = fetched
            // The response carries the viewer's whole like set, so this
            // is seeded for both pages: a track shown in History is
            // correctly hearted when it is also liked. Nothing here
            // carries a `liked` flag to read, but every row under `likes`
            // is a like by construction.
            likes.markLiked(fetched.likedTracks)
            loadError = nil
        } catch {
            loadError = error as? ApiError ?? .transport(underlying: "\(error)")
        }
    }

    private var list: some View {
        ScrollView {
            LazyVStack(spacing: 0) {
                ForEach(Array(tracks.enumerated()), id: \.element.id) { index, track in
                    TrackRowView(
                        track: track,
                        // Everything in the liked list is liked by
                        // definition - the rows come from the viewer's own
                        // likes, and the track objects there carry no
                        // `liked` flag of their own.
                        isLiked: likes.isLiked(track),
                        isCurrent: player.current?.id == track.id,
                        isPlaying: player.current?.id == track.id && player.isPlaying,
                        onPlay: { player.play(tracks, startingAt: index) },
                        onToggleLike: { Task { await likes.toggle(track) } }
                    )
                    .padding(.vertical, ZrpSpacing.xs)
                }
            }
            .padding(.vertical, ZrpSpacing.md)
            .frame(maxWidth: ZrpMetrics.contentMaxWidth)
            .frame(maxWidth: .infinity)
        }
        .refreshable { await load() }
    }
}

/// The viewer's playlists, and one playlist's tracks.
struct MusicPlaylistsView: View {

    @EnvironmentObject private var navigator: Navigator
    @StateObject private var viewModel = MusicListViewModel<MusicPlaylist> { _ in
        try await MusicRepository().playlists()
    }

    var body: some View {
        Group {
            switch viewModel.phase {
            case .idle, .loading:
                TimelineStateView.loading()
            case .failed(let error):
                TimelineStateView.error(error) { Task { await viewModel.run() } }
            case .loaded:
                if viewModel.items.isEmpty {
                    TimelineStateView.empty(
                        systemImage: "music.note.list",
                        title: .iosMusicPlaylistsEmpty,
                        subtitle: .iosMusicPlaylistsEmptyBody
                    )
                } else {
                    list
                }
            }
        }
        .background(ZrpColor.background.ignoresSafeArea())
        .navigationTitle(Text(.musicNavPlaylistsTitle))
        .navigationBarTitleDisplayMode(.inline)
        .task { await viewModel.loadIfNeeded() }
    }

    private var list: some View {
        ScrollView {
            LazyVStack(spacing: 0) {
                ForEach(viewModel.items) { playlist in
                    Button {
                        navigator.push(.musicPlaylist(id: playlist.id))
                    } label: {
                        HStack(spacing: ZrpSpacing.md) {
                            TrackArtworkView(url: playlist.coverUrl, side: 52)
                            VStack(alignment: .leading, spacing: 2) {
                                Text(verbatim: playlist.name)
                                    .font(.subheadline.weight(.semibold))
                                    .foregroundStyle(ZrpColor.onSurface)
                                    .lineLimit(1)
                                if let description = playlist.description, !description.isEmpty {
                                    Text(verbatim: description)
                                        .font(.caption)
                                        .foregroundStyle(ZrpColor.onSurfaceMuted)
                                        .lineLimit(1)
                                }
                            }
                            Spacer(minLength: 0)
                        }
                        .padding(.horizontal, ZrpSpacing.lg)
                        .padding(.vertical, ZrpSpacing.md)
                        .contentShape(Rectangle())
                    }
                    .buttonStyle(.plain)
                    .accessibilityElement(children: .combine)
                }
            }
            .frame(maxWidth: ZrpMetrics.contentMaxWidth)
            .frame(maxWidth: .infinity)
        }
        .refreshable { await viewModel.run() }
    }
}

/// One playlist's ordered tracks.
struct MusicPlaylistDetailView: View {

    let playlistId: String

    @EnvironmentObject private var player: MusicPlayer
    @EnvironmentObject private var likes: MusicLikeStore
    @State private var detail: MusicPlaylistDetail?
    @State private var loadError: ApiError?

    private let repository = MusicRepository()

    var body: some View {
        Group {
            if let detail {
                body(for: detail)
            } else if let loadError {
                TimelineStateView.error(loadError) { Task { await load() } }
            } else {
                TimelineStateView.loading()
            }
        }
        .background(ZrpColor.background.ignoresSafeArea())
        .navigationTitle(Text(verbatim: detail?.name ?? ""))
        .navigationBarTitleDisplayMode(.inline)
        .task { await load() }
    }

    private func load() async {
        do {
            // Deliberately not seeded into the like store: this route is
            // the one track source that reports no `liked` flag, so its
            // tracks say nothing about like state and must not be read as
            // unliked.
            detail = try await repository.playlist(id: playlistId)
            loadError = nil
        } catch {
            loadError = error as? ApiError ?? .transport(underlying: "\(error)")
        }
    }

    private func body(for detail: MusicPlaylistDetail) -> some View {
        ScrollView {
            LazyVStack(spacing: 0) {
                if !detail.tracks.isEmpty {
                    Button {
                        player.play(detail.tracks, startingAt: 0)
                    } label: {
                        Label { Text(.musicCommonPlayAll) } icon: { Image(systemName: "play.fill") }
                            .font(.subheadline.weight(.semibold))
                            .padding(.horizontal, ZrpSpacing.xl)
                            .frame(minHeight: ZrpMetrics.minTouchTarget)
                            .background(ZrpColor.red)
                            .foregroundStyle(.white)
                            .clipShape(Capsule())
                    }
                    .padding(.vertical, ZrpSpacing.lg)
                }

                ForEach(Array(detail.tracks.enumerated()), id: \.element.id) { index, track in
                    TrackRowView(
                        track: track,
                        isLiked: likes.isLiked(track),
                        isCurrent: player.current?.id == track.id,
                        isPlaying: player.current?.id == track.id && player.isPlaying,
                        onPlay: { player.play(detail.tracks, startingAt: index) },
                        onToggleLike: { Task { await likes.toggle(track) } }
                    )
                    .padding(.vertical, ZrpSpacing.xs)
                }
            }
            .padding(.bottom, ZrpSpacing.lg)
            .frame(maxWidth: ZrpMetrics.contentMaxWidth)
            .frame(maxWidth: .infinity)
        }
        .refreshable { await load() }
    }
}

/// The live playback queue.
///
/// Driven directly by `MusicPlayer.queue` - this is the real queue that
/// governs what plays next, not a separate list that mirrors it.
struct MusicQueueView: View {

    @EnvironmentObject private var player: MusicPlayer
    @EnvironmentObject private var likes: MusicLikeStore

    var body: some View {
        Group {
            if player.queue.isEmpty {
                TimelineStateView.empty(
                    systemImage: "list.bullet",
                    title: .musicQueueEmptyTitle,
                    subtitle: .musicQueueEmptyBody
                )
            } else {
                list
            }
        }
        .background(ZrpColor.background.ignoresSafeArea())
        .navigationTitle(Text(.musicQueueTitle))
        .navigationBarTitleDisplayMode(.inline)
    }

    private var list: some View {
        ScrollView {
            LazyVStack(alignment: .leading, spacing: 0) {
                ForEach(Array(player.queue.enumerated()), id: \.element.id) { index, track in
                    if index == player.currentIndex {
                        sectionLabel(.musicQueueNowPlaying)
                    } else if index == player.currentIndex + 1 {
                        sectionLabel(.musicPlayerUpNextLabel)
                    }

                    TrackRowView(
                        track: track,
                        isLiked: likes.isLiked(track),
                        isCurrent: index == player.currentIndex,
                        isPlaying: index == player.currentIndex && player.isPlaying,
                        // Tapping a queue row jumps to it rather than
                        // rebuilding the queue, so the rest of what was
                        // lined up survives.
                        onPlay: { player.jump(to: index) },
                        onToggleLike: { Task { await likes.toggle(track) } }
                    )
                    .padding(.vertical, ZrpSpacing.xs)
                }
            }
            .padding(.vertical, ZrpSpacing.md)
            .frame(maxWidth: ZrpMetrics.contentMaxWidth)
            .frame(maxWidth: .infinity)
        }
    }

    private func sectionLabel(_ key: L10nKey) -> some View {
        Text(key)
            .font(.caption.weight(.semibold))
            .foregroundStyle(ZrpColor.onSurfaceMuted)
            .padding(.horizontal, ZrpSpacing.lg)
            .padding(.top, ZrpSpacing.md)
            .padding(.bottom, ZrpSpacing.xs)
    }
}
