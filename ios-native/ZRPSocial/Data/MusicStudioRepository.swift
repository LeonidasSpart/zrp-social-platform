import Foundation

/// The Music Studio's data layer.
///
/// Every call here maps to a route the ZRP website already uses, with the
/// same method, path, body shape and expected response. Nothing in this
/// file invents an endpoint, a parameter or a status code.
///
/// One deliberate difference in *usage* - not in semantics - is recorded
/// on `ensureArtistId()` below.
protocol MusicStudioRepositoryProtocol: Sendable {
    func access() async throws -> MusicAccess
    func myArtist() async throws -> MusicArtistProfile?
    func saveArtist(_ request: ArtistProfileRequest) async throws -> MusicArtistProfile
    func ensureArtistId(displayName: String?) async throws -> String
    func myTracks() async throws -> [StudioTrack]
    func myAlbums() async throws -> [StudioAlbum]
    func createTrack(_ request: CreateTrackRequest) async throws -> StudioTrack
    func updateTrack(id: String, _ request: TrackEditRequest) async throws -> StudioTrack
    func assignTrack(id: String, toAlbum albumId: String, trackNumber: Int) async throws
    func unassignTrack(id: String) async throws
    func deleteTrack(id: String) async throws
    func createAlbum(_ request: CreateAlbumRequest) async throws -> StudioAlbum
    func updateAlbum(id: String, _ request: AlbumEditRequest) async throws -> StudioAlbum
    func deleteAlbum(id: String) async throws
    func reorderAlbum(id: String, orderedTrackIds: [String]) async throws
}

// MARK: - Request bodies
//
// These encode explicit `null`s rather than omitting absent fields,
// because the PATCH routes distinguish the two: an omitted key leaves a
// column untouched, and `null` clears it. Swift's synthesised encoder
// omits nil optionals, which would silently turn "clear this genre" into
// "leave the genre alone" - so every one of these writes its container
// by hand, matching exactly what the website sends.

struct ArtistProfileRequest: Encodable {
    let displayName: String?
    let bio: String?
    let avatarUrl: String?
    let bannerUrl: String?

    func encode(to encoder: Encoder) throws {
        var container = encoder.container(keyedBy: CodingKeys.self)
        // `displayName` is the one field the route falls back for
        // (`body.displayName || session.user.name || username`), so an
        // omitted value is meaningful and a null is not.
        try container.encodeIfPresent(displayName, forKey: .displayName)
        try container.encode(bio, forKey: .bio)
        try container.encode(avatarUrl, forKey: .avatarUrl)
        try container.encode(bannerUrl, forKey: .bannerUrl)
    }

    private enum CodingKeys: String, CodingKey {
        case displayName, bio, avatarUrl, bannerUrl
    }
}

struct CreateTrackRequest: Encodable {
    let title: String
    let genre: String?
    let explicit: Bool
    let audioUrl: String
    let audioKey: String?
    let coverUrl: String?
    let coverKey: String?
    let durationSec: Int?
    let artistId: String

    func encode(to encoder: Encoder) throws {
        var container = encoder.container(keyedBy: CodingKeys.self)
        try container.encode(title, forKey: .title)
        try container.encode(genre, forKey: .genre)
        try container.encode(explicit, forKey: .explicit)
        try container.encode(audioUrl, forKey: .audioUrl)
        try container.encode(audioKey, forKey: .audioKey)
        try container.encode(coverUrl, forKey: .coverUrl)
        try container.encode(coverKey, forKey: .coverKey)
        try container.encode(durationSec, forKey: .durationSec)
        try container.encode(artistId, forKey: .artistId)
    }

    private enum CodingKeys: String, CodingKey {
        case title, genre, explicit, audioUrl, audioKey
        case coverUrl, coverKey, durationSec, artistId
    }
}

struct TrackEditRequest: Encodable {
    let title: String
    let description: String?
    let genre: String?
    let explicit: Bool
    let coverUrl: String?
    let coverKey: String?
    let albumId: String?

