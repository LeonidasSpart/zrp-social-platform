import SwiftUI

/// One artist: header, follow, tracks and albums.
struct MusicArtistDetailView: View {

    let artistId: String

    @EnvironmentObject private var player: MusicPlayer
    @EnvironmentObject private var navigator: Navigator
    @EnvironmentObject private var likes: MusicLikeStore
    @State private var detail: MusicArtistDetail?
    @State private var loadError: ApiError?
    @State private var isTogglingFollow = false

    private let repository = MusicRepository()

    var body: some View {
        Group {
            if let detail {
                body(for: detail)
            } else if let loadError {
                if case .notFound = loadError {
                    TimelineStateView.empty(
                        systemImage: "music.mic",
                        title: .musicArtistDetailNotFound,
                        subtitle: nil
                    )
                } else {
                    TimelineStateView.error(loadError) { Task { await load() } }
                }
            } else {
                TimelineStateView.loading()
            }
        }
        .background(ZrpColor.background.ignoresSafeArea())
        .navigationTitle(Text(verbatim: detail?.displayName ?? ""))
        .navigationBarTitleDisplayMode(.inline)
        .task { await load() }
    }

    private func load() async {
        do {
            let fetched = try await repository.artist(id: artistId)
            detail = fetched
            likes.seed(fetched.tracks)
            loadError = nil
        } catch {
            loadError = error as? ApiError ?? .transport(underlying: "\(error)")
        }
    }

    private func body(for detail: MusicArtistDetail) -> some View {
        ScrollView {
            LazyVStack(alignment: .leading, spacing: ZrpSpacing.lg) {
                header(detail)

                if detail.tracks.isEmpty {
                    TimelineStateView.empty(
                        systemImage: "music.note",
                        title: .musicArtistDetailNoTracks,
                        subtitle: nil
                    )
                    .frame(minHeight: 200)
                } else {
                    Text(.musicArtistDetailTracksHeading)
                        .font(.headline)
                        .foregroundStyle(ZrpColor.onSurface)
                        .padding(.horizontal, ZrpSpacing.lg)

                    ForEach(Array(detail.tracks.enumerated()), id: \.element.id) { index, track in
                        TrackRowView(
                            track: track,
                            isLiked: likes.isLiked(track),
                            isCurrent: player.current?.id == track.id,
                            isPlaying: player.current?.id == track.id && player.isPlaying,
                            onPlay: { player.play(detail.tracks, startingAt: index) },
                            onToggleLike: { Task { await likes.toggle(track) } }
                        )
                    }
                }

                if !detail.albums.isEmpty {
                    Text(.musicArtistDetailAlbumsHeading)
                        .font(.headline)
                        .foregroundStyle(ZrpColor.onSurface)
                        .padding(.horizontal, ZrpSpacing.lg)

                    ScrollView(.horizontal, showsIndicators: false) {
                        HStack(alignment: .top, spacing: ZrpSpacing.md) {
                            ForEach(detail.albums) { album in
                                Button {
                                    navigator.push(.musicAlbum(id: album.id))
                                } label: {
                                    VStack(alignment: .leading, spacing: ZrpSpacing.xs) {
                                        TrackArtworkView(url: album.coverUrl, side: 132)
                                        Text(verbatim: album.title)
                                            .font(.footnote.weight(.semibold))
                                            .foregroundStyle(ZrpColor.onSurface)
                                            .lineLimit(1)
                                    }
                                    .frame(width: 132)
                                }
                                .buttonStyle(.plain)
                            }
                        }
                        .padding(.horizontal, ZrpSpacing.lg)
                    }
                }
            }
            .padding(.vertical, ZrpSpacing.lg)
            .frame(maxWidth: ZrpMetrics.contentMaxWidth)
            .frame(maxWidth: .infinity)
        }
        .refreshable { await load() }
    }

