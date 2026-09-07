import PhotosUI
import SwiftUI

/// The viewer's own albums.
struct MusicStudioAlbumsView: View {

    @ObservedObject var viewModel: MusicStudioViewModel
    @State private var isCreating = false
    @State private var managing: StudioAlbum?
    @State private var deleting: StudioAlbum?

    var body: some View {
        VStack(spacing: 0) {
            Button {
                isCreating = true
            } label: {
                Label { Text(.musicStudioCreateAlbum) } icon: { Image(systemName: "plus") }
                    .font(.subheadline.weight(.semibold))
                    .frame(maxWidth: .infinity)
                    .frame(minHeight: ZrpMetrics.minTouchTarget)
                    .background(ZrpColor.surfaceElevated)
                    .foregroundStyle(ZrpColor.onSurface)
                    .clipShape(RoundedRectangle(cornerRadius: ZrpRadius.md))
            }
            .buttonStyle(.plain)
            .padding(ZrpSpacing.lg)

            if viewModel.albums.isEmpty {
                TimelineStateView.empty(
                    systemImage: "square.stack",
                    title: .musicStudioMyAlbums,
                    subtitle: .musicStudioNoAlbumsYet
                )
            } else {
                list
            }
        }
        .sheet(isPresented: $isCreating) {
            NavigationStack { MusicAlbumCreateView(viewModel: viewModel) }
        }
        .sheet(item: $managing) { album in
            NavigationStack { MusicAlbumManageView(viewModel: viewModel, album: album) }
        }
        .alert(
            Text(.musicStudioDeleteAlbumTitle),
            isPresented: Binding(
                get: { deleting != nil },
                set: { if !$0 { deleting = nil } }
            ),
            presenting: deleting
        ) { album in
            Button(role: .destructive) {
                Task { await viewModel.deleteAlbum(id: album.id) }
            } label: {
                Text(.musicStudioDeleteConfirm)
            }
            Button(role: .cancel) { } label: { Text(.musicStudioCancel) }
        } message: { album in
            // Says plainly that the tracks survive, because the route
            // genuinely keeps them - it unassigns rather than deletes.
            Text(.musicStudioDeleteAlbumBody, ["title": album.title])
        }
    }

    private var list: some View {
        ScrollView {
            LazyVStack(spacing: 0) {
                ForEach(viewModel.albums) { album in
                    HStack(spacing: ZrpSpacing.md) {
                        TrackArtworkView(url: album.coverUrl, side: 52)
                        VStack(alignment: .leading, spacing: 2) {
                            Text(verbatim: album.title)
                                .font(.subheadline.weight(.semibold))
                                .foregroundStyle(ZrpColor.onSurface)
                                .lineLimit(1)
                            Text(verbatim: MusicCount.tracks(album.trackCount))
                                .font(.caption)
                                .foregroundStyle(ZrpColor.onSurfaceMuted)
                        }
                        Spacer(minLength: 0)
                        Menu {
                            Button { managing = album } label: {
                                Label { Text(.musicStudioManage) } icon: { Image(systemName: "slider.horizontal.3") }
                            }
                            Button(role: .destructive) { deleting = album } label: {
                                Label { Text(.musicStudioDeleteAlbum) } icon: { Image(systemName: "trash") }
                            }
                        } label: {
                            Image(systemName: "ellipsis")
                                .font(.subheadline)
                                .foregroundStyle(ZrpColor.onSurfaceMuted)
                                .frame(width: ZrpMetrics.minTouchTarget, height: ZrpMetrics.minTouchTarget)
                                .contentShape(Rectangle())
                        }
                        .accessibilityLabel(Text(.musicStudioManage))
                    }
                    .padding(.horizontal, ZrpSpacing.lg)
                    .padding(.vertical, ZrpSpacing.md)
                    Divider().overlay(ZrpColor.outlineFaint)
                }
            }
            .frame(maxWidth: ZrpMetrics.contentMaxWidth)
            .frame(maxWidth: .infinity)
        }
        .refreshable { await viewModel.reloadAlbums() }
    }
}

/// Create an album: `POST /api/music/albums`.
struct MusicAlbumCreateView: View {

    @ObservedObject var viewModel: MusicStudioViewModel
    @Environment(\.dismiss) private var dismiss