    func encode(to encoder: Encoder) throws {
        var container = encoder.container(keyedBy: CodingKeys.self)
        try container.encode(title, forKey: .title)
        try container.encode(description, forKey: .description)
        try container.encode(genre, forKey: .genre)
        try container.encode(explicit, forKey: .explicit)
        try container.encode(coverUrl, forKey: .coverUrl)
        try container.encode(coverKey, forKey: .coverKey)
        try container.encode(albumId, forKey: .albumId)
    }

    private enum CodingKeys: String, CodingKey {
        case title, description, genre, explicit, coverUrl, coverKey, albumId
    }
}

struct CreateAlbumRequest: Encodable {
    let artistId: String
    let title: String
    let description: String?
    let coverUrl: String?
    let coverKey: String?
    /// `yyyy-MM-dd`, which is what the website's date input produces and
    /// what the route hands to `new Date(...)`.
    let releaseDate: String?

    func encode(to encoder: Encoder) throws {
        var container = encoder.container(keyedBy: CodingKeys.self)
        try container.encode(artistId, forKey: .artistId)
        try container.encode(title, forKey: .title)
        try container.encode(description, forKey: .description)
        try container.encode(coverUrl, forKey: .coverUrl)
        try container.encode(coverKey, forKey: .coverKey)
        try container.encode(releaseDate, forKey: .releaseDate)
    }

    private enum CodingKeys: String, CodingKey {
        case artistId, title, description, coverUrl, coverKey, releaseDate
    }
}

struct AlbumEditRequest: Encodable {
    let title: String
    let description: String?
    let coverUrl: String?
    let coverKey: String?
    let releaseDate: String?

    func encode(to encoder: Encoder) throws {
        var container = encoder.container(keyedBy: CodingKeys.self)
        try container.encode(title, forKey: .title)
        try container.encode(description, forKey: .description)
        try container.encode(coverUrl, forKey: .coverUrl)
        try container.encode(coverKey, forKey: .coverKey)
        try container.encode(releaseDate, forKey: .releaseDate)
    }

    private enum CodingKeys: String, CodingKey {
        case title, description, coverUrl, coverKey, releaseDate
    }
}

// MARK: - Repository

struct MusicStudioRepository: MusicStudioRepositoryProtocol {

    private let client: ApiClient

    init(client: ApiClient = .shared) {
        self.client = client
    }

    func access() async throws -> MusicAccess {
        try await client.send(Endpoint.get("music/access"))
    }

    /// The viewer's own artist row, or `nil` when they have none.
    ///
    /// `GET /api/music/artists?mine=true` answers with a bare `null` in
    /// that case - a valid JSON body, not an error - so it is decoded as
    /// an optional rather than treated as a failure.
    func myArtist() async throws -> MusicArtistProfile? {
        try await client.sendAllowingNull(
            Endpoint.get("music/artists", query: [("mine", "true")])
        )
    }

    /// Creates or updates the viewer's artist profile.
    ///
    /// `POST /api/music/artists` is an **upsert whose update branch
    /// always writes bio, avatarUrl and bannerUrl**. Calling it with
    /// fields the caller has not loaded therefore erases them. This app
    /// only ever calls it from the artist-profile editor, which loads
    /// every field first - exactly as the website's own Artist tab does,
    /// and for the reason its comment gives.
    ///
    /// See `ensureArtistId()` for why publishing does not call it.
    func saveArtist(_ request: ArtistProfileRequest) async throws -> MusicArtistProfile {
        try await client.send(try Endpoint.post("music/artists", body: request))
    }

