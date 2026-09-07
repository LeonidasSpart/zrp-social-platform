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

/// One profile field in an artist write.
///
/// `POST /api/music/artists` decides per field by **key presence**:
///
/// ```ts
/// if ("bio" in body) profileUpdate.bio = body.bio || null;
/// ```
///
/// So all three states are real and distinct, and an `Optional` cannot
/// express them: omitting the key leaves the column alone, an explicit
/// `null` clears it, and a value sets it.
enum ArtistProfileField: Equatable {
    /// Key omitted - the server leaves the stored value untouched.
    case unchanged
    /// Explicit `null` - the server clears the stored value.
    case clear
    case value(String)

    /// Empty text means the person emptied the field, which is a clear.
    init(text: String) {
        let trimmed = text.trimmingCharacters(in: .whitespacesAndNewlines)
        self = trimmed.isEmpty ? .clear : .value(trimmed)
    }

    /// A URL the editor holds, or a clear when it holds none.
    init(url: String?) {
        guard let url, !url.isEmpty else {
            self = .clear
            return
        }
        self = .value(url)
    }
}

struct ArtistProfileRequest: Encodable {
    let displayName: String?
    let bio: ArtistProfileField
    let avatarUrl: ArtistProfileField
    let bannerUrl: ArtistProfileField

    /// The profile editor, which has loaded every field and is saving all
    /// of them. An emptied field clears; a filled one sets.
    static func fullProfile(
        displayName: String?,
        bio: String,
        avatarUrl: String?,
        bannerUrl: String?
    ) -> ArtistProfileRequest {
        ArtistProfileRequest(
            displayName: displayName,
            bio: ArtistProfileField(text: bio),
            avatarUrl: ArtistProfileField(url: avatarUrl),
            bannerUrl: ArtistProfileField(url: bannerUrl)
        )
    }

    /// Applying as an artist, or creating the row a publish needs. These
    /// callers know nothing about the profile fields, so they say nothing
    /// about them - which the route now honours by leaving them alone.
    static func nameOnly(_ displayName: String?) -> ArtistProfileRequest {
        ArtistProfileRequest(
            displayName: displayName,
            bio: .unchanged,
            avatarUrl: .unchanged,
            bannerUrl: .unchanged
        )
    }

    func encode(to encoder: Encoder) throws {
        var container = encoder.container(keyedBy: CodingKeys.self)
        // `displayName` is the one field the route falls back for
        // (`body.displayName || session.user.name || username`), so an
        // omitted value is meaningful and a null is not.
        try container.encodeIfPresent(displayName, forKey: .displayName)
        try encode(bio, forKey: .bio, into: &container)
        try encode(avatarUrl, forKey: .avatarUrl, into: &container)
        try encode(bannerUrl, forKey: .bannerUrl, into: &container)
    }

    private func encode(
        _ field: ArtistProfileField,
        forKey key: CodingKeys,
        into container: inout KeyedEncodingContainer<CodingKeys>
    ) throws {
        switch field {
        case .unchanged:
            break
        case .clear:
            try container.encodeNil(forKey: key)
        case .value(let text):
            try container.encode(text, forKey: key)
        }
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
    /// `POST /api/music/artists` upserts by session user id, and decides
    /// each profile field by key presence: an omitted key leaves the
    /// column alone, an explicit `null` clears it, a value sets it. That
    /// is what `ArtistProfileField` encodes, so a caller that knows
    /// nothing about the bio says nothing about it.
    ///
    /// `displayName` is the exception: the route writes it on every
    /// update, falling back to the account's name when the body omits
    /// it. `ensureArtistId` is built around that.
    func saveArtist(_ request: ArtistProfileRequest) async throws -> MusicArtistProfile {
        try await client.send(try Endpoint.post("music/artists", body: request))
    }

    /// The artist id to publish or create an album under.
    ///
    /// The route is explicitly a get-or-create for these callers, and
    /// since the key-presence fix it no longer disturbs a profile it was
    /// not told about - so sending a name the person actually typed is a
    /// real, intended update and is passed straight through.
    ///
    /// The one asymmetry left is `displayName`, which the route writes on
    /// every update whether or not the body carries one: posting an empty
    /// body would rename an artist to the account's own name. So when
    /// there is no name to set, the id is read instead of upserted -
    /// not to dodge a bug, but because there is nothing to write.
    func ensureArtistId(displayName: String?) async throws -> String {
        let name = displayName?.trimmingCharacters(in: .whitespacesAndNewlines)

        if let name, !name.isEmpty {
            return try await saveArtist(.nameOnly(name)).id
        }

        if let existing = try await myArtist() {
            return existing.id
        }
        return try await saveArtist(.nameOnly(nil)).id
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
