import Foundation

/// `GET /api/music/access` - whether this account may publish music.
///
/// The gate is `getMusicPublishAccess` in `src/lib/music/permissions.ts`:
/// an approved `CreatorProfile` **or** an already-verified `MusicArtist`
/// profile. It is derived server-side from the session's user id and is
/// enforced twice - by the UploadThing middleware and again by
/// `POST /api/music/tracks` - so a client can neither bypass it nor be
/// the thing that decides it. This app reads it only to decide what to
/// show, never as the authorisation itself.
struct MusicAccess: Decodable, Equatable {
    let allowed: Bool
    let isCreator: Bool
    let isVerifiedArtist: Bool
    let hasArtistProfile: Bool

    /// `"unauthenticated"` or `"not_creator_or_verified"`, absent when
    /// allowed.
    let reason: String?

    init(from decoder: Decoder) throws {
        let container = try decoder.container(keyedBy: CodingKeys.self)
        allowed = try container.decodeIfPresent(Bool.self, forKey: .allowed) ?? false
        isCreator = try container.decodeIfPresent(Bool.self, forKey: .isCreator) ?? false
        isVerifiedArtist = try container.decodeIfPresent(Bool.self, forKey: .isVerifiedArtist) ?? false
        hasArtistProfile = try container.decodeIfPresent(Bool.self, forKey: .hasArtistProfile) ?? false
        reason = try container.decodeIfPresent(String.self, forKey: .reason)
    }

    private enum CodingKeys: String, CodingKey {
        case allowed, isCreator, isVerifiedArtist, hasArtistProfile, reason
    }
}

/// The viewer's own `MusicArtist` row, from `GET /api/music/artists?mine=true`.
///
/// That route returns a bare `null` when the account has no artist
/// profile yet, which is why the repository returns this as an optional
/// rather than throwing.
struct MusicArtistProfile: Decodable, Equatable {
    let id: String
    let displayName: String
    let bio: String?
    let avatarUrl: String?
    let bannerUrl: String?
    let verified: Bool

    init(from decoder: Decoder) throws {
        let container = try decoder.container(keyedBy: CodingKeys.self)
        id = try container.decode(String.self, forKey: .id)
        displayName = try container.decodeIfPresent(String.self, forKey: .displayName) ?? ""
        bio = try container.decodeIfPresent(String.self, forKey: .bio)
        avatarUrl = try container.decodeIfPresent(String.self, forKey: .avatarUrl)
        bannerUrl = try container.decodeIfPresent(String.self, forKey: .bannerUrl)
        verified = try container.decodeIfPresent(Bool.self, forKey: .verified) ?? false
    }

    private enum CodingKeys: String, CodingKey {
        case id, displayName, bio, avatarUrl, bannerUrl, verified
    }
}

/// One of the viewer's own tracks, from `GET /api/music/tracks?mine=true`.
///
/// Distinct from `MusicTrack` because it is a different projection of the
/// same row: this one carries `status`, `albumId`, `trackNumber` and
/// `coverKey`, which the player never needs, and it includes tracks in
/// **any** status - the studio must be able to see and manage a track
/// that is not currently published, which no listening surface returns.
struct StudioTrack: Decodable, Identifiable, Equatable {
    let id: String
    let title: String
    let description: String?
    let genre: String?
    let explicit: Bool
    let status: String
    let audioUrl: String
    let coverUrl: String?
    let coverKey: String?
    let albumId: String?
    let trackNumber: Int?
    let playCount: Int
    let durationSec: Int?
    let createdAt: Date?
    let album: MusicAlbumRef?

    var isPublished: Bool { status == "PUBLISHED" }

    init(from decoder: Decoder) throws {
        let container = try decoder.container(keyedBy: CodingKeys.self)
        id = try container.decode(String.self, forKey: .id)
        title = try container.decodeIfPresent(String.self, forKey: .title) ?? ""
        description = try container.decodeIfPresent(String.self, forKey: .description)
        genre = try container.decodeIfPresent(String.self, forKey: .genre)
        explicit = try container.decodeIfPresent(Bool.self, forKey: .explicit) ?? false
        status = try container.decodeIfPresent(String.self, forKey: .status) ?? ""
        audioUrl = try container.decodeIfPresent(String.self, forKey: .audioUrl) ?? ""
        coverUrl = try container.decodeIfPresent(String.self, forKey: .coverUrl)
        coverKey = try container.decodeIfPresent(String.self, forKey: .coverKey)
        albumId = try container.decodeIfPresent(String.self, forKey: .albumId)
        trackNumber = try container.decodeIfPresent(Int.self, forKey: .trackNumber)
        playCount = try container.decodeIfPresent(Int.self, forKey: .playCount) ?? 0
        durationSec = try container.decodeIfPresent(Int.self, forKey: .durationSec)
        createdAt = try container.decodeIfPresent(Date.self, forKey: .createdAt)
        album = try container.decodeIfPresent(MusicAlbumRef.self, forKey: .album)
    }

    private enum CodingKeys: String, CodingKey {
        case id, title, description, genre, explicit, status, audioUrl
        case coverUrl, coverKey, albumId, trackNumber, playCount, durationSec
        case createdAt, album
    }
}

/// One of the viewer's own albums, from `GET /api/music/albums?mine=true`.
struct StudioAlbum: Decodable, Identifiable, Equatable {
    let id: String
    let title: String
    let description: String?
    let coverUrl: String?
    let coverKey: String?
    let releaseDate: Date?
    let totalDurationSec: Int?
    let trackCount: Int

    init(from decoder: Decoder) throws {
        let container = try decoder.container(keyedBy: CodingKeys.self)
        id = try container.decode(String.self, forKey: .id)
        title = try container.decodeIfPresent(String.self, forKey: .title) ?? ""
        description = try container.decodeIfPresent(String.self, forKey: .description)
        coverUrl = try container.decodeIfPresent(String.self, forKey: .coverUrl)
        coverKey = try container.decodeIfPresent(String.self, forKey: .coverKey)
        releaseDate = try container.decodeIfPresent(Date.self, forKey: .releaseDate)
        totalDurationSec = try container.decodeIfPresent(Int.self, forKey: .totalDurationSec)
        // `_count` is Prisma's shape, and a leading underscore is not a
        // legal Swift identifier, so it is unwrapped here rather than
        // modelled as a nested type.
        let counts = try container.decodeIfPresent(Counts.self, forKey: .counts)
        trackCount = counts?.tracks ?? 0
    }

    private struct Counts: Decodable {
        let tracks: Int?
    }

    private enum CodingKeys: String, CodingKey {
        case id, title, description, coverUrl, coverKey, releaseDate, totalDurationSec
        case counts = "_count"
    }
}

/// An upload that landed, held so a failed publish can be retried
/// without re-sending the audio.
///
/// The website keeps exactly this state for exactly this reason: the
/// audio can be hundreds of megabytes, and a publish call that fails
/// after it (a dropped connection, a backgrounded app) must not cost the
/// whole transfer.
struct PendingMusicUpload: Equatable {
    let audioUrl: String
    let audioKey: String?
    let coverUrl: String?
    let coverKey: String?
    let durationSec: Int?
}