    @State private var title = ""
    @State private var description = ""
    @State private var releaseDate = Date()
    @State private var hasReleaseDate = false
    @State private var cover = MusicCoverUpload()
    @State private var isSaving = false
    @State private var error: String?

    var body: some View {
        ScrollView {
            VStack(alignment: .leading, spacing: ZrpSpacing.lg) {
                MusicCoverPickerRow(upload: $cover, addLabel: .musicStudioAddCover)

                MusicStudioTextField(key: .musicStudioAlbumTitlePlaceholder, text: $title)
                MusicStudioTextField(key: .musicStudioDescriptionPlaceholder, text: $description)

                Toggle(isOn: $hasReleaseDate) {
                    Text(.musicStudioReleaseDate)
                        .font(.subheadline)
                        .foregroundStyle(ZrpColor.onSurface)
                }
                .tint(ZrpColor.red)

                if hasReleaseDate {
                    DatePicker(
                        selection: $releaseDate,
                        displayedComponents: .date
                    ) {
                        Text(.musicStudioReleaseDate)
                    }
                    .datePickerStyle(.compact)
                }

                if let error {
                    Text(verbatim: error)
                        .font(.footnote)
                        .foregroundStyle(ZrpColor.red)
                }
            }
            .padding(ZrpSpacing.lg)
            .frame(maxWidth: ZrpMetrics.contentMaxWidth, alignment: .leading)
            .frame(maxWidth: .infinity)
        }
        .background(ZrpColor.background.ignoresSafeArea())
        .navigationTitle(Text(.musicStudioCreateAlbum))
        .navigationBarTitleDisplayMode(.inline)
        .toolbar {
            ToolbarItem(placement: .cancellationAction) {
                Button { dismiss() } label: { Text(.musicStudioCancel) }
            }
            ToolbarItem(placement: .confirmationAction) {
                Button { create() } label: {
                    Text(isSaving ? L10nKey.musicStudioSaving : L10nKey.musicStudioCreateAlbum)
                }
                .disabled(isSaving || cover.isUploading)
            }
        }
    }

    private func create() {
        let trimmed = title.trimmingCharacters(in: .whitespacesAndNewlines)
        guard !trimmed.isEmpty else {
            error = L10n.string(.musicStudioTitleRequired)
            return
        }
        Task {
            isSaving = true
            let created = await viewModel.createAlbum(
                title: trimmed,
                description: description.trimmingCharacters(in: .whitespacesAndNewlines).nilIfEmpty,
                coverUrl: cover.url.nilIfEmpty,
                coverKey: cover.key.nilIfEmpty,
                releaseDate: hasReleaseDate ? MusicDateFormat.isoDay(releaseDate) : nil,
                artistName: viewModel.artist?.displayName ?? ""
            )
            isSaving = false
            if created { dismiss() }
        }
    }
}

/// Edit an album, and add, remove and reorder its tracks.
struct MusicAlbumManageView: View {

    @ObservedObject var viewModel: MusicStudioViewModel
    let album: StudioAlbum

    @Environment(\.dismiss) private var dismiss

    @State private var title: String
    @State private var description: String
    @State private var releaseDate: Date
    @State private var hasReleaseDate: Bool
    @State private var cover: MusicCoverUpload
    @State private var isSaving = false
    @State private var error: String?

    init(viewModel: MusicStudioViewModel, album: StudioAlbum) {
        self.viewModel = viewModel
        self.album = album
        _title = State(initialValue: album.title)
        _description = State(initialValue: album.description ?? "")
        _releaseDate = State(initialValue: album.releaseDate ?? Date())
        _hasReleaseDate = State(initialValue: album.releaseDate != nil)
        _cover = State(
            initialValue: MusicCoverUpload(
                url: album.coverUrl ?? "",
                key: album.coverKey ?? ""
            )
        )
    }

    /// Ordered by the album's own track numbers, which is what the
    /// reorder route writes and what the album detail screen reads back.
    private var albumTracks: [StudioTrack] {
        viewModel.tracks
            .filter { $0.albumId == album.id }
            .sorted { ($0.trackNumber ?? Int.max) < ($1.trackNumber ?? Int.max) }
    }