    private func header(_ detail: MusicArtistDetail) -> some View {
        VStack(spacing: ZrpSpacing.md) {
            AvatarView(url: detail.avatarUrl, displayName: detail.displayName, size: 110)

            HStack(spacing: ZrpSpacing.xs) {
                Text(verbatim: detail.displayName)
                    .font(.title3.weight(.bold))
                    .foregroundStyle(ZrpColor.onSurface)
                if detail.verified {
                    Image(systemName: "checkmark.seal.fill")
                        .foregroundStyle(ZrpColor.blue)
                }
            }

            if let bio = detail.bio, !bio.isEmpty {
                Text(verbatim: bio)
                    .font(.footnote)
                    .foregroundStyle(ZrpColor.onSurfaceMuted)
                    .multilineTextAlignment(.center)
                    .padding(.horizontal, ZrpSpacing.lg)
            }

            // The artist's own page shows no follow button - the route
            // reports `isOwner`, and following yourself is not a thing.
            if !detail.isOwner {
                Button {
                    Task { await toggleFollow(detail) }
                } label: {
                    Group {
                        if isTogglingFollow {
                            ProgressView().tint(detail.isFollowing ? ZrpColor.onSurface : .white)
                        } else {
                            Text(detail.isFollowing
                                ? L10nKey.musicArtistDetailFollowing
                                : L10nKey.musicArtistDetailFollow)
                                .font(.subheadline.weight(.semibold))
                        }
                    }
                    .frame(minWidth: 120)
                    .frame(minHeight: ZrpMetrics.minTouchTarget)
                    .padding(.horizontal, ZrpSpacing.lg)
                    .background(detail.isFollowing ? ZrpColor.surfaceHighest : ZrpColor.red)
                    .foregroundStyle(detail.isFollowing ? ZrpColor.onSurface : .white)
                    .clipShape(Capsule())
                }
                .disabled(isTogglingFollow)
            }
        }
        .frame(maxWidth: .infinity)
    }

    private func toggleFollow(_ detail: MusicArtistDetail) async {
        isTogglingFollow = true
        defer { isTogglingFollow = false }
        // Refetched rather than patched locally: the detail response is
        // one immutable object carrying follow state, tracks and albums
        // together, and re-reading it keeps all three consistent.
        _ = try? await repository.toggleArtistFollow(id: detail.id)
        await load()
    }
}

/// One album and its tracks.
struct MusicAlbumDetailView: View {

    let albumId: String

    @EnvironmentObject private var player: MusicPlayer
    @EnvironmentObject private var likes: MusicLikeStore
    @State private var detail: MusicAlbumDetail?
    @State private var loadError: ApiError?

    private let repository = MusicRepository()

    var body: some View {
        Group {
            if let detail {
                body(for: detail)
            } else if let loadError {
                if case .notFound = loadError {
                    TimelineStateView.empty(
                        systemImage: "square.stack",
                        title: .musicAlbumDetailNotFound,
                        subtitle: nil
                    )
                } else {
                    TimelineStateView.error(loadError) { Task { await load() } }
                }
            } else {
                TimelineStateView.loading()
            }
        }
        .background(ZrpColor.background.ignoresSafeArea())
        .navigationTitle(Text(verbatim: detail?.title ?? ""))
        .navigationBarTitleDisplayMode(.inline)
        .task { await load() }
    }

    private func load() async {
        do {
            let fetched = try await repository.album(id: albumId)
            detail = fetched
            likes.seed(fetched.tracks)
            loadError = nil
        } catch {
            loadError = error as? ApiError ?? .transport(underlying: "\(error)")
        }
    }

    private func body(for detail: MusicAlbumDetail) -> some View {
        ScrollView {
            LazyVStack(alignment: .leading, spacing: ZrpSpacing.lg) {
                VStack(spacing: ZrpSpacing.md) {
                    TrackArtworkView(url: detail.coverUrl, side: 200, cornerRadius: ZrpRadius.md)
                    Text(verbatim: detail.title)
                        .font(.title3.weight(.bold))
                        .foregroundStyle(ZrpColor.onSurface)
                        .multilineTextAlignment(.center)
                    Text(verbatim: detail.artist?.displayName ?? "")
                        .font(.subheadline)
                        .foregroundStyle(ZrpColor.onSurfaceMuted)

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
                    }
                }
                .frame(maxWidth: .infinity)

                if detail.tracks.isEmpty {
                    TimelineStateView.empty(
                        systemImage: "music.note",
                        title: .musicAlbumDetailNoTracks,
                        subtitle: nil
                    )
                    .frame(minHeight: 200)
                } else {
                    ForEach(Array(detail.tracks.enumerated()), id: \.element.id) { index, track in
                        TrackRowView(
                            track: track,
                            isLiked: likes.isLiked(track),
                            isCurrent: player.current?.id == track.id,
                            isPlaying: player.current?.id == track.id && player.isPlaying,
                            onPlay: { player.play(detail.tracks, startingAt: index) },
                            onToggleLike: { Task { await likes.toggle(track) } }
                        )
                    }
                }
            }
            .padding(.vertical, ZrpSpacing.lg)
            .frame(maxWidth: ZrpMetrics.contentMaxWidth)
            .frame(maxWidth: .infinity)
        }
        .refreshable { await load() }
    }
}
