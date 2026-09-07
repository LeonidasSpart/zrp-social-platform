package one.zrp.social.mobile.data

import one.zrp.social.mobile.network.ApiClient
import one.zrp.social.mobile.network.CreatePlaylistRequest
import one.zrp.social.mobile.network.CreateTrackRequest
import one.zrp.social.mobile.network.MusicAccess
import one.zrp.social.mobile.network.MusicAlbumDetail
import one.zrp.social.mobile.network.MusicAlbumSummary
import one.zrp.social.mobile.network.MusicArtistDetail
import one.zrp.social.mobile.network.MusicArtistListItem
import one.zrp.social.mobile.network.MusicGenre
import one.zrp.social.mobile.network.MusicHomeResponse
import one.zrp.social.mobile.network.MusicLibraryResponse
import one.zrp.social.mobile.network.MusicLikeRequest
import one.zrp.social.mobile.network.MusicLikeResponse
import one.zrp.social.mobile.network.MusicPlaylistDetail
import one.zrp.social.mobile.network.MusicPlaylistListItem
import one.zrp.social.mobile.network.MusicTrack
import one.zrp.social.mobile.network.MyArtistProfile
import one.zrp.social.mobile.network.RecordPlayRequest
import one.zrp.social.mobile.network.ReorderPlaylistRequest
import one.zrp.social.mobile.network.SaveArtistProfileRequest
import one.zrp.social.mobile.network.ToggleTrackInPlaylistRequest
import one.zrp.social.mobile.network.UpdatePlaylistRequest
import one.zrp.social.mobile.network.UpdateTrackRequest

class MusicRepository {
    suspend fun getHome(): Result<MusicHomeResponse> = runCatching {
        ApiClient.musicApi.getHome()
    }

    suspend fun recordPlay(trackId: String, secondsPlayed: Int, completed: Boolean): Result<Unit> = runCatching {
        ApiClient.musicApi.recordPlay(RecordPlayRequest(trackId, secondsPlayed, completed))
    }

    suspend fun toggleLike(trackId: String): Result<MusicLikeResponse> = runCatching {
        ApiClient.musicApi.toggleLike(MusicLikeRequest(trackId))
    }

    suspend fun getArtists(query: String?): Result<List<MusicArtistListItem>> = runCatching {
        ApiClient.musicApi.getArtists(query?.trim()?.takeIf { it.isNotEmpty() })
    }

    suspend fun getArtistDetail(id: String): Result<MusicArtistDetail> = runCatching {
        ApiClient.musicApi.getArtistDetail(id)
    }

    suspend fun toggleArtistFollow(id: String): Result<Boolean> = runCatching {
        ApiClient.musicApi.toggleArtistFollow(id).following
    }

    suspend fun getAlbumDetail(id: String): Result<MusicAlbumDetail> = runCatching {
        ApiClient.musicApi.getAlbumDetail(id)
    }

    suspend fun getAlbums(query: String?): Result<List<MusicAlbumSummary>> = runCatching {
        ApiClient.musicApi.getAlbums(query?.trim()?.takeIf { it.isNotEmpty() })
    }

    suspend fun getPlaylists(): Result<List<MusicPlaylistListItem>> = runCatching {
        ApiClient.musicApi.getPlaylists()
    }

    suspend fun createPlaylist(name: String): Result<MusicPlaylistListItem> = runCatching {
        ApiClient.musicApi.createPlaylist(CreatePlaylistRequest(name.trim()))
    }

    suspend fun getPlaylistDetail(id: String): Result<MusicPlaylistDetail> = runCatching {
        ApiClient.musicApi.getPlaylistDetail(id)
    }

    suspend fun renamePlaylist(id: String, name: String): Result<MusicPlaylistDetail> = runCatching {
        ApiClient.musicApi.updatePlaylist(id, UpdatePlaylistRequest(name = name.trim()))
    }

    suspend fun deletePlaylist(id: String): Result<Unit> = runCatching {
        ApiClient.musicApi.deletePlaylist(id)
        Unit
    }

    // The real route toggles - only ever called here to remove a track
    // already known to be in the playlist (the playlist detail screen's
    // own remove button), so this always results in a removal in
    // practice, never an accidental add.
    suspend fun removeTrackFromPlaylist(playlistId: String, trackId: String): Result<Unit> = runCatching {
        ApiClient.musicApi.toggleTrackInPlaylist(playlistId, ToggleTrackInPlaylistRequest(trackId))
        Unit
    }

    suspend fun reorderPlaylist(id: String, orderedIds: List<String>): Result<Unit> = runCatching {
        ApiClient.musicApi.reorderPlaylist(id, ReorderPlaylistRequest(orderedIds))
    }

    suspend fun getGenres(): Result<List<MusicGenre>> = runCatching {
        ApiClient.musicApi.getGenres()
    }

    suspend fun searchTracks(query: String?): Result<List<MusicTrack>> = runCatching {
        ApiClient.musicApi.searchTracks(query?.trim()?.takeIf { it.isNotEmpty() })
    }

    suspend fun getLibrary(): Result<MusicLibraryResponse> = runCatching {
        ApiClient.musicApi.getLibrary()
    }

    suspend fun getAccess(): Result<MusicAccess> = runCatching {
        ApiClient.musicApi.getAccess()
    }

    suspend fun getMyArtistProfile(): Result<MyArtistProfile?> = runCatching {
        ApiClient.musicApi.getMyArtistProfile()
    }

    suspend fun saveArtistProfile(
        displayName: String?,
        bio: String?,
        avatarUrl: String?,
        bannerUrl: String?,
    ): Result<MyArtistProfile> = runCatching {
        ApiClient.musicApi.saveArtistProfile(SaveArtistProfileRequest(displayName, bio, avatarUrl, bannerUrl))
    }

    suspend fun getMyAlbums(): Result<List<MusicAlbumSummary>> = runCatching {
        ApiClient.musicApi.getMyAlbums()
    }

    suspend fun getMyTracks(): Result<List<MusicTrack>> = runCatching {
        ApiClient.musicApi.getMyTracks()
    }

    suspend fun createTrack(
        title: String,
        genre: String?,
        explicit: Boolean,
        audioUrl: String,
        audioKey: String?,
        coverUrl: String?,
        coverKey: String?,
        durationSec: Int?,
        artistId: String,
    ): Result<MusicTrack> = runCatching {
        ApiClient.musicApi.createTrack(
            CreateTrackRequest(
                title = title,
                genre = genre,
                explicit = explicit,
                audioUrl = audioUrl,
                audioKey = audioKey,
                coverUrl = coverUrl,
                coverKey = coverKey,
                durationSec = durationSec,
                artistId = artistId,
            ),
        )
    }

    suspend fun updateTrack(
        id: String,
        title: String?,
        description: String?,
        genre: String?,
        explicit: Boolean?,
        coverUrl: String?,
        coverKey: String?,
        albumId: String?,
    ): Result<MusicTrack> = runCatching {
        ApiClient.musicApi.updateTrack(
            id,
            UpdateTrackRequest(
                title = title,
                description = description,
                genre = genre,
                explicit = explicit,
                coverUrl = coverUrl,
                coverKey = coverKey,
                albumId = albumId,
            ),
        )
    }

    suspend fun deleteTrack(id: String): Result<Unit> = runCatching {
        ApiClient.musicApi.deleteTrack(id)
    }
}