    private var availableTracks: [StudioTrack] {
        viewModel.tracks.filter { $0.albumId != album.id }
    }

    var body: some View {
        ScrollView {
            VStack(alignment: .leading, spacing: ZrpSpacing.lg) {
                MusicCoverPickerRow(upload: $cover, addLabel: .musicStudioChangeCover)

                MusicStudioTextField(key: .musicStudioAlbumTitlePlaceholder, text: $title)
                MusicStudioTextField(key: .musicStudioDescriptionPlaceholder, text: $description)

                Toggle(isOn: $hasReleaseDate) {
                    Text(.musicStudioReleaseDate)
                        .font(.subheadline)
                        .foregroundStyle(ZrpColor.onSurface)
                }
                .tint(ZrpColor.red)

                if hasReleaseDate {
                    DatePicker(selection: $releaseDate, displayedComponents: .date) {
                        Text(.musicStudioReleaseDate)
                    }
                    .datePickerStyle(.compact)
                }

                if let error {
                    Text(verbatim: error)
                        .font(.footnote)
                        .foregroundStyle(ZrpColor.red)
                }

                Divider().overlay(ZrpColor.outline)

                inAlbumSection
                availableSection
            }
            .padding(ZrpSpacing.lg)
            .frame(maxWidth: ZrpMetrics.contentMaxWidth, alignment: .leading)
            .frame(maxWidth: .infinity)
        }
        .background(ZrpColor.background.ignoresSafeArea())
        .navigationTitle(Text(.musicStudioManageAlbum))
        .navigationBarTitleDisplayMode(.inline)
        .toolbar {
            ToolbarItem(placement: .cancellationAction) {
                Button { dismiss() } label: { Text(.musicStudioCancel) }
            }
            ToolbarItem(placement: .confirmationAction) {
                Button { save() } label: {
                    Text(isSaving ? L10nKey.musicStudioSaving : L10nKey.musicStudioSave)
                }
                .disabled(isSaving || cover.isUploading)
            }
        }
    }

    private var inAlbumSection: some View {
        VStack(alignment: .leading, spacing: ZrpSpacing.sm) {
            Text(.musicStudioTracksInAlbum)
                .font(.headline)
                .foregroundStyle(ZrpColor.onSurface)

            if albumTracks.isEmpty {
                Text(.musicStudioNoTracksInAlbum)
                    .font(.footnote)
                    .foregroundStyle(ZrpColor.onSurfaceMuted)
            } else {
                ForEach(Array(albumTracks.enumerated()), id: \.element.id) { index, track in
                    HStack(spacing: ZrpSpacing.sm) {
                        Text(verbatim: "\(index + 1)")
                            .font(.caption.monospacedDigit())
                            .foregroundStyle(ZrpColor.onSurfaceMuted)
                            .frame(width: 20)
                        Text(verbatim: track.title)
                            .font(.subheadline)
                            .foregroundStyle(ZrpColor.onSurface)
                            .lineLimit(1)
                        Spacer(minLength: 0)
                        iconButton("arrow.up", label: .musicStudioMoveUp) {
                            move(from: index, by: -1)
                        }
                        .disabled(index == 0)
                        iconButton("arrow.down", label: .musicStudioMoveDown) {
                            move(from: index, by: 1)
                        }
                        .disabled(index == albumTracks.count - 1)
                        iconButton("minus.circle", label: .musicStudioRemoveFromAlbum) {
                            Task { await viewModel.removeTrackFromAlbum(track) }
                        }
                    }
                }
            }
        }
    }

    private var availableSection: some View {
        VStack(alignment: .leading, spacing: ZrpSpacing.sm) {
            Text(.musicStudioAddExistingTracks)
                .font(.headline)
                .foregroundStyle(ZrpColor.onSurface)

            if availableTracks.isEmpty {
                Text(.musicStudioNoTracksYet)
                    .font(.footnote)
                    .foregroundStyle(ZrpColor.onSurfaceMuted)
            } else {
                ForEach(availableTracks) { track in
                    HStack(spacing: ZrpSpacing.sm) {
                        Text(verbatim: track.title)
                            .font(.subheadline)
                            .foregroundStyle(ZrpColor.onSurface)
                            .lineLimit(1)
                        Spacer(minLength: 0)
                        Button {
                            Task {
                                await viewModel.addTrack(
                                    track,
                                    toAlbum: album.id,
                                    position: albumTracks.count + 1
                                )
                            }
                        } label: {
                            Text(.musicStudioAdd)
                                .font(.footnote.weight(.semibold))
                                .padding(.horizontal, ZrpSpacing.md)
                                .frame(minHeight: ZrpMetrics.minTouchTarget)
                                .foregroundStyle(ZrpColor.red)
                        }
                        .buttonStyle(.plain)
                    }
                }
            }
        }
    }

