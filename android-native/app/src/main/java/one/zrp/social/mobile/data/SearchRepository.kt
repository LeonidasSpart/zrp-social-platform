package one.zrp.social.mobile.data

import one.zrp.social.mobile.network.ApiClient
import one.zrp.social.mobile.network.LikeResponse
import one.zrp.social.mobile.network.SearchResults
import one.zrp.social.mobile.network.SearchUser
import one.zrp.social.mobile.network.TrendingHashtag

class SearchRepository {
    suspend fun search(query: String): Result<SearchResults> = runCatching {
        ApiClient.searchApi.search(query)
    }

    suspend fun getSuggestedUsers(): Result<List<SearchUser>> = runCatching {
        ApiClient.searchApi.getSuggestedUsers()
    }

    suspend fun getTrendingHashtags(): Result<List<TrendingHashtag>> = runCatching {
        ApiClient.searchApi.getTrendingHashtags()
    }

    suspend fun toggleLike(postId: String): Result<LikeResponse> = runCatching {
        ApiClient.postsApi.toggleLike(postId)
    }
}
