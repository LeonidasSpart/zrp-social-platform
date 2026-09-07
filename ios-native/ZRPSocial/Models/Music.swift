import Foundation

/// A published track.
///
/// `audioUrl` is what the player streams. `durationSec` is nullable in
/// the schema: tracks published before duration was captured at upload
/// have none, which is why the play route accepts a client-reported
/// duration and backfills it - see `MusicRepository.reportPlay`.
struct MusicTrack: Decodable, Identifiable, Equatable, Hashable {
    let id: String
    let title: String
    let audioUrl: String
    let coverUrl: String?
    let durationSec: Int?
    let genre: String?
    let explicit: Bool
    let playCount: Int
    let artist: MusicArtistRef?
    let album: MusicAlbumRef?

    /// Attached per-viewer by the routes that select the caller's own
    /// likes. Absent when signed out.
    let liked: Bool?

    private enum CodingKeys: String, CodingKey {
        case id, title, audioUrl, coverUrl, durationSec, genre
        case explicit, playCount, artist, album, liked
    }

    init(from decoder: Decoder) throws {
        let container = try decoder.container(keyedBy: CodingKeys.self)
        id = try container.decode(String.self, forKey: .id)
        title = try container.decodeIfPresent(String.self, forKey: .title) ?? ""
        audioUrl = try container.decodeIfPresent(String.self, forKey: .audioUrl) ?? ""
        coverUrl = try container.decodeIfPresent(String.self, forKey: .coverUrl)
        durationSec = try container.decodeIfPresent(Int.self, forKey: .durationSec)
        genre = try container.decodeIfPresent(String.self, forKey: .genre)
        explicit = try container.decodeIfPresent(Bool.self, forKey: .explicit) ?? false
        playCount = try container.decodeIfPresent(Int.self, forKey: .playCount) ?? 0
        artist = try container.decodeIfPresent(MusicArtistRef.self, forKey: .artist)
        album = try container.decodeIfPresent(MusicAlbumRef.self, forKey: .album)
        liked = try container.decodeIfPresent(Bool.self, forKey: .liked)
    }

    /// The cover to show: the track's own, falling back to its album's -
    /// tracks in an album commonly carry no cover of their own.
    var artworkURL: String? {
        if let coverUrl, !coverUrl.isEmpty { return coverUrl }
        return album?.coverUrl
    }

    var artistName: String { artist?.displayName ?? "" }

    /// Whether this track can actually be played. A row with no
    /// `audioUrl` is not playable, and the UI must not offer it as if it
    /// were.
    var isPlayable: Bool { !audioUrl.isEmpty && URL(string: audioUrl) != nil }
}

struct MusicArtistRef: Decodable, Identifiable, Equatable, Hashable {
    let id: String
    let displayName: String
    let avatarUrl: String?
    let verified: Bool?

    private enum CodingKeys: String, CodingKey {
        case id, displayName, avatarUrl, verified
    }

    init(from decoder: Decoder) throws {
        let container = try decoder.container(keyedBy: CodingKeys.self)
        id = try container.decode(String.self, forKey: .id)
        displayName = try container.decodeIfPresent(String.self, forKey: .displayName) ?? ""
        avatarUrl = try container.decodeIfPresent(String.self, forKey: .avatarUrl)
        verified = try container.decodeIfPresent(Bool.self, forKey: .verified)
    }
}

struct MusicAlbumRef: Decodable, Identifiable, Equatable, Hashable {
    let id: String
    let title: String
    let coverUrl: String?

    private enum CodingKeys: String, CodingKey {
        case id, title, coverUrl
    }

    init(from decoder: Decoder) throws {
        let container = try decoder.container(keyedBy: CodingKeys.self)
        id = try container.decode(String.self, forKey: .id)
        title = try container.decodeIfPresent(String.self, forKey: .title) ?? ""
        coverUrl = try container.decodeIfPresent(String.self, forKey: .coverUrl)
    }
}