    private func iconButton(_ systemImage: String, label: L10nKey, action: @escaping () -> Void) -> some View {
        Button(action: action) {
            Image(systemName: systemImage)
                .font(.subheadline)
                .foregroundStyle(ZrpColor.onSurfaceMuted)
                .frame(width: ZrpMetrics.minTouchTarget, height: ZrpMetrics.minTouchTarget)
                .contentShape(Rectangle())
        }
        .buttonStyle(.plain)
        .accessibilityLabel(Text(label))
    }

    private func move(from index: Int, by offset: Int) {
        var ordered = albumTracks
        let target = index + offset
        guard ordered.indices.contains(target) else { return }
        ordered.swapAt(index, target)
        Task {
            await viewModel.reorderAlbum(id: album.id, orderedTrackIds: ordered.map(\.id))
        }
    }

    private func save() {
        let trimmed = title.trimmingCharacters(in: .whitespacesAndNewlines)
        guard !trimmed.isEmpty else {
            error = L10n.string(.musicStudioTitleRequired)
            return
        }
        Task {
            isSaving = true
            let saved = await viewModel.updateAlbum(
                id: album.id,
                AlbumEditRequest(
                    title: trimmed,
                    description: description.trimmingCharacters(in: .whitespacesAndNewlines).nilIfEmpty,
                    coverUrl: cover.url.nilIfEmpty,
                    coverKey: cover.key.nilIfEmpty,
                    releaseDate: hasReleaseDate ? MusicDateFormat.isoDay(releaseDate) : nil
                )
            )
            isSaving = false
            if saved { dismiss() }
        }
    }
}

/// The artist profile tab: `GET /api/music/artists?mine=true` to load,
/// `POST /api/music/artists` to save.
///
/// Every field is loaded before any of them can be edited. That is not a
/// nicety - the route's update branch writes `bio`, `avatarUrl` and
/// `bannerUrl` from the body unconditionally, so saving a form that
/// never loaded them would erase them.
struct MusicStudioArtistView: View {

    @ObservedObject var viewModel: MusicStudioViewModel

    @State private var displayName = ""
    @State private var bio = ""
    @State private var avatar = MusicCoverUpload()
    @State private var banner = MusicCoverUpload()
    @State private var isSaving = false
    @State private var hasLoaded = false

    var body: some View {
        ScrollView {
            VStack(alignment: .leading, spacing: ZrpSpacing.lg) {
                MusicCoverPickerRow(upload: $banner, addLabel: .musicStudioChangeBanner, slug: .banner)
                MusicCoverPickerRow(upload: $avatar, addLabel: .musicStudioChangeCover, slug: .avatar)

                MusicStudioTextField(key: .musicShellArtistNamePlaceholder, text: $displayName)
                MusicStudioTextField(key: .musicStudioBioPlaceholder, text: $bio)

                Button {
                    save()
                } label: {
                    Text(isSaving ? L10nKey.musicStudioSaving : L10nKey.musicStudioSave)
                        .font(.subheadline.weight(.bold))
                        .frame(maxWidth: .infinity)
                        .frame(minHeight: ZrpMetrics.minTouchTarget)
                        .background(ZrpColor.red)
                        .foregroundStyle(.white)
                        .clipShape(RoundedRectangle(cornerRadius: ZrpRadius.md))
                }
                .buttonStyle(.plain)
                .disabled(isSaving || !hasLoaded || avatar.isUploading || banner.isUploading)
            }
            .padding(ZrpSpacing.lg)
            .frame(maxWidth: ZrpMetrics.contentMaxWidth, alignment: .leading)
            .frame(maxWidth: .infinity)
        }
        .task {
            guard !hasLoaded else { return }
            if let artist = viewModel.artist {
                displayName = artist.displayName
                bio = artist.bio ?? ""
                avatar = MusicCoverUpload(url: artist.avatarUrl ?? "", key: "")
                banner = MusicCoverUpload(url: artist.bannerUrl ?? "", key: "")
            }
            hasLoaded = true
        }
    }

