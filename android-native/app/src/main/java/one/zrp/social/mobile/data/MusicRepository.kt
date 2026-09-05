package one.zrp.social.mobile.data

import one.zrp.social.mobile.network.ApiClient
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
}
