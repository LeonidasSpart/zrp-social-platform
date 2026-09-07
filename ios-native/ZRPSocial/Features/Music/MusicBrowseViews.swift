import SwiftUI

/// A generic loader for the music browse screens.
///
/// Every one of them is the same shape - fetch a list, show loading,
/// error or empty, then render rows - so they share one view model
/// rather than five near-identical copies.
@MainActor
final class MusicListViewModel<Element>: ObservableObject {

    enum Phase: Equatable {
        case idle
        case loading
        case loaded
        case failed(ApiError)
    }

    @Published private(set) var items: [Element] = []
    @Published private(set) var phase: Phase = .idle
    @Published var query = ""

    private let load: (String?) async throws -> [Element]
    private var task: Task<Void, Never>?

    init(load: @escaping (String?) async throws -> [Element]) {
        self.load = load
    }

    func loadIfNeeded() async {
        guard phase == .idle else { return }
        await run()
    }

    /// Debounced, and cancels a superseded request so an earlier search
    /// cannot land after a later one.
    func search() {
        task?.cancel()
        task = Task { [weak self] in
            try? await Task.sleep(for: .milliseconds(300))
            guard !Task.isCancelled else { return }
            await self?.run()
        }
    }

    func run() async {
        if items.isEmpty { phase = .loading }
        let term = query.trimmingCharacters(in: .whitespacesAndNewlines)
        do {
            items = try await load(term.isEmpty ? nil : term)
            phase = .loaded
        } catch is CancellationError {
            return
        } catch ApiError.cancelled {
            return
        } catch {
            if items.isEmpty {
                phase = .failed(error as? ApiError ?? .transport(underlying: "\(error)"))
            } else {
                phase = .loaded
            }
        }
    }
}

/// Browse and search artists.
struct MusicArtistsView: View {

