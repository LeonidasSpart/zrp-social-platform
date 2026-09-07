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
}
