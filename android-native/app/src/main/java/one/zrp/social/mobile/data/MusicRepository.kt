package one.zrp.social.mobile.data

import one.zrp.social.mobile.network.ApiClient
import one.zrp.social.mobile.network.MusicAlbumDetail
import one.zrp.social.mobile.network.MusicAlbumSummary
import one.zrp.social.mobile.network.MusicArtistDetail
import one.zrp.social.mobile.network.MusicArtistListItem
import one.zrp.social.mobile.network.MusicHomeResponse
import one.zrp.social.mobile.network.MusicLikeRequest
import one.zrp.social.mobile.network.MusicLikeResponse
import one.zrp.social.mobile.network.RecordPlayRequest

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
}