    @EnvironmentObject private var navigator: Navigator
    @StateObject private var viewModel = MusicListViewModel<MusicArtist> { query in
        try await MusicRepository().artists(query: query, sort: "popular", limit: 50)
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
                        systemImage: "music.mic",
                        title: .musicArtistsNoneFound,
                        subtitle: nil
                    )
                } else {
                    list
                }
            }
        }
        .background(ZrpColor.background.ignoresSafeArea())
        .navigationTitle(Text(.musicArtistsTitle))
        .navigationBarTitleDisplayMode(.inline)
        .searchable(
            text: $viewModel.query,
            placement: .navigationBarDrawer(displayMode: .always),
            prompt: Text(.musicArtistsSearchPlaceholder)
        )
        .onChange(of: viewModel.query) { _, _ in viewModel.search() }
        .task { await viewModel.loadIfNeeded() }
    }

    private var list: some View {
        ScrollView {
            LazyVStack(spacing: 0) {
                ForEach(viewModel.items) { artist in
                    Button {
                        navigator.push(.musicArtist(id: artist.id))
                    } label: {
                        HStack(spacing: ZrpSpacing.md) {
                            AvatarView(
                                url: artist.avatarUrl,
                                displayName: artist.displayName,
                                size: ZrpMetrics.avatarMedium
                            )
                            VStack(alignment: .leading, spacing: 2) {
                                HStack(spacing: ZrpSpacing.xs) {
                                    Text(verbatim: artist.displayName)
                                        .font(.subheadline.weight(.semibold))
                                        .foregroundStyle(ZrpColor.onSurface)
                                        .lineLimit(1)
                                    if artist.verified {
                                        Image(systemName: "checkmark.seal.fill")
                                            .font(.caption2)
                                            .foregroundStyle(ZrpColor.blue)
                                    }
                                }
                                if let counts = artist.counts {
                                    Text(verbatim: MusicCount.tracks(counts.tracks))
                                    .font(.caption)
                                    .foregroundStyle(ZrpColor.onSurfaceMuted)
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
    }
}

/// Browse and search albums.
struct MusicAlbumsView: View {

    @EnvironmentObject private var navigator: Navigator
    @StateObject private var viewModel = MusicListViewModel<MusicAlbum> { query in
        try await MusicRepository().albums(query: query, limit: 50)
    }

    private let columns = [GridItem(.adaptive(minimum: 140), spacing: ZrpSpacing.md)]

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
                        systemImage: "square.stack",
                        title: .musicAlbumsNoneFound,
                        subtitle: nil
                    )
                } else {
                    grid
                }
            }
        }
        .background(ZrpColor.background.ignoresSafeArea())
        .navigationTitle(Text(.musicAlbumsTitle))
        .navigationBarTitleDisplayMode(.inline)
        .searchable(
            text: $viewModel.query,
            placement: .navigationBarDrawer(displayMode: .always),
            prompt: Text(.musicAlbumsSearchPlaceholder)
        )
        .onChange(of: viewModel.query) { _, _ in viewModel.search() }
        .task { await viewModel.loadIfNeeded() }
    }

    private var grid: some View {
        ScrollView {
            LazyVGrid(columns: columns, alignment: .leading, spacing: ZrpSpacing.lg) {
                ForEach(viewModel.items) { album in
                    Button {
                        navigator.push(.musicAlbum(id: album.id))
                    } label: {
                        VStack(alignment: .leading, spacing: ZrpSpacing.xs) {
                            TrackArtworkView(url: album.coverUrl, side: 140)
                            Text(verbatim: album.title)
                                .font(.footnote.weight(.semibold))
                                .foregroundStyle(ZrpColor.onSurface)
                                .lineLimit(1)
                            Text(verbatim: album.artist?.displayName ?? "")
                                .font(.caption2)
                                .foregroundStyle(ZrpColor.onSurfaceMuted)
                                .lineLimit(1)
                        }
                        .contentShape(Rectangle())
                    }
                    .buttonStyle(.plain)
                    .accessibilityElement(children: .combine)
                }
            }
            .padding(ZrpSpacing.lg)
            .frame(maxWidth: ZrpMetrics.contentMaxWidth)
            .frame(maxWidth: .infinity)
        }
    }
}

/// Discover: browse by genre, or search all tracks.
struct MusicDiscoverView: View {

    @EnvironmentObject private var player: MusicPlayer
    @EnvironmentObject private var likes: MusicLikeStore
    @StateObject private var tracks = MusicListViewModel<MusicTrack> { query in
        try await MusicRepository().tracks(query: query, limit: 50)
    }
    @State private var genres: [MusicGenre] = []
    @State private var selectedGenre: String?

    /// Genre filtering reuses the track search rather than a dedicated
    /// endpoint - there is none. `/api/music/genres` returns the genre
    /// names and counts; the track route's `q` is what narrows to one.
    private var visibleTracks: [MusicTrack] {
        guard let selectedGenre else { return tracks.items }
        return tracks.items.filter { $0.genre == selectedGenre }
    }

    var body: some View {
        ScrollView {
            LazyVStack(alignment: .leading, spacing: ZrpSpacing.lg) {
                if !genres.isEmpty {
                    Text(.musicDiscoverBrowseByGenre)
                        .font(.headline)
                        .foregroundStyle(ZrpColor.onSurface)
                        .padding(.horizontal, ZrpSpacing.lg)

                    ScrollView(.horizontal, showsIndicators: false) {
                        HStack(spacing: ZrpSpacing.sm) {
                            genreChip(nil, label: L10n.string(.musicDiscoverAllTracks))
                            ForEach(genres) { genre in
                                genreChip(genre.genre, label: genre.genre)
                            }
                        }
                        .padding(.horizontal, ZrpSpacing.lg)
                    }
                }

                if visibleTracks.isEmpty, tracks.phase == .loaded {
                    TimelineStateView.empty(
                        systemImage: "magnifyingglass",
                        title: .musicDiscoverNoTracksTitle,
                        subtitle: .musicDiscoverNoTracksBody
                    )
                    .frame(minHeight: 240)
                } else {
                    ForEach(Array(visibleTracks.enumerated()), id: \.element.id) { index, track in
                        TrackRowView(
                            track: track,
                            isLiked: likes.isLiked(track),
                            isCurrent: player.current?.id == track.id,
                            isPlaying: player.current?.id == track.id && player.isPlaying,
                            onPlay: { player.play(visibleTracks, startingAt: index) },
                            onToggleLike: { Task { await likes.toggle(track) } }
                        )
                    }
                }
            }
            .padding(.vertical, ZrpSpacing.lg)
            .frame(maxWidth: ZrpMetrics.contentMaxWidth)
            .frame(maxWidth: .infinity)
        }
        .background(ZrpColor.background.ignoresSafeArea())
        .navigationTitle(Text(.musicNavDiscoverTitle))
        .navigationBarTitleDisplayMode(.inline)
        .searchable(
            text: $tracks.query,
            placement: .navigationBarDrawer(displayMode: .always),
            prompt: Text(.musicDiscoverSearchPlaceholder)
        )
        .onChange(of: tracks.query) { _, _ in tracks.search() }
        // `/api/music/tracks` does report `liked`, so each page of
        // results updates the shared store as it arrives.
        .onChange(of: tracks.items) { _, items in likes.seed(items) }
        .task {
            await tracks.loadIfNeeded()
            if genres.isEmpty {
                genres = (try? await MusicRepository().genres()) ?? []
            }
        }
    }

    private func genreChip(_ genre: String?, label: String) -> some View {
        let isSelected = selectedGenre == genre
        return Button {
            selectedGenre = genre
        } label: {
            Text(verbatim: label)
                .font(.footnote.weight(.medium))
                .padding(.horizontal, ZrpSpacing.md)
                .frame(minHeight: 34)
                .background(isSelected ? ZrpColor.red : ZrpColor.surfaceElevated)
                .foregroundStyle(isSelected ? .white : ZrpColor.onSurface)
                .clipShape(Capsule())
        }
        .buttonStyle(.plain)
        .accessibilityAddTraits(isSelected ? [.isSelected, .isButton] : .isButton)
    }
}
