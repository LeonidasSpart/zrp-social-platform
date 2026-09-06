package one.zrp.social.mobile.network

import retrofit2.http.Body
import retrofit2.http.GET
import retrofit2.http.POST

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
