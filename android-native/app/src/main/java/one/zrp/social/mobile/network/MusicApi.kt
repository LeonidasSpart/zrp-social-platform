package one.zrp.social.mobile.network

import retrofit2.http.Body
import retrofit2.http.GET
import retrofit2.http.POST

data class MusicArtistRef(
    val id: String,
    val displayName: String,
    val avatarUrl: String?,
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

/**
 * The same real ZRP Music catalogue the website's Music home page
 * uses. GET /music/home returns far more than this model captures
 * (latestAlbums, popularArtists, genres, yourPlaylists too) - this
 * phase's native screen only covers browsing + playing + liking real
 * tracks, so only the track-shaped sections are mapped here; Gson
 * simply ignores the rest of the real response rather than this
 * inventing or dropping any of it server-side. Track publishing
 * (the Music Studio / artist upload flow) goes through the same
 * UploadThing presigned-upload path as post/story media, so it has
 * the same native-upload scope decision as PostsApi.createPost.
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
)
