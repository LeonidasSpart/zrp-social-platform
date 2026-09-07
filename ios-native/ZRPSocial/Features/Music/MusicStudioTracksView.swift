import PhotosUI
import SwiftUI

/// The viewer's own tracks, editable.
///
/// `GET /api/music/tracks?mine=true` is the only music route that
/// returns tracks in **any** status, which is what makes this the
/// studio's list rather than a listening one - an unpublished track has
/// to be manageable, and no browsing surface will ever show it.
struct MusicStudioTracksView: View {

    @ObservedObject var viewModel: MusicStudioViewModel
    @State private var editing: StudioTrack?
    @State private var deleting: StudioTrack?

    var body: some View {
        Group {
            if viewModel.tracks.isEmpty {
                TimelineStateView.empty(
                    systemImage: "waveform",
                    title: .musicStudioMyTracks,
                    subtitle: .musicStudioNoTracksYet
                )
            } else {
                list
            }
        }
        .sheet(item: $editing) { track in
            NavigationStack {
                MusicTrackEditView(viewModel: viewModel, track: track)
            }
        }
        .alert(
            Text(.musicStudioDeleteTrackTitle),
            isPresented: Binding(
                get: { deleting != nil },
                set: { if !$0 { deleting = nil } }
            ),
            presenting: deleting
        ) { track in
            Button(role: .destructive) {
                Task { await viewModel.deleteTrack(id: track.id) }
            } label: {
                Text(.musicStudioDeleteConfirm)
            }
            Button(role: .cancel) { } label: { Text(.musicStudioCancel) }
        } message: { track in
            Text(.musicStudioDeleteTrackBody, ["title": track.title])
        }
    }

    private var list: some View {
        ScrollView {
            LazyVStack(spacing: 0) {
                ForEach(viewModel.tracks) { track in
                    row(track)
                    Divider().overlay(ZrpColor.outlineFaint)
                }
            }
            .frame(maxWidth: ZrpMetrics.contentMaxWidth)
            .frame(maxWidth: .infinity)
        }
        .refreshable { await viewModel.reloadTracks() }
    }

    private func row(_ track: StudioTrack) -> some View {
        HStack(spacing: ZrpSpacing.md) {
            TrackArtworkView(url: track.coverUrl, side: 48)

            VStack(alignment: .leading, spacing: 2) {
                HStack(spacing: ZrpSpacing.xs) {
                    Text(verbatim: track.title)
                        .font(.subheadline.weight(.semibold))
                        .foregroundStyle(ZrpColor.onSurface)
                        .lineLimit(1)
                    // A track that is not published is shown as such
                    // rather than looking identical to a live one.
                    if !track.isPublished {
                        Text(verbatim: track.status)
                            .font(.system(size: 9, weight: .bold))
                            .padding(.horizontal, 4)
                            .padding(.vertical, 1)
                            .background(ZrpColor.surfaceHighest)
                            .foregroundStyle(ZrpColor.onSurfaceMuted)
                            .clipShape(RoundedRectangle(cornerRadius: 3))
                    }
                }
                Text(verbatim: track.album?.title ?? L10n.string(.musicStudioNoAlbum))
                    .font(.caption)
                    .foregroundStyle(ZrpColor.onSurfaceMuted)
                    .lineLimit(1)
            }

            Spacer(minLength: 0)

            Menu {
                Button { editing = track } label: {
                    Label { Text(.musicStudioEditTrack) } icon: { Image(systemName: "pencil") }
                }
                Button(role: .destructive) { deleting = track } label: {
                    Label { Text(.musicStudioDeleteTrack) } icon: { Image(systemName: "trash") }
                }
            } label: {
                Image(systemName: "ellipsis")
                    .font(.subheadline)
                    .foregroundStyle(ZrpColor.onSurfaceMuted)
                    .frame(width: ZrpMetrics.minTouchTarget, height: ZrpMetrics.minTouchTarget)
                    .contentShape(Rectangle())
            }
            .accessibilityLabel(Text(.musicStudioEditTrack))
        }
        .padding(.horizontal, ZrpSpacing.lg)
        .padding(.vertical, ZrpSpacing.md)
    }
}

/// Edit one track's metadata: `PATCH /api/music/tracks/{id}`.
///
/// Every field the route accepts from an owner is here, and the whole set
/// is sent on save with explicit nulls - the same payload the website
/// sends - so clearing a genre really clears it instead of being dropped
/// as an absent key.
struct MusicTrackEditView: View {

    @ObservedObject var viewModel: MusicStudioViewModel
    let track: StudioTrack

    @Environment(\.dismiss) private var dismiss

    @State private var title: String
    @State private var description: String
    @State private var genre: String
    @State private var explicit: Bool
    @State private var albumId: String
    @State private var coverUrl: String
    @State private var coverKey: String
    @State private var coverSelection: PhotosPickerItem?
    @State private var isUploadingCover = false
    @State private var isSaving = false
    @State private var error: String?

    private let uploader = UploadThingClient()