/// An album in a list, with its artist and track count.
struct MusicAlbum: Decodable, Identifiable, Equatable {
    let id: String
    let title: String
    let coverUrl: String?
    let releaseDate: Date?
    let artist: MusicArtistRef?
    let counts: MusicAlbumCounts?

    private enum CodingKeys: String, CodingKey {
        case id, title, coverUrl, releaseDate, artist
        case counts = "_count"
    }
}

struct MusicAlbumCounts: Decodable, Equatable {
    let tracks: Int

    init(from decoder: Decoder) throws {
        let container = try decoder.container(keyedBy: CodingKeys.self)
        tracks = try container.decodeIfPresent(Int.self, forKey: .tracks) ?? 0
    }

    private enum CodingKeys: String, CodingKey { case tracks }
}

/// An artist in a list.
struct MusicArtist: Decodable, Identifiable, Equatable {
    let id: String
    let displayName: String
    let bio: String?
    let avatarUrl: String?
    let bannerUrl: String?
    let verified: Bool
    let counts: MusicArtistCounts?

    private enum CodingKeys: String, CodingKey {
        case id, displayName, bio, avatarUrl, bannerUrl, verified
        case counts = "_count"
    }

    init(from decoder: Decoder) throws {
        let container = try decoder.container(keyedBy: CodingKeys.self)
        id = try container.decode(String.self, forKey: .id)
        displayName = try container.decodeIfPresent(String.self, forKey: .displayName) ?? ""
        bio = try container.decodeIfPresent(String.self, forKey: .bio)
        avatarUrl = try container.decodeIfPresent(String.self, forKey: .avatarUrl)
        bannerUrl = try container.decodeIfPresent(String.self, forKey: .bannerUrl)
        verified = try container.decodeIfPresent(Bool.self, forKey: .verified) ?? false
        counts = try container.decodeIfPresent(MusicArtistCounts.self, forKey: .counts)
    }
}

struct MusicArtistCounts: Decodable, Equatable {
    let tracks: Int
    let followers: Int

    init(from decoder: Decoder) throws {
        let container = try decoder.container(keyedBy: CodingKeys.self)
        tracks = try container.decodeIfPresent(Int.self, forKey: .tracks) ?? 0
        followers = try container.decodeIfPresent(Int.self, forKey: .followers) ?? 0
    }

    private enum CodingKeys: String, CodingKey { case tracks, followers }
}

struct MusicPlaylist: Decodable, Identifiable, Equatable {
    let id: String
    let name: String
    let description: String?
    let coverUrl: String?
    let isPublic: Bool?
}

/// A genre and how many tracks carry it.
struct MusicGenre: Decodable, Identifiable, Equatable {
    let genre: String
    let count: Int

    var id: String { genre }
}

/// `GET /api/music/home` - eight independent sections in one response.
struct MusicHome: Decodable, Equatable {
    let trending: [MusicTrack]
    let newReleases: [MusicTrack]
    let latestAlbums: [MusicAlbum]
    let popularArtists: [MusicArtist]
    let genres: [MusicGenre]
    let recentlyPlayed: [MusicTrack]
    let likedPreview: [MusicTrack]
    let yourPlaylists: [MusicPlaylist]

    init(from decoder: Decoder) throws {
        let container = try decoder.container(keyedBy: CodingKeys.self)
        trending = try container.decodeIfPresent([MusicTrack].self, forKey: .trending) ?? []
        newReleases = try container.decodeIfPresent([MusicTrack].self, forKey: .newReleases) ?? []
        latestAlbums = try container.decodeIfPresent([MusicAlbum].self, forKey: .latestAlbums) ?? []
        popularArtists = try container.decodeIfPresent([MusicArtist].self, forKey: .popularArtists) ?? []
        genres = try container.decodeIfPresent([MusicGenre].self, forKey: .genres) ?? []
        recentlyPlayed = try container.decodeIfPresent([MusicTrack].self, forKey: .recentlyPlayed) ?? []
        likedPreview = try container.decodeIfPresent([MusicTrack].self, forKey: .likedPreview) ?? []
        yourPlaylists = try container.decodeIfPresent([MusicPlaylist].self, forKey: .yourPlaylists) ?? []
    }

