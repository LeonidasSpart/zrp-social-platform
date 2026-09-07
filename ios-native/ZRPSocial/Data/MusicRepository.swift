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
        try await client.send(Endpoint.get("music/playlists/\(id)"))
    }

    /// The one music route with an envelope: `{likes, history,
    /// artistFollows}`, each an array of join rows wrapping a track or
    /// artist rather than the entity itself.
    func library() async throws -> MusicLibrary {
        try await client.send(Endpoint.get("music/library"))
    }
}
