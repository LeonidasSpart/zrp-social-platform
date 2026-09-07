package one.zrp.social.mobile.network

import retrofit2.http.Body
import retrofit2.http.GET
import retrofit2.http.POST
import retrofit2.http.Path
import retrofit2.http.Query

data class MusicArtistRef(
    val id: String,
    val displayName: String,
    val avatarUrl: String?,
    // The website (music/artists/page.tsx, music/artists/[id]/page.tsx)
    // shows a ShieldCheck next to a verified artist's name - a real
    // MusicArtist.verified column, entirely separate from a person's
    // own User.badgeType. GET /music/home's track objects already
    // include the artist's full row (Prisma include, not select), so
    // this field is already present on the wire; it just wasn't mapped
    // here yet.
    val verified: Boolean = false,
)

data class MusicAlbumRef(
    val id: String,
    val title: String,
    val coverUrl: String?,
)

data class MusicTrack(
    val id: String,
    val title: String,
    val audioUrl: String,
    val coverUrl: String?,
    val genre: String?,
    val durationSec: Int?,
    val playCount: Int = 0,
    val artist: MusicArtistRef,
    val album: MusicAlbumRef?,
    val liked: Boolean = false,
)

data class RecordPlayRequest(
    val trackId: String,
    val secondsPlayed: Int,
    val completed: Boolean,
)

data class MusicLikeRequest(val trackId: String)

data class MusicLikeResponse(val liked: Boolean)

data class MusicAlbumSummary(
    val id: String,
    val title: String,
    val coverUrl: String?,
    val artist: MusicArtistRef,
    // Prisma-computed via attachAlbumDurations() (sums PUBLISHED
    // tracks' durationSec in one batched groupBy) - 0 for an album with
    // no timed tracks yet, not a missing/unknown value.
    val totalDurationSec: Int = 0,
)

data class MusicArtistSummary(
    val id: String,
    val displayName: String,
    val avatarUrl: String?,
    val verified: Boolean = false,
)

data class MusicPlaylistTrackPreview(val track: MusicTrack)

data class MusicPlaylistSummary(
    val id: String,
    val name: String,
    val coverUrl: String?,
    // Only ever needs tracks[0] (the website's own playlist-cover
    // fallback chain: playlist.coverUrl, else its first track's own
    // cover, else its first track's album cover) - the full nested
    // MusicTrack per entry is still mapped as-is rather than a
    // purpose-built lighter shape, since it's the same real response
    // the playlist detail screen (a later phase) also consumes.
    val tracks: List<MusicPlaylistTrackPreview> = emptyList(),
)

data class MusicGenre(val genre: String, val count: Int)

data class MusicCount(val tracks: Int = 0, val followers: Int = 0)

data class MusicTrackCount(val tracks: Int = 0)

// ─── Artists list (GET /music/artists) ──────────────────────────────
data class MusicArtistListItem(
    val id: String,
    val displayName: String,
    val avatarUrl: String?,
    val verified: Boolean = false,
    val _count: MusicCount = MusicCount(),
)

// ─── Artist detail (GET /music/artists/{id}) ────────────────────────
// A distinct, richer album shape from MusicAlbumSummary's own (no
// nested `artist` here - it's redundant, we're already on that
// artist's own page - but a real, separate _count.tracks the home
// response's album shape doesn't carry).
data class MusicArtistAlbumRef(
    val id: String,
    val title: String,
    val coverUrl: String?,
    val releaseDate: String?,
    val totalDurationSec: Int = 0,
    val _count: MusicTrackCount = MusicTrackCount(),
)

data class MusicArtistDetail(
    val id: String,
    val displayName: String,
    val bio: String?,
    val avatarUrl: String?,
    val bannerUrl: String?,
    val verified: Boolean = false,
    val isFollowing: Boolean = false,
    // Owner-only affordances (Edit Profile, per-track delete, the
    // Studio deep links) aren't rendered yet - Music Studio doesn't
    // exist natively yet (a later phase), so every visitor sees this
    // screen in its real read-only "visitor" mode regardless of
    // isOwner, rather than a broken owner affordance that goes nowhere.
    val isOwner: Boolean = false,
    val albums: List<MusicArtistAlbumRef> = emptyList(),
    val tracks: List<MusicTrack> = emptyList(),
    val _count: MusicCount = MusicCount(),
)

data class MusicFollowToggleResponse(val following: Boolean)

// ─── Album detail (GET /music/albums/{id}) ──────────────────────────
data class MusicAlbumDetail(
    val id: String,
    val title: String,
    val description: String?,
    val coverUrl: String?,
    val releaseDate: String?,
    val artist: MusicArtistRef,
    val tracks: List<MusicTrack> = emptyList(),
)

/**
 * The same real ZRP Music catalogue the website's Music home page
 * uses. Artist/album/playlist detail, Discover, History, Liked and
 * Music Studio each have their own real routes beyond GET /music/home -
 * added screen by screen in later phases rather than all at once, so
 * every home-screen link (Popular Artists, Latest Albums, Your
 * Playlists, the quick-nav tiles) only appears once its real
 * destination screen exists natively. Track publishing (the Music
 * Studio / artist upload flow) goes through the same UploadThing
 * presigned-upload path as post/story media, so it has the same
 * native-upload scope decision as PostsApi.createPost.
 */
interface MusicApi {
    @GET("music/home")
    suspend fun getHome(): MusicHomeResponse

    @POST("music/tracks/play")
    suspend fun recordPlay(@Body request: RecordPlayRequest)

    @POST("music/tracks/like")
    suspend fun toggleLike(@Body request: MusicLikeRequest): MusicLikeResponse

    @GET("music/artists")
    suspend fun getArtists(@Query("q") query: String? = null): List<MusicArtistListItem>

    @GET("music/artists/{id}")
    suspend fun getArtistDetail(@Path("id") id: String): MusicArtistDetail

    @POST("music/artists/{id}/follow")
    suspend fun toggleArtistFollow(@Path("id") id: String): MusicFollowToggleResponse

    @GET("music/albums/{id}")
    suspend fun getAlbumDetail(@Path("id") id: String): MusicAlbumDetail
}

data class MusicHomeResponse(
    val trending: List<MusicTrack> = emptyList(),
    val newReleases: List<MusicTrack> = emptyList(),
    val recentlyPlayed: List<MusicTrack> = emptyList(),
    val likedPreview: List<MusicTrack> = emptyList(),
    val latestAlbums: List<MusicAlbumSummary> = emptyList(),
    val popularArtists: List<MusicArtistSummary> = emptyList(),
    val genres: List<MusicGenre> = emptyList(),
    val yourPlaylists: List<MusicPlaylistSummary> = emptyList(),
)