    /// The artist id to publish under, without touching the profile.
    ///
    /// The website's publish and album-create paths both `POST
    /// /api/music/artists` first, sending only a display name. Because
    /// that route's update branch unconditionally writes `bio`,
    /// `avatarUrl` and `bannerUrl` from the body, those calls wipe an
    /// existing artist's bio and images every time someone publishes a
    /// track. That is reported in PARITY.md (F1) as a backend/web defect
    /// for its owners to fix - not worked around with a different route.
    ///
    /// This reads the id instead, and only creates a profile when the
    /// account genuinely has none. Same routes, same semantics, no
    /// destructive write - and once F1 is fixed, nothing here changes.
    func ensureArtistId(displayName: String?) async throws -> String {
        if let existing = try await myArtist() {
            return existing.id
        }
        let created = try await saveArtist(
            ArtistProfileRequest(
                displayName: displayName?.isEmpty == false ? displayName : nil,
                bio: nil,
                avatarUrl: nil,
                bannerUrl: nil
            )
        )
        return created.id
    }

    /// Every track owned by the viewer's artist profile, in any status -
    /// this is the only music route that returns unpublished rows, which
    /// is what makes it the studio's list rather than a listening one.
    /// Returns a bare array, and an empty one when there is no artist
    /// profile yet.
    func myTracks() async throws -> [StudioTrack] {
        try await client.send(
            Endpoint.get("music/tracks", query: [("mine", "true"), ("limit", "100")])
        )
    }

    func myAlbums() async throws -> [StudioAlbum] {
        try await client.send(
            Endpoint.get("music/albums", query: [("mine", "true"), ("limit", "100")])
        )
    }

    func createTrack(_ request: CreateTrackRequest) async throws -> StudioTrack {
        try await client.send(try Endpoint.post("music/tracks", body: request))
    }

    func updateTrack(id: String, _ request: TrackEditRequest) async throws -> StudioTrack {
        try await client.send(try Endpoint.patch("music/tracks/\(id)", body: request))
    }

    /// Adds a track to an album. The route re-checks that the album
    /// belongs to the same artist, so a track cannot be dropped into
    /// someone else's album by id.
    func assignTrack(id: String, toAlbum albumId: String, trackNumber: Int) async throws {
        struct Request: Encodable {
            let albumId: String
            let trackNumber: Int
        }
        try await client.sendIgnoringResponse(
            try Endpoint.patch(
                "music/tracks/\(id)",
                body: Request(albumId: albumId, trackNumber: trackNumber)
            )
        )
    }

    /// Removes a track from its album. Sends `albumId: null` and nothing
    /// else - the route clears `trackNumber` itself.
    func unassignTrack(id: String) async throws {
        struct Request: Encodable {
            let albumId: String?

            func encode(to encoder: Encoder) throws {
                var container = encoder.container(keyedBy: CodingKeys.self)
                try container.encode(albumId, forKey: .albumId)
            }

            enum CodingKeys: String, CodingKey { case albumId }
        }
        try await client.sendIgnoringResponse(
            try Endpoint.patch("music/tracks/\(id)", body: Request(albumId: nil))
        )
    }

    func deleteTrack(id: String) async throws {
        try await client.sendIgnoringResponse(Endpoint.delete("music/tracks/\(id)"))
    }

    func createAlbum(_ request: CreateAlbumRequest) async throws -> StudioAlbum {
        try await client.send(try Endpoint.post("music/albums", body: request))
    }

    func updateAlbum(id: String, _ request: AlbumEditRequest) async throws -> StudioAlbum {
        try await client.send(try Endpoint.patch("music/albums/\(id)", body: request))
    }

    /// Deleting an album does **not** delete its tracks - the route
    /// unassigns them and they stay published and playable. The
    /// confirmation copy says so, because an artist deleting an album
    /// must be able to trust that.
    func deleteAlbum(id: String) async throws {
        try await client.sendIgnoringResponse(Endpoint.delete("music/albums/\(id)"))
    }

    func reorderAlbum(id: String, orderedTrackIds: [String]) async throws {
        struct Request: Encodable {
            let orderedTrackIds: [String]
        }
        try await client.sendIgnoringResponse(
            try Endpoint.post(
                "music/albums/\(id)/reorder",
                body: Request(orderedTrackIds: orderedTrackIds)
            )
        )
    }
}