    init(viewModel: MusicStudioViewModel, track: StudioTrack) {
        self.viewModel = viewModel
        self.track = track
        _title = State(initialValue: track.title)
        _description = State(initialValue: track.description ?? "")
        _genre = State(initialValue: track.genre ?? "")
        _explicit = State(initialValue: track.explicit)
        _albumId = State(initialValue: track.albumId ?? "")
        _coverUrl = State(initialValue: track.coverUrl ?? "")
        _coverKey = State(initialValue: track.coverKey ?? "")
    }

    var body: some View {
        ScrollView {
            VStack(alignment: .leading, spacing: ZrpSpacing.lg) {
                coverRow

                field(.musicShellSongTitlePlaceholder, text: $title)
                field(.musicStudioDescriptionPlaceholder, text: $description)
                field(.musicShellGenrePlaceholder, text: $genre)

                Toggle(isOn: $explicit) {
                    Text(.musicStudioExplicitLabel)
                        .font(.subheadline)
                        .foregroundStyle(ZrpColor.onSurface)
                }
                .tint(ZrpColor.red)

                albumPicker

                if let error {
                    Text(verbatim: error)
                        .font(.footnote)
                        .foregroundStyle(ZrpColor.red)
                        .fixedSize(horizontal: false, vertical: true)
                }
            }
            .padding(ZrpSpacing.lg)
            .frame(maxWidth: ZrpMetrics.contentMaxWidth, alignment: .leading)
            .frame(maxWidth: .infinity)
        }
        .background(ZrpColor.background.ignoresSafeArea())
        .navigationTitle(Text(.musicStudioEditTrack))
        .navigationBarTitleDisplayMode(.inline)
        .toolbar {
            ToolbarItem(placement: .cancellationAction) {
                Button { dismiss() } label: { Text(.musicStudioCancel) }
            }
            ToolbarItem(placement: .confirmationAction) {
                Button { save() } label: {
                    Text(isSaving ? L10nKey.musicStudioSaving : L10nKey.musicStudioSave)
                }
                .disabled(isSaving || isUploadingCover)
            }
        }
        .onChange(of: coverSelection) { _, item in
            guard let item else { return }
            uploadCover(item)
        }
    }

    private func field(_ key: L10nKey, text: Binding<String>) -> some View {
        TextField(text: text, prompt: Text(key), label: { Text(key) })
            .labelsHidden()
            .textFieldStyle(.plain)
            .padding(ZrpSpacing.md)
            .background(ZrpColor.surfaceElevated)
            .clipShape(RoundedRectangle(cornerRadius: ZrpRadius.md))
    }

    private var coverRow: some View {
        HStack(spacing: ZrpSpacing.md) {
            TrackArtworkView(url: coverUrl.isEmpty ? nil : coverUrl, side: 64)
            PhotosPicker(selection: $coverSelection, matching: .images) {
                Text(isUploadingCover ? L10nKey.musicStudioUploading : L10nKey.musicStudioChangeCover)
                    .font(.subheadline.weight(.medium))
                    .frame(maxWidth: .infinity)
                    .frame(minHeight: ZrpMetrics.minTouchTarget)
                    .background(ZrpColor.surfaceElevated)
                    .foregroundStyle(ZrpColor.onSurface)
                    .clipShape(RoundedRectangle(cornerRadius: ZrpRadius.md))
            }
            .disabled(isUploadingCover)
        }
    }

    private var albumPicker: some View {
        Picker(selection: $albumId) {
            Text(.musicStudioNoAlbum).tag("")
            ForEach(viewModel.albums) { album in
                Text(verbatim: album.title).tag(album.id)
            }
        } label: {
            Text(.musicStudioTabAlbums)
        }
        .pickerStyle(.menu)
        .tint(ZrpColor.onSurface)
    }

    private func uploadCover(_ item: PhotosPickerItem) {
        Task {
            isUploadingCover = true
            defer { isUploadingCover = false }
            guard let picked = try? await item.loadTransferable(type: PickedMedia.self) else {
                error = L10n.string(.musicShellUploadFailedDefault)
                return
            }
            defer { picked.discard() }
            do {
                // The same `musicTrack` uploader the website uses for
                // artwork, not the avatar route - its completion handler
                // is what returns the storage key the track row needs.
                let uploaded = try await uploader.upload(picked.asUploadCandidate(), to: .musicTrack) { _ in }
                coverUrl = uploaded.url
                coverKey = uploaded.key
                error = nil
            } catch {
                self.error = L10n.string(.musicShellUploadFailedDefault)
            }
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
            let saved = await viewModel.updateTrack(
                id: track.id,
                TrackEditRequest(
                    title: trimmed,
                    description: description.trimmingCharacters(in: .whitespacesAndNewlines).nilIfEmpty,
                    genre: genre.trimmingCharacters(in: .whitespacesAndNewlines).nilIfEmpty,
                    explicit: explicit,
                    coverUrl: coverUrl.nilIfEmpty,
                    coverKey: coverKey.nilIfEmpty,
                    albumId: albumId.nilIfEmpty
                )
            )
            isSaving = false
            if saved { dismiss() }
        }
    }
}

extension String {
    /// `nil` for an empty string, so an emptied field sends `null` - the
    /// value that clears a column - rather than `""`.
    var nilIfEmpty: String? { isEmpty ? nil : self }
}
