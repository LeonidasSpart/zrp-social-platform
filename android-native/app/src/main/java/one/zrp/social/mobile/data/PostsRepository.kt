package one.zrp.social.mobile.data

import one.zrp.social.mobile.network.ApiClient
import one.zrp.social.mobile.network.BookmarkResponse
import one.zrp.social.mobile.network.CreatePostRequest
import one.zrp.social.mobile.network.CreateReportRequest
import one.zrp.social.mobile.network.FollowListPage
import one.zrp.social.mobile.network.LikeResponse
import one.zrp.social.mobile.network.Post
import one.zrp.social.mobile.network.PostsPage
import one.zrp.social.mobile.network.RepostResponse
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
    suspend fun getOwnUserId(): Result<String?> = runCatching {
        ApiClient.authApi.getSession().user?.id
    }

    suspend fun getForYouFeed(cursor: String?): Result<PostsPage> = runCatching {
        ApiClient.postsApi.getForYouFeed(cursor)
    }

    suspend fun getFollowingFeed(cursor: String?): Result<PostsPage> = runCatching {
        ApiClient.postsApi.getFollowingFeed(cursor = cursor)
    }

    suspend fun toggleLike(postId: String): Result<LikeResponse> = runCatching {
        ApiClient.postsApi.toggleLike(postId)
    }

    suspend fun toggleRepost(postId: String): Result<RepostResponse> = runCatching {
        ApiClient.postsApi.toggleRepost(postId)
    }

    suspend fun toggleBookmark(postId: String): Result<BookmarkResponse> = runCatching {
        ApiClient.postsApi.toggleBookmark(postId)
    }

    suspend fun deletePost(postId: String): Result<Unit> = runCatching {
        ApiClient.postsApi.deletePost(postId)
    }

    suspend fun reportPost(postId: String, reason: String, details: String?): Result<Unit> {
        return try {
            ApiClient.reportsApi.createReport(CreateReportRequest(postId = postId, reason = reason, details = details))
            Result.success(Unit)
        } catch (e: HttpException) {
            Result.failure(Exception(e.zrpErrorMessage() ?: "Couldn't submit this report. Please try again."))
        } catch (e: Exception) {
            Result.failure(Exception("Couldn't reach ZRP. Check your connection and try again."))
        }
    }

    suspend fun createPost(content: String, quotePostId: String? = null): Result<Post> {
        return try {
            Result.success(ApiClient.postsApi.createPost(CreatePostRequest(content, quotePostId)).post)
        } catch (e: HttpException) {
            Result.failure(Exception(e.zrpErrorMessage() ?: "Couldn't create this post. Please try again."))
        } catch (e: Exception) {
            Result.failure(Exception("Couldn't reach ZRP. Check your connection and try again."))
        }
    }

    suspend fun getPost(postId: String): Result<Post> = runCatching {
        ApiClient.postsApi.getPost(postId)
    }

    suspend fun getReposts(postId: String, cursor: String?): Result<FollowListPage> = runCatching {
        ApiClient.postsApi.getReposts(postId, cursor)
    }

    suspend fun getQuotes(postId: String, cursor: String?): Result<PostsPage> = runCatching {
        val page = ApiClient.postsApi.getQuotes(postId, cursor)
        PostsPage(posts = page.items ?: emptyList(), nextCursor = page.nextCursor)
    }
}
