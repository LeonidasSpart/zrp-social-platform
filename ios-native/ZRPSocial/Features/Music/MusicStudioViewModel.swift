import Foundation
import SwiftUI

/// The Music Studio's state.
///
/// The publish sequence is the website's, step for step: upload the audio
/// and cover together through the `musicTrack` uploader, then create the
/// track. The upload result is held in `pendingUpload` so a publish that
/// fails after the transfer can be retried without re-sending the audio -
/// the same reason the website keeps it.
@MainActor
final class MusicStudioViewModel: ObservableObject {

    enum Phase: Equatable {
        case loading
        case ready
        case failed(ApiError)
    }

    /// What the publish button is doing, so the label can say which -
    /// preparing a cloud file can legitimately take a while, and looking
    /// identical to uploading made it easy to mistake for a freeze.
    enum PublishStage: Equatable {
        case idle
        case uploading(progress: Double)
        case publishing
    }

    @Published private(set) var phase: Phase = .loading
    @Published private(set) var access: MusicAccess?
    @Published private(set) var artist: MusicArtistProfile?
    @Published private(set) var tracks: [StudioTrack] = []
    @Published private(set) var albums: [StudioAlbum] = []

    @Published private(set) var publishStage: PublishStage = .idle
    @Published private(set) var pendingUpload: PendingMusicUpload?
    @Published var publishError: String?
    @Published var banner: Banner?

    /// Set when a track is created, so the form knows to clear itself.
    /// A signal rather than a return value, because the publish runs in
    /// a task the view model owns - which is what makes it cancellable.
    @Published private(set) var lastPublishedTrackId: String?

    private var publishTask: Task<Void, Never>?

    struct Banner: Equatable, Identifiable {
        enum Kind { case success, failure }
        let id = UUID()
        let kind: Kind
        let text: String
    }

    private let repository: MusicStudioRepository
    private let uploader: UploadThingClient

    init(
        repository: MusicStudioRepository = MusicStudioRepository(),
        uploader: UploadThingClient = UploadThingClient()
    ) {
        self.repository = repository
        self.uploader = uploader
    }

    var canPublish: Bool { access?.allowed == true }

    /// True when an artist profile exists but has not been verified, and
    /// the account has no creator status either - the state the website
    /// calls "awaiting verification".
    var isAwaitingVerification: Bool {
        guard let access else { return false }
        return access.hasArtistProfile && !access.isVerifiedArtist && !access.isCreator
    }

    func load() async {
        do {
            let access = try await repository.access()
            self.access = access
            // The tracks and albums routes are the studio's own views of
            // the viewer's work and require an artist profile; asking for
            // them without publish access would just return 401/empty.
            if access.allowed {
                async let tracks = repository.myTracks()
                async let albums = repository.myAlbums()
                async let artist = repository.myArtist()
                self.tracks = try await tracks
                self.albums = try await albums
                self.artist = try await artist
            }
            phase = .ready
        } catch {
            phase = .failed(error as? ApiError ?? .transport(underlying: "\(error)"))
        }
    }

    func reloadTracks() async {
        tracks = (try? await repository.myTracks()) ?? tracks
    }

    func reloadAlbums() async {
        albums = (try? await repository.myAlbums()) ?? albums
    }

    // MARK: - Applying for artist status

    /// Creates the artist profile that a verification request is made
    /// against. Only ever called when the account has none - see
    /// `MusicStudioRepository.ensureArtistId`.
    func applyAsArtist(displayName: String) async {
        let trimmed = displayName.trimmingCharacters(in: .whitespacesAndNewlines)
        guard !trimmed.isEmpty else { return }
        do {
            artist = try await repository.saveArtist(
                ArtistProfileRequest(
                    displayName: trimmed,
                    bio: nil,
                    avatarUrl: nil,
                    bannerUrl: nil
                )
            )
            access = try await repository.access()
        } catch {
            show(.failure, message(for: error, fallback: .musicStudioSaveFailed))
        }
    }

    // MARK: - Publishing

    /// Uploads a track's files and creates it.
    ///
    /// `audio` is required; `cover` is optional. Both go through one
    /// presign so the router's middleware sees the whole set, matching
    /// the website's single `startUpload([audio, cover])`.
    /// Starts a publish, in a task this view model owns so it can be
    /// cancelled. A large track on a cellular connection is a long
    /// operation, and one with no way out is worse than a slow one.
    func beginPublish(
        title: String,
        genre: String,
        explicit: Bool,
        audio: PickedAudioFile,
        cover: PickedMedia?,
        artistName: String
    ) {
        publishTask?.cancel()
        publishTask = Task { [weak self] in
            await self?.publish(
                title: title,
                genre: genre,
                explicit: explicit,
                audio: audio,
                cover: cover,
                artistName: artistName
            )
        }
    }

    /// Stops an in-flight upload or publish.
    ///
    /// Deliberately not an error state: the person asked for this, so
    /// the form returns to rest with no failure message. Anything
    /// already uploaded stays in `pendingUpload`, so resuming does not
    /// re-send it.
    func cancelPublish() {
        publishTask?.cancel()
        publishTask = nil
        publishStage = .idle
        publishError = nil
    }

