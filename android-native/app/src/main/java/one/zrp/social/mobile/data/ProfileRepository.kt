package one.zrp.social.mobile.data

import one.zrp.social.mobile.network.ApiClient
import one.zrp.social.mobile.network.FollowToggleResponse
import one.zrp.social.mobile.network.LikeResponse
import one.zrp.social.mobile.network.PostsPage
import one.zrp.social.mobile.network.UserProfile

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

    suspend fun getProfile(username: String): Result<UserProfile> = runCatching {
        ApiClient.usersApi.getProfile(username)
    }

    suspend fun getUserPosts(username: String, cursor: String?): Result<PostsPage> = runCatching {
        ApiClient.usersApi.getUserPosts(username, cursor)
    }

    suspend fun toggleFollow(username: String): Result<FollowToggleResponse> = runCatching {
        ApiClient.usersApi.toggleFollow(username)
    }

    suspend fun toggleLike(postId: String): Result<LikeResponse> = runCatching {
        ApiClient.postsApi.toggleLike(postId)
    }
}