    private enum CodingKeys: String, CodingKey {
        case trending, newReleases, latestAlbums, popularArtists
        case genres, recentlyPlayed, likedPreview, yourPlaylists
    }

    var isEmpty: Bool {
        trending.isEmpty && newReleases.isEmpty && latestAlbums.isEmpty
            && popularArtists.isEmpty && recentlyPlayed.isEmpty
            && likedPreview.isEmpty && yourPlaylists.isEmpty
    }
}

/// `POST /api/music/tracks/like` -> `{liked}`.
struct MusicLikeResponse: Decodable {
    let liked: Bool
}

/// `POST /api/music/tracks/play` -> the updated track's id, play count
/// and duration.
struct MusicPlayResponse: Decodable {
    let id: String
    let playCount: Int?
    let durationSec: Int?
}

// MARK: - Library

/// `GET /api/music/library` -> `{likes, history, artistFollows}`.
///
/// The one music route that uses an envelope; the list routes
/// (`/genres`, `/artists`, `/albums`, `/playlists`) all return bare
/// arrays. Note the tracks are nested inside join rows rather than
/// returned directly - a like is a `MusicLike` row *containing* a track,
/// not a track.
struct MusicLibrary: Decodable, Equatable {
    let likes: [MusicLikeRow]
    let history: [MusicHistoryRow]
    let artistFollows: [MusicFollowRow]

    init(from decoder: Decoder) throws {
        let container = try decoder.container(keyedBy: CodingKeys.self)
        likes = try container.decodeIfPresent([MusicLikeRow].self, forKey: .likes) ?? []
        history = try container.decodeIfPresent([MusicHistoryRow].self, forKey: .history) ?? []
        artistFollows = try container.decodeIfPresent([MusicFollowRow].self, forKey: .artistFollows) ?? []
    }

    private enum CodingKeys: String, CodingKey {
        case likes, history, artistFollows
    }

    /// Every liked track. Each is liked by definition - the rows come
    /// from the viewer's own likes - so `liked` is not read from the
    /// track, which does not carry it here.
    var likedTracks: [MusicTrack] { likes.map(\.track) }

    /// Recently played, most recent first and de-duplicated.
    ///
    /// `history` is every play *event*, capped at 100, so one track
    /// played repeatedly would otherwise fill the whole list. The home
    /// route applies the same de-duplication server-side; this route does
    /// not, so it is applied here.
    var recentlyPlayedTracks: [MusicTrack] {
        var seen = Set<String>()
        var result: [MusicTrack] = []
        for row in history where !seen.contains(row.track.id) {
            seen.insert(row.track.id)
            result.append(row.track)
        }
        return result
    }
}

struct MusicLikeRow: Decodable, Identifiable, Equatable {
    let id: String
    let track: MusicTrack
}

struct MusicHistoryRow: Decodable, Identifiable, Equatable {
    let id: String
    let track: MusicTrack
}

struct MusicFollowRow: Decodable, Identifiable, Equatable {
    let id: String
    let artist: MusicArtist
}

// MARK: - Detail responses

/// `GET /api/music/artists/{id}` - the artist plus its albums, tracks
/// and the viewer's own follow state, all in one object.
struct MusicArtistDetail: Decodable, Equatable {
    let id: String
    let displayName: String
    let bio: String?
    let avatarUrl: String?
    let bannerUrl: String?
    let verified: Bool
    let isFollowing: Bool
    let isOwner: Bool
    let albums: [MusicAlbum]
    let tracks: [MusicTrack]