    private func publish(
        title: String,
        genre: String,
        explicit: Bool,
        audio: PickedAudioFile,
        cover: PickedMedia?,
        artistName: String
    ) async {
        let trimmedTitle = title.trimmingCharacters(in: .whitespacesAndNewlines)
        guard !trimmedTitle.isEmpty else {
            publishError = L10n.string(.musicStudioTitleRequired)
            return
        }

        publishError = nil

        // A previous attempt already uploaded: go straight to publishing
        // rather than sending the audio again.
        if let pendingUpload {
            await createTrack(
                from: pendingUpload,
                title: trimmedTitle,
                genre: genre,
                explicit: explicit,
                artistName: artistName
            )
            return
        }

        var candidates = [audio.asUploadCandidate()]
        if let cover { candidates.append(cover.asUploadCandidate()) }

        publishStage = .uploading(progress: 0)
        let uploaded: [UploadedMedia]
        do {
            uploaded = try await uploader.upload(candidates, to: .musicTrack) { [weak self] progress in
                Task { @MainActor in
                    self?.publishStage = .uploading(progress: progress)
                }
            }
        } catch {
            publishStage = .idle
            // A cancellation is not a failure to report back.
            if !Self.isCancellation(error) {
                publishError = uploadMessage(for: error)
            }
            return
        }

        // The server classifies each file and says which is which, so
        // the audio is identified by its answer rather than by position.
        guard let audioResult = uploaded.first(where: { $0.type == "audio" }) ?? uploaded.first else {
            publishStage = .idle
            publishError = L10n.string(.musicShellUploadFailedDefault)
            return
        }
        let coverResult = uploaded.first(where: { $0.type == "image" })

        let pending = PendingMusicUpload(
            audioUrl: audioResult.url,
            audioKey: audioResult.key,
            coverUrl: coverResult?.url,
            coverKey: coverResult?.key,
            durationSec: audio.durationSec
        )
        pendingUpload = pending

        await createTrack(
            from: pending,
            title: trimmedTitle,
            genre: genre,
            explicit: explicit,
            artistName: artistName
        )
    }

    private func createTrack(
        from upload: PendingMusicUpload,
        title: String,
        genre: String,
        explicit: Bool,
        artistName: String
    ) async {
        publishStage = .publishing
        do {
            let artistId = try await repository.ensureArtistId(
                displayName: artistName.trimmingCharacters(in: .whitespacesAndNewlines)
            )
            let trimmedGenre = genre.trimmingCharacters(in: .whitespacesAndNewlines)
            let created = try await repository.createTrack(
                CreateTrackRequest(
                    title: title,
                    genre: trimmedGenre.isEmpty ? nil : trimmedGenre,
                    explicit: explicit,
                    audioUrl: upload.audioUrl,
                    audioKey: upload.audioKey,
                    coverUrl: upload.coverUrl,
                    coverKey: upload.coverKey,
                    durationSec: upload.durationSec,
                    artistId: artistId
                )
            )
            tracks.insert(created, at: 0)
            pendingUpload = nil
            publishStage = .idle
            lastPublishedTrackId = created.id
            // Only overwrite on success. `artist = try? ...` would set
            // nil when the refetch merely failed, and a nil artist here
            // is indistinguishable from "this account has no profile" -
            // which is exactly the state the artist editor must never
            // save from.
            if let refreshed = try? await repository.myArtist() {
                artist = refreshed
            }
        } catch {
            // The upload is deliberately kept so Retry does not re-send
            // the file.
            publishStage = .idle
            if !Self.isCancellation(error) {
                publishError = message(for: error, fallback: .musicShellPublishFailedDefault)
            }
        }
    }

    func discardPendingUpload() {
        pendingUpload = nil
        publishError = nil
    }

    func reportPickFailure(_ error: PickedAudioFile.PickError, fileName: String) {
        switch error {
        case .empty:
            publishError = L10n.string(.musicShellEmptyFileError, ["name": fileName])
        case .unreadable, .accessDenied:
            publishError = L10n.string(.musicShellUnreadableFileError, ["name": fileName])
        }
    }

    /// Fetches the viewer's artist row fresh, for the profile editor.
    ///
    /// Deliberately not served from `artist`: that value can be stale or
    /// nil after a failed background refresh, and the editor must never
    /// populate itself with blanks it did not actually read. Throws
    /// rather than returning nil on failure, so "no profile yet" and
    /// "could not load" stay distinguishable.
    func fetchArtistProfile() async throws -> MusicArtistProfile? {
        let fetched = try await repository.myArtist()
        artist = fetched
        return fetched
    }

    // MARK: - Track and album mutations

