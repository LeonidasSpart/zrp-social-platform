import SwiftUI

/// Creating a playlist, or editing one's details.
///
/// `POST /api/music/playlists` needs a name (400 without one) and
/// truncates it to 100 characters server-side. `PATCH` on an existing
/// one reads by KEY PRESENCE: a field the body omits is left alone, an
/// explicit null clears it. So an emptied description is sent as a real
/// null - a deliberate clear - rather than being dropped and silently
/// left as it was.
struct MusicPlaylistEditView: View {

    /// The playlist being edited, or `nil` to create a new one.
    let existing: MusicPlaylist?

    /// Called with the saved playlist so the caller can refresh without
    /// a second round trip.
    let onSaved: (MusicPlaylist) -> Void

    @Environment(\.dismiss) private var dismiss

    @State private var name: String
    @State private var description: String
    @State private var isPublic: Bool
    @State private var isSaving = false
    @State private var errorMessage: String?

    private let repository = MusicRepository()

    init(existing: MusicPlaylist?, onSaved: @escaping (MusicPlaylist) -> Void) {
        self.existing = existing
        self.onSaved = onSaved
        _name = State(initialValue: existing?.name ?? "")
        _description = State(initialValue: existing?.description ?? "")
        // The create route defaults `isPublic` to true when the key is
        // absent; a new playlist starts the same way here so the two
        // agree.
        _isPublic = State(initialValue: existing?.isPublic ?? true)
    }

    private var trimmedName: String {
        name.trimmingCharacters(in: .whitespacesAndNewlines)
    }

    var body: some View {
        NavigationStack {
            Form {
                Section {
                    TextField(L10n.string(.iosPlaylistName), text: $name)
                    TextField(L10n.string(.iosPlaylistDescription), text: $description, axis: .vertical)
                        .lineLimit(1...4)
                    Toggle(isOn: $isPublic) { Text(.iosPlaylistPublic) }
                        .tint(ZrpColor.red)
                }

                if let errorMessage {
                    Section {
                        Text(verbatim: errorMessage)
                            .font(.footnote)
                            .foregroundStyle(ZrpColor.red)
                    }
                }
            }
            .navigationTitle(Text(existing == nil ? L10nKey.iosPlaylistNew : L10nKey.iosPlaylistEdit))
            .navigationBarTitleDisplayMode(.inline)
            .toolbar {
                ToolbarItem(placement: .cancellationAction) {
                    Button { dismiss() } label: { Text(.actionCancel) }
                        .disabled(isSaving)
                }
                ToolbarItem(placement: .confirmationAction) {
                    if isSaving {
                        ProgressView().tint(ZrpColor.red)
                    } else {
                        Button { Task { await save() } } label: { Text(.actionSave) }
                            .disabled(trimmedName.isEmpty)
                    }
                }
            }
        }
    }

    private func save() async {
        guard !trimmedName.isEmpty, !isSaving else { return }
        isSaving = true
        errorMessage = nil
        defer { isSaving = false }

        do {
            let saved: MusicPlaylist
            if let existing {
                saved = try await repository.updatePlaylist(
                    id: existing.id,
                    name: trimmedName,
                    // An emptied box is a real clear, not an omission.
                    description: ArtistProfileField(text: description),
                    isPublic: isPublic
                )
            } else {
                let trimmedDescription = description
                    .trimmingCharacters(in: .whitespacesAndNewlines)
                saved = try await repository.createPlaylist(
                    name: trimmedName,
                    description: trimmedDescription.isEmpty ? nil : trimmedDescription,
                    isPublic: isPublic
                )
            }
            onSaved(saved)
            dismiss()
        } catch let error as ApiError {
            errorMessage = error.userFacingMessage
        } catch {
            errorMessage = L10n.string(.authErrTryAgain)
        }
    }
}

/// Curating a playlist: reordering its tracks and removing them.
///
/// A modal rather than an inline edit mode, for a reason that matters
/// here: the detail screen renders its tracks in a `LazyVStack`, which
/// has no move gesture, and rows there are recycled. A `List` in a sheet
/// gets both `onMove` and `onDelete` for free and is never recycled
/// underneath a gesture.
struct MusicPlaylistCurateView: View {

    let playlistId: String

    /// The playlist's join rows, in their current order.
    @State private var entries: [MusicPlaylistEntry]

    /// Called once the changes have been accepted server-side, so the
    /// detail screen can re-read rather than guess.
    let onChanged: () -> Void

    @Environment(\.dismiss) private var dismiss
    @State private var isSaving = false
    @State private var errorMessage: String?

    private let repository = MusicRepository()

    init(playlistId: String, entries: [MusicPlaylistEntry], onChanged: @escaping () -> Void) {
        self.playlistId = playlistId
        self.onChanged = onChanged
        _entries = State(initialValue: entries)
    }

