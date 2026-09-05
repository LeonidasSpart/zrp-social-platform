package one.zrp.social.mobile.data

import one.zrp.social.mobile.network.ApiClient
import one.zrp.social.mobile.network.CreatePostRequest
import one.zrp.social.mobile.network.LikeResponse
import one.zrp.social.mobile.network.Post
import one.zrp.social.mobile.network.PostsPage
import one.zrp.social.mobile.network.zrpErrorMessage
import retrofit2.HttpException

/**
 * Thin wrapper around PostsApi for the Home screen's two real feed
 * tabs, the like toggle, and post creation. No caching, ranking, or
 * length/limit logic lives here - the backend (the same explore/
 * following/posts endpoints the website itself uses) already owns
 * that.
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

    suspend fun createPost(content: String): Result<Post> {
        return try {
            Result.success(ApiClient.postsApi.createPost(CreatePostRequest(content)).post)
        } catch (e: HttpException) {
            Result.failure(Exception(e.zrpErrorMessage() ?: "Couldn't create this post. Please try again."))
        } catch (e: Exception) {
            Result.failure(Exception("Couldn't reach ZRP. Check your connection and try again."))
        }
    }
}