    func updateTrack(id: String, _ request: TrackEditRequest) async -> Bool {
        do {
            let updated = try await repository.updateTrack(id: id, request)
            if let index = tracks.firstIndex(where: { $0.id == id }) {
                tracks[index] = updated
            }
            show(.success, L10n.string(.musicStudioTrackUpdatedMsg))
            return true
        } catch {
            show(.failure, message(for: error, fallback: .musicStudioSaveFailed))
            return false
        }
    }

    func deleteTrack(id: String) async {
        do {
            try await repository.deleteTrack(id: id)
            tracks.removeAll { $0.id == id }
            show(.success, L10n.string(.musicStudioTrackDeletedMsg))
        } catch {
            show(.failure, message(for: error, fallback: .musicStudioSaveFailed))
        }
    }

    func createAlbum(
        title: String,
        description: String?,
        coverUrl: String?,
        coverKey: String?,
        releaseDate: String?,
        artistName: String
    ) async -> Bool {
        do {
            let artistId = try await repository.ensureArtistId(displayName: artistName)
            let album = try await repository.createAlbum(
                CreateAlbumRequest(
                    artistId: artistId,
                    title: title,
                    description: description,
                    coverUrl: coverUrl,
                    coverKey: coverKey,
                    releaseDate: releaseDate
                )
            )
            albums.insert(album, at: 0)
            show(.success, L10n.string(.musicStudioAlbumCreatedMsg))
            return true
        } catch {
            show(.failure, message(for: error, fallback: .musicStudioSaveFailed))
            return false
        }
    }

    func updateAlbum(id: String, _ request: AlbumEditRequest) async -> Bool {
        do {
            let updated = try await repository.updateAlbum(id: id, request)
            if let index = albums.firstIndex(where: { $0.id == id }) {
                albums[index] = updated
            }
            show(.success, L10n.string(.musicStudioAlbumUpdatedMsg))
            return true
        } catch {
            show(.failure, message(for: error, fallback: .musicStudioSaveFailed))
            return false
        }
    }

    func deleteAlbum(id: String) async {
        do {
            try await repository.deleteAlbum(id: id)
            albums.removeAll { $0.id == id }
            // The route unassigns this album's tracks rather than
            // deleting them, so the track list is genuinely different
            // now and is refetched rather than assumed.
            await reloadTracks()
            show(.success, L10n.string(.musicStudioAlbumDeletedMsg))
        } catch {
            show(.failure, message(for: error, fallback: .musicStudioSaveFailed))
        }
    }

    func addTrack(_ track: StudioTrack, toAlbum albumId: String, position: Int) async {
        do {
            try await repository.assignTrack(id: track.id, toAlbum: albumId, trackNumber: position)
            await reloadTracks()
        } catch {
            show(.failure, message(for: error, fallback: .musicStudioSaveFailed))
        }
    }

    func removeTrackFromAlbum(_ track: StudioTrack) async {
        do {
            try await repository.unassignTrack(id: track.id)
            await reloadTracks()
        } catch {
            show(.failure, message(for: error, fallback: .musicStudioSaveFailed))
        }
    }

    func reorderAlbum(id: String, orderedTrackIds: [String]) async {
        do {
            try await repository.reorderAlbum(id: id, orderedTrackIds: orderedTrackIds)
            await reloadTracks()
        } catch {
            show(.failure, message(for: error, fallback: .musicStudioSaveFailed))
        }
    }

    func saveArtistProfile(_ request: ArtistProfileRequest) async -> Bool {
        do {
            artist = try await repository.saveArtist(request)
            access = try await repository.access()
            show(.success, L10n.string(.musicStudioArtistProfileSaved))
            return true
        } catch {
            show(.failure, message(for: error, fallback: .musicStudioSaveFailed))
            return false
        }
    }

    // MARK: - Messages

    private func show(_ kind: Banner.Kind, _ text: String) {
        banner = Banner(kind: kind, text: text)
    }

    /// Prefers the server's own message. The music routes return real,
    /// specific reasons - the publish gate's wording, "You don't own this
    /// track", "Album not found" - which are far more useful than a
    /// generic failure line.
    private func message(for error: Error, fallback: L10nKey) -> String {
        if let apiError = error as? ApiError, let serverMessage = apiError.serverMessage {
            return serverMessage
        }
        return L10n.string(fallback)
    }

    /// Cancellation reaches here in three shapes: Swift's own
    /// `CancellationError`, `URLSession`'s `URLError.cancelled` from the
    /// transfer, and `ApiError.cancelled` from the create call.
    private static func isCancellation(_ error: Error) -> Bool {
        if error is CancellationError { return true }
        if let apiError = error as? ApiError, apiError == .cancelled { return true }
        if let urlError = error as? URLError, urlError.code == .cancelled { return true }
        return false
    }

    private func uploadMessage(for error: Error) -> String {
        if let uploadError = error as? UploadThingClient.UploadError,
           case .presignFailed(let message) = uploadError,
           let message, !message.isEmpty {
            // The uploader's middleware rejects with the publish gate's
            // own wording, which is exactly what the person needs to see.
            return message
        }
        return L10n.string(.musicShellUploadFailedDefault)
    }
}
