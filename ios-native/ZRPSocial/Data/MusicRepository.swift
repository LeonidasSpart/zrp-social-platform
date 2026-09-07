import Foundation

protocol MusicRepositoryProtocol: Sendable {
    func home() async throws -> MusicHome
    func toggleLike(trackId: String) async throws -> Bool
    func reportPlay(
        trackId: String,
        durationSec: Int?,
        secondsPlayed: Int,
        completed: Bool
    ) async throws
    func genres() async throws -> [MusicGenre]
    func tracks(query: String?, limit: Int) async throws -> [MusicTrack]
    func artists(query: String?, sort: String, limit: Int) async throws -> [MusicArtist]
    func artist(id: String) async throws -> MusicArtistDetail
    func toggleArtistFollow(id: String) async throws -> Bool
    func albums(query: String?, limit: Int) async throws -> [MusicAlbum]
    func album(id: String) async throws -> MusicAlbumDetail
    func playlists() async throws -> [MusicPlaylist]
    func playlist(id: String) async throws -> MusicPlaylistDetail
    func createPlaylist(name: String, description: String?, isPublic: Bool) async throws -> MusicPlaylist
    func updatePlaylist(
        id: String,
        name: String?,
        description: ArtistProfileField,
        isPublic: Bool?
    ) async throws -> MusicPlaylist
    func deletePlaylist(id: String) async throws
    func togglePlaylistTrack(playlistId: String, trackId: String) async throws -> Bool
    func reorderPlaylist(id: String, orderedEntryIds: [String]) async throws
    func library() async throws -> MusicLibrary
}

struct MusicRepository: MusicRepositoryProtocol {

    private let client: ApiClient

    init(client: ApiClient = .shared) {
        self.client = client
    }

    private struct LikeRequest: Encodable {
        let trackId: String
    }

    private struct PlayRequest: Encodable {
        let trackId: String
        let durationSec: Int?
        let secondsPlayed: Int
        let completed: Bool
    }

    /// Eight sections in one response - trending, new releases, latest
    /// albums, popular artists, genres, recently played, liked preview
    /// and the viewer's playlists. Signed-out callers get the public
    /// sections with the personal ones empty, so this does not require a
    /// session.
    func home() async throws -> MusicHome {
        try await client.send(Endpoint.get("music/home"))
    }

    func toggleLike(trackId: String) async throws -> Bool {
        let response: MusicLikeResponse = try await client.send(
            try Endpoint.post("music/tracks/like", body: LikeRequest(trackId: trackId))
        )
        return response.liked
    }

    /// Records a play, and repairs the track's stored duration.
    ///
    /// The route increments `playCount`, writes a `MusicHistory` row for
    /// a signed-in listener, and - this is the part worth getting right -
    /// **backfills `durationSec` when the track has none stored**. Tracks
    /// published before duration was captured at upload show "--:--"
    /// everywhere, permanently, with no way to fix them short of
    /// re-uploading.
    ///
    /// `AVPlayer` knows the real decoded duration, so reporting it here
    /// repairs that track for every listener on every platform. The route
    /// only ever writes it when nothing is stored, so this cannot
    /// overwrite a correct value.
    func reportPlay(
        trackId: String,
        durationSec: Int?,
        secondsPlayed: Int,
        completed: Bool
    ) async throws {
        try await client.sendIgnoringResponse(
            try Endpoint.post(
                "music/tracks/play",
                body: PlayRequest(
                    trackId: trackId,
                    durationSec: durationSec,
                    secondsPlayed: max(0, secondsPlayed),
                    completed: completed
                )
            )
        )
    }

    // MARK: - Browse
    //
    // These five list routes all return **bare arrays**, not envelopes -
    // unlike `/music/library`, which is the one exception. Verified route
    // by route rather than assumed consistent across the music surface.

    func genres() async throws -> [MusicGenre] {
        try await client.send(Endpoint.get("music/genres"))
    }

    func tracks(query: String?, limit: Int = 30) async throws -> [MusicTrack] {
        try await client.send(
            Endpoint.get("music/tracks", query: [
                ("q", query?.isEmpty == false ? query : nil),
                ("limit", "\(limit)"),
            ])
        )
    }

    /// `sort` is `"name"` (default) or `"popular"`; the route clamps
    /// `limit` to 100.
    func artists(query: String?, sort: String = "name", limit: Int = 50) async throws -> [MusicArtist] {
        try await client.send(
            Endpoint.get("music/artists", query: [
                ("q", query?.isEmpty == false ? query : nil),
                ("sort", sort),
                ("limit", "\(limit)"),
            ])
        )
    }

    /// The artist plus its albums, tracks, and the viewer's follow state
    /// in one object - no separate follow-status call needed.
    func artist(id: String) async throws -> MusicArtistDetail {
        try await client.send(Endpoint.get("music/artists/\(id)"))
    }