    var body: some View {
        NavigationStack {
            List {
                ForEach(entries) { entry in
                    VStack(alignment: .leading, spacing: 2) {
                        Text(verbatim: entry.track.title)
                            .font(.subheadline)
                            .lineLimit(1)
                        Text(verbatim: entry.track.artistName)
                            .font(.caption)
                            .foregroundStyle(ZrpColor.onSurfaceMuted)
                            .lineLimit(1)
                    }
                }
                .onMove { indices, destination in
                    entries.move(fromOffsets: indices, toOffset: destination)
                }
                .onDelete { offsets in
                    Task { await remove(at: offsets) }
                }
            }
            .environment(\.editMode, .constant(.active))
            .navigationTitle(Text(.iosPlaylistCurate))
            .navigationBarTitleDisplayMode(.inline)
            .toolbar {
                ToolbarItem(placement: .cancellationAction) {
                    Button { dismiss() } label: { Text(.actionCancel) }
                        .disabled(isSaving)
                }
                ToolbarItem(placement: .confirmationAction) {
                    if isSaving {
                        ProgressView().tint(ZrpColor.red)
                    } else {
                        Button { Task { await saveOrder() } } label: { Text(.actionSave) }
                            .disabled(entries.isEmpty)
                    }
                }
            }
            .alert(
                Text(.iosErrorGenericTitle),
                isPresented: Binding(
                    get: { errorMessage != nil },
                    set: { if !$0 { errorMessage = nil } }
                )
            ) {
                Button { errorMessage = nil } label: { Text(.actionCancel) }
            } message: {
                Text(verbatim: errorMessage ?? "")
            }
        }
    }

    /// Removal goes through the same toggle that adds a track: the route
    /// removes a track already in the playlist. It is applied
    /// immediately rather than batched with the reorder, because the two
    /// are different requests and a reorder listing a row that has just
    /// been deleted would be filtered out server-side.
    private func remove(at offsets: IndexSet) async {
        let removed = offsets.map { entries[$0] }
        entries.remove(atOffsets: offsets)
        for entry in removed {
            do {
                _ = try await repository.togglePlaylistTrack(
                    playlistId: playlistId,
                    trackId: entry.track.id
                )
            } catch {
                // Put it back where it was rather than showing a list
                // that disagrees with the server.
                errorMessage = (error as? ApiError)?.userFacingMessage
                    ?? L10n.string(.authErrTryAgain)
                onChanged()
                dismiss()
                return
            }
        }
        onChanged()
    }

    private func saveOrder() async {
        guard !isSaving else { return }
        isSaving = true
        defer { isSaving = false }
        do {
            // Join-row ids, not track ids: the route matches them against
            // the rows that belong to this playlist and refuses an empty
            // result with a 400.
            try await repository.reorderPlaylist(
                id: playlistId,
                orderedEntryIds: entries.map(\.id)
            )
            onChanged()
            dismiss()
        } catch let error as ApiError {
            errorMessage = error.userFacingMessage
        } catch {
            errorMessage = L10n.string(.authErrTryAgain)
        }
    }
}

/// Adding the playing track to one of the viewer's playlists.
///
/// The route is a TOGGLE, so a playlist that already holds the track
/// removes it - which is why each row reports the state the server
/// settled on rather than claiming "Added".
struct MusicAddToPlaylistView: View {

    let track: MusicTrack

    @Environment(\.dismiss) private var dismiss

    @State private var playlists: [MusicPlaylist] = []
    @State private var phase: FeedState.Phase = .idle
    @State private var busyPlaylistId: String?

    /// Playlists this sheet has just added the track to, or removed it
    /// from. The list route does not report whether a playlist contains
    /// a given track, so nothing is claimed until the toggle answers.
    @State private var added: [String: Bool] = [:]
    @State private var errorMessage: String?

    private let repository = MusicRepository()

    var body: some View {
        NavigationStack {
            Group {
                switch phase {
                case .idle, .loading:
                    TimelineStateView.loading()
                case .failed(let error):
                    TimelineStateView.error(error) { Task { await load() } }
                case .loaded:
                    if playlists.isEmpty {
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
            .navigationTitle(Text(.iosPlaylistAddTo))
            .navigationBarTitleDisplayMode(.inline)
            .toolbar {
                ToolbarItem(placement: .cancellationAction) {
                    Button { dismiss() } label: { Text(.actionCancel) }
                }
            }
            .task { await load() }
            .alert(
                Text(.iosErrorGenericTitle),
                isPresented: Binding(
                    get: { errorMessage != nil },
                    set: { if !$0 { errorMessage = nil } }
                )
            ) {
                Button { errorMessage = nil } label: { Text(.actionCancel) }
            } message: {
                Text(verbatim: errorMessage ?? "")
            }
        }
    }

    private var list: some View {
        List(playlists) { playlist in
            Button {
                Task { await toggle(playlist) }
            } label: {
                HStack(spacing: ZrpSpacing.md) {
                    Text(verbatim: playlist.name)
                        .foregroundStyle(ZrpColor.onSurface)
                    Spacer(minLength: 0)
                    if busyPlaylistId == playlist.id {
                        ProgressView().tint(ZrpColor.onSurfaceMuted)
                    } else if let state = added[playlist.id] {
                        Image(systemName: state ? "checkmark.circle.fill" : "minus.circle")
                            .foregroundStyle(state ? ZrpColor.green : ZrpColor.onSurfaceMuted)
                    }
                }
                .contentShape(Rectangle())
            }
            .buttonStyle(.plain)
            .disabled(busyPlaylistId != nil)
        }
    }

    private func load() async {
        guard phase == .idle else { return }
        phase = .loading
        do {
            playlists = try await repository.playlists()
            phase = .loaded
        } catch {
            phase = .failed(error as? ApiError ?? .transport(underlying: "\(error)"))
        }
    }

    private func toggle(_ playlist: MusicPlaylist) async {
        guard busyPlaylistId == nil else { return }
        busyPlaylistId = playlist.id
        defer { busyPlaylistId = nil }
        do {
            added[playlist.id] = try await repository.togglePlaylistTrack(
                playlistId: playlist.id,
                trackId: track.id
            )
        } catch let error as ApiError {
            errorMessage = error.userFacingMessage
        } catch {
            errorMessage = L10n.string(.authErrTryAgain)
        }
    }
}
