package one.zrp.social.mobile.data

import one.zrp.social.mobile.network.ApiClient
import one.zrp.social.mobile.network.LikeResponse
import one.zrp.social.mobile.network.PostsPage

/**
 * Thin wrapper around PostsApi for the Home screen's two real feed
 * tabs and the like toggle. No caching or ranking logic lives here -
 * the backend (the same explore/following endpoints the website
 * itself uses) already owns that.
 */
class PostsRepository {
    suspend fun getForYouFeed(cursor: String?): Result<PostsPage> = runCatching {
        ApiClient.postsApi.getForYouFeed(cursor)
    }

    suspend fun getFollowingFeed(cursor: String?): Result<PostsPage> = runCatching {
        ApiClient.postsApi.getFollowingFeed(cursor = cursor)
    }

    suspend fun toggleLike(postId: String): Result<LikeResponse> = runCatching {
        ApiClient.postsApi.toggleLike(postId)
    }
}