    init(from decoder: Decoder) throws {
        let container = try decoder.container(keyedBy: CodingKeys.self)
        id = try container.decode(String.self, forKey: .id)
        displayName = try container.decodeIfPresent(String.self, forKey: .displayName) ?? ""
        bio = try container.decodeIfPresent(String.self, forKey: .bio)
        avatarUrl = try container.decodeIfPresent(String.self, forKey: .avatarUrl)
        bannerUrl = try container.decodeIfPresent(String.self, forKey: .bannerUrl)
        verified = try container.decodeIfPresent(Bool.self, forKey: .verified) ?? false
        isFollowing = try container.decodeIfPresent(Bool.self, forKey: .isFollowing) ?? false
        isOwner = try container.decodeIfPresent(Bool.self, forKey: .isOwner) ?? false
        albums = try container.decodeIfPresent([MusicAlbum].self, forKey: .albums) ?? []
        tracks = try container.decodeIfPresent([MusicTrack].self, forKey: .tracks) ?? []
    }

    private enum CodingKeys: String, CodingKey {
        case id, displayName, bio, avatarUrl, bannerUrl, verified
        case isFollowing, isOwner, albums, tracks
    }
}

/// `GET /api/music/albums/{id}` - the album with its tracks.
struct MusicAlbumDetail: Decodable, Equatable {
    let id: String
    let title: String
    let description: String?
    let coverUrl: String?
    let releaseDate: Date?
    let artist: MusicArtistRef?
    let tracks: [MusicTrack]

    init(from decoder: Decoder) throws {
        let container = try decoder.container(keyedBy: CodingKeys.self)
        id = try container.decode(String.self, forKey: .id)
        title = try container.decodeIfPresent(String.self, forKey: .title) ?? ""
        description = try container.decodeIfPresent(String.self, forKey: .description)
        coverUrl = try container.decodeIfPresent(String.self, forKey: .coverUrl)
        releaseDate = try container.decodeIfPresent(Date.self, forKey: .releaseDate)
        artist = try container.decodeIfPresent(MusicArtistRef.self, forKey: .artist)
        tracks = try container.decodeIfPresent([MusicTrack].self, forKey: .tracks) ?? []
    }

    private enum CodingKeys: String, CodingKey {
        case id, title, description, coverUrl, releaseDate, artist, tracks
    }
}

/// `GET /api/music/playlists/{id}` - the playlist plus ordered entries.
///
/// Tracks are nested inside `MusicPlaylistTrack` join rows carrying their
/// own position, already ordered by the route.
struct MusicPlaylistDetail: Decodable, Equatable {
    let id: String
    let name: String
    let description: String?
    let coverUrl: String?
    let isOwner: Bool
    let entries: [MusicPlaylistEntry]

    var tracks: [MusicTrack] { entries.map(\.track) }

    init(from decoder: Decoder) throws {
        let container = try decoder.container(keyedBy: CodingKeys.self)
        id = try container.decode(String.self, forKey: .id)
        name = try container.decodeIfPresent(String.self, forKey: .name) ?? ""
        description = try container.decodeIfPresent(String.self, forKey: .description)
        coverUrl = try container.decodeIfPresent(String.self, forKey: .coverUrl)
        isOwner = try container.decodeIfPresent(Bool.self, forKey: .isOwner) ?? false
        entries = try container.decodeIfPresent([MusicPlaylistEntry].self, forKey: .entries) ?? []
    }

    private enum CodingKeys: String, CodingKey {
        case id, name, description, coverUrl, isOwner
        // The route names this `tracks`, but each element is a join row
        // rather than a track - mapping it to `entries` keeps that
        // distinction visible at every use site.
        case entries = "tracks"
    }
}

struct MusicPlaylistEntry: Decodable, Identifiable, Equatable {
    let id: String
    let position: Int
    let track: MusicTrack

    init(from decoder: Decoder) throws {
        let container = try decoder.container(keyedBy: CodingKeys.self)
        id = try container.decode(String.self, forKey: .id)
        position = try container.decodeIfPresent(Int.self, forKey: .position) ?? 0
        track = try container.decode(MusicTrack.self, forKey: .track)
    }

    private enum CodingKeys: String, CodingKey {
        case id, position, track
    }
}
