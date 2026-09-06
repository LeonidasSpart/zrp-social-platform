package one.zrp.social.mobile.data

import one.zrp.social.mobile.network.ApiClient
import one.zrp.social.mobile.network.BlockToggleResponse
import one.zrp.social.mobile.network.BlockedUser
import one.zrp.social.mobile.network.BookmarkResponse
import one.zrp.social.mobile.network.CreateReportRequest
import one.zrp.social.mobile.network.FollowListPage
import one.zrp.social.mobile.network.FollowToggleResponse
import one.zrp.social.mobile.network.LikeResponse
import one.zrp.social.mobile.network.MuteToggleRequest
import one.zrp.social.mobile.network.MutedUser
import one.zrp.social.mobile.network.PostsPage
import one.zrp.social.mobile.network.Post
import one.zrp.social.mobile.network.RepostResponse
import one.zrp.social.mobile.network.UpdatePostRequest
import one.zrp.social.mobile.network.UserProfile
import one.zrp.social.mobile.network.zrpErrorMessage
import retrofit2.HttpException

/**
 * Thin wrapper around UsersApi (and the shared like toggle) for the
 * Profile screen - the signed-in user's own profile or someone else's,
 * both backed by the same real endpoints the website uses.
 */
class ProfileRepository {
    suspend fun getOwnUsername(): Result<String> = runCatching {
        val session = ApiClient.authApi.getSession()
        session.user?.username ?: throw IllegalStateException("Not signed in")
    }

    suspend fun getOwnUserId(): Result<String?> = runCatching {
        ApiClient.authApi.getSession().user?.id
    }

    suspend fun getFollowers(username: String, cursor: String?): Result<FollowListPage> = runCatching {
        ApiClient.usersApi.getFollowers(username, cursor)
    }

    suspend fun getFollowing(username: String, cursor: String?): Result<FollowListPage> = runCatching {
        ApiClient.usersApi.getFollowing(username, cursor)
    }

    suspend fun getProfile(username: String): Result<UserProfile> = runCatching {
        ApiClient.usersApi.getProfile(username)
    }

    suspend fun getUserPosts(username: String, cursor: String?): Result<PostsPage> = runCatching {
        val page = ApiClient.usersApi.getUserPosts(username, cursor)
        PostsPage(posts = page.items ?: emptyList(), nextCursor = page.nextCursor)
    }

    suspend fun toggleFollow(username: String): Result<FollowToggleResponse> = runCatching {
        ApiClient.usersApi.toggleFollow(username)
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

    suspend fun toggleBlock(username: String): Result<BlockToggleResponse> = runCatching {
        ApiClient.usersApi.toggleBlock(username)
    }

    suspend fun getMuteStatus(userId: String): Result<Boolean> = runCatching {
        ApiClient.usersApi.getMuteStatus(userId).muted
    }

    suspend fun toggleMute(userId: String): Result<Boolean> = runCatching {
        ApiClient.usersApi.toggleMute(MuteToggleRequest(userId)).muted
    }

    suspend fun getBlockedUsers(): Result<List<BlockedUser>> = runCatching {
        ApiClient.usersApi.getBlockedUsers()
    }

    suspend fun getMutedUsers(): Result<List<MutedUser>> = runCatching {
        ApiClient.usersApi.getMutedUsers()
    }

    suspend fun updatePost(postId: String, content: String): Result<Post> {
        return try {
            Result.success(ApiClient.postsApi.updatePost(postId, UpdatePostRequest(content)))
        } catch (e: HttpException) {
            Result.failure(Exception(e.zrpErrorMessage() ?: "Couldn't save this post. Please try again."))
        } catch (e: Exception) {
            Result.failure(Exception("Couldn't reach ZRP. Check your connection and try again."))
        }
    }
}