    func toggleArtistFollow(id: String) async throws -> Bool {
        struct FollowResponse: Decodable { let following: Bool? }
        let response: FollowResponse = try await client.send(
            Endpoint.post("music/artists/\(id)/follow")
        )
        return response.following ?? false
    }

    func albums(query: String?, limit: Int = 50) async throws -> [MusicAlbum] {
        try await client.send(
            Endpoint.get("music/albums", query: [
                ("q", query?.isEmpty == false ? query : nil),
                ("limit", "\(limit)"),
            ])
        )
    }

    func album(id: String) async throws -> MusicAlbumDetail {
        try await client.send(Endpoint.get("music/albums/\(id)"))
    }

    /// The viewer's own playlists. Requires a session (401 otherwise).
    func playlists() async throws -> [MusicPlaylist] {
        try await client.send(Endpoint.get("music/playlists"))
    }

    func playlist(id: String) async throws -> MusicPlaylistDetail {
        try await client.send(Endpoint.get("music/playlists/\(Endpoint.segment(id))"))
    }

    /// `POST /api/music/playlists`. The name is required (400 without
    /// one) and truncated server-side to 100 characters; `isPublic`
    /// defaults to true when omitted, which is why it is sent explicitly
    /// rather than left out.
    func createPlaylist(
        name: String,
        description: String?,
        isPublic: Bool
    ) async throws -> MusicPlaylist {
        struct Request: Encodable {
            let name: String
            let description: String?
            let isPublic: Bool
        }
        return try await client.send(
            try Endpoint.post(
                "music/playlists",
                body: Request(name: name, description: description, isPublic: isPublic)
            )
        )
    }

    /// `PATCH /api/music/playlists/{id}`, owner-only (404 otherwise -
    /// the route does not distinguish "not yours" from "not there").
    ///
    /// Key-presence semantics, exactly like the artist profile route: a
    /// field the body omits is left alone, an explicit `null` clears it,
    /// a value sets it. `ArtistProfileField` already encodes those three
    /// states, so it is reused rather than re-invented.
    func updatePlaylist(
        id: String,
        name: String?,
        description: ArtistProfileField,
        isPublic: Bool?
    ) async throws -> MusicPlaylist {
        struct Request: Encodable {
            let name: String?
            let description: ArtistProfileField
            let isPublic: Bool?

            enum CodingKeys: String, CodingKey {
                case name, description, isPublic
            }

            func encode(to encoder: Encoder) throws {
                var container = encoder.container(keyedBy: CodingKeys.self)
                try container.encodeIfPresent(name, forKey: .name)
                try container.encodeIfPresent(isPublic, forKey: .isPublic)
                switch description {
                case .unchanged: break
                case .clear: try container.encodeNil(forKey: .description)
                case .value(let text): try container.encode(text, forKey: .description)
                }
            }
        }
        return try await client.send(
            try Endpoint.patch(
                "music/playlists/\(Endpoint.segment(id))",
                body: Request(name: name, description: description, isPublic: isPublic)
            )
        )
    }

    func deletePlaylist(id: String) async throws {
        try await client.sendIgnoringResponse(
            Endpoint.delete("music/playlists/\(Endpoint.segment(id))")
        )
    }

    /// `POST /api/music/playlists/{id}` with a `trackId` is a **toggle**,
    /// not an add: a track already in the playlist is removed. It answers
    /// `{added}` with the state it settled on, which is what the caller
    /// reports rather than assuming.
    func togglePlaylistTrack(playlistId: String, trackId: String) async throws -> Bool {
        struct Request: Encodable { let trackId: String }
        struct Response: Decodable { let added: Bool }
        let response: Response = try await client.send(
            try Endpoint.post(
                "music/playlists/\(Endpoint.segment(playlistId))",
                body: Request(trackId: trackId)
            )
        )
        return response.added
    }

    /// `POST /api/music/playlists/{id}/reorder`.
    ///
    /// Takes the ids of the playlist's **join rows** - `MusicPlaylistEntry.id` -
    /// not track ids. The route filters the list against the rows that
    /// actually belong to this playlist and refuses an empty result with
    /// a 400, so sending track ids would fail rather than silently
    /// scramble another playlist.
    func reorderPlaylist(id: String, orderedEntryIds: [String]) async throws {
        struct Request: Encodable { let orderedIds: [String] }
        try await client.sendIgnoringResponse(
            try Endpoint.post(
                "music/playlists/\(Endpoint.segment(id))/reorder",
                body: Request(orderedIds: orderedEntryIds)
            )
        )
    }

    /// The one music route with an envelope: `{likes, history,
    /// artistFollows}`, each an array of join rows wrapping a track or
    /// artist rather than the entity itself.
    func library() async throws -> MusicLibrary {
        try await client.send(Endpoint.get("music/library"))
    }
}