    private func save() {
        Task {
            isSaving = true
            _ = await viewModel.saveArtistProfile(
                ArtistProfileRequest(
                    displayName: displayName.trimmingCharacters(in: .whitespacesAndNewlines).nilIfEmpty,
                    bio: bio.trimmingCharacters(in: .whitespacesAndNewlines).nilIfEmpty,
                    avatarUrl: avatar.url.nilIfEmpty,
                    bannerUrl: banner.url.nilIfEmpty
                )
            )
            isSaving = false
        }
    }
}

// MARK: - Shared studio pieces

struct MusicStudioTextField: View {
    let key: L10nKey
    @Binding var text: String

    var body: some View {
        TextField(text: $text, prompt: Text(key), label: { Text(key) })
            .labelsHidden()
            .textFieldStyle(.plain)
            .padding(ZrpSpacing.md)
            .background(ZrpColor.surfaceElevated)
            .clipShape(RoundedRectangle(cornerRadius: ZrpRadius.md))
    }
}

/// An image that has been uploaded, or is being uploaded.
struct MusicCoverUpload: Equatable {
    var url: String = ""
    var key: String = ""
    var isUploading: Bool = false
}

/// Picks an image and uploads it, exposing the resulting URL and storage
/// key. The key matters: the music routes persist it so the file can
/// actually be deleted from storage later.
struct MusicCoverPickerRow: View {

    @Binding var upload: MusicCoverUpload
    let addLabel: L10nKey
    var slug: UploadThingClient.Slug = .musicTrack

    @State private var selection: PhotosPickerItem?
    private let uploader = UploadThingClient()

    var body: some View {
        HStack(spacing: ZrpSpacing.md) {
            TrackArtworkView(url: upload.url.nilIfEmpty, side: 64)
            PhotosPicker(selection: $selection, matching: .images) {
                Text(upload.isUploading ? L10nKey.musicStudioUploading : addLabel)
                    .font(.subheadline.weight(.medium))
                    .frame(maxWidth: .infinity)
                    .frame(minHeight: ZrpMetrics.minTouchTarget)
                    .background(ZrpColor.surfaceElevated)
                    .foregroundStyle(ZrpColor.onSurface)
                    .clipShape(RoundedRectangle(cornerRadius: ZrpRadius.md))
            }
            .disabled(upload.isUploading)
        }
        .onChange(of: selection) { _, item in
            guard let item else { return }
            Task {
                upload.isUploading = true
                defer { upload.isUploading = false }
                guard let picked = try? await item.loadTransferable(type: PickedMedia.self) else { return }
                defer { picked.discard() }
                guard let result = try? await uploader.upload(
                    picked.asUploadCandidate(),
                    to: slug,
                    onProgress: { _ in }
                ) else { return }
                upload.url = result.url
                upload.key = result.key
            }
        }
    }
}

/// Track counts, in the right plural form.
///
/// The web dictionary ships `music.count.tracksOne` and
/// `music.count.tracksOther` for all 11 languages, so the singular is
/// used where it belongs rather than rendering "1 tracks".
enum MusicCount {
    static func tracks(_ count: Int) -> String {
        L10n.string(
            count == 1 ? .musicCountTracksOne : .musicCountTracksOther,
            ["count": CountFormatting.exact(count)]
        )
    }
}

enum MusicDateFormat {
    /// `yyyy-MM-dd`, which is what the website's date input sends and
    /// what the album routes hand to `new Date(...)`. Fixed locale and a
    /// UTC calendar, so the day does not shift for a listener east of
    /// Greenwich.
    static func isoDay(_ date: Date) -> String {
        var formatter = Date.ISO8601FormatStyle(timeZone: TimeZone(identifier: "UTC") ?? .gmt)
        formatter = formatter.year().month().day().dateSeparator(.dash)
        return date.formatted(formatter)
    }
}
