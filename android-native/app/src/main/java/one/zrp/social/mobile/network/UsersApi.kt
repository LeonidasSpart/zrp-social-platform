package one.zrp.social.mobile.network

import retrofit2.http.GET
import retrofit2.http.POST
import retrofit2.http.Path
import retrofit2.http.Query

data class CreatorProfileInfo(val tipsEnabled: Boolean)

data class ProfileCounts(
    val posts: Int = 0,
    val followers: Int = 0,
    val following: Int = 0,
)

data class UserProfile(
    val id: String,
    val username: String,
    val customUrl: String?,
    val name: String?,
    val bio: String?,
    val avatarUrl: String?,
    val coverUrl: String?,
    val location: String?,
    val country: String?,
    val website: String?,
    val createdAt: String,
    val isPrivate: Boolean,
    val badgeType: String?,
    val pinnedPostId: String?,
    val banned: Boolean,
    val publicLikes: Boolean,
    val publicFollowing: Boolean,
    val solanaWallet: String?,
    val category: String?,
    val showCategory: Boolean,
    val creatorProfile: CreatorProfileInfo?,
    val _count: ProfileCounts,
    val isFollowing: Boolean,
    val isBlocked: Boolean,
)

data class FollowToggleResponse(
    val following: Boolean,
    val requested: Boolean,
    val message: String? = null,
)

/**
 * The same profile endpoints the website itself uses - GET
 * /users/{username} for the profile header/stats, GET
 * /users/{username}/posts for their real posts (reusing PostsApi's
 * Post/PostsPage models rather than a second copy), and the same
 * follow toggle. No profile data is invented natively.
 */
interface UsersApi {
    @GET("users/{username}")
    suspend fun getProfile(@Path("username") username: String): UserProfile

    @GET("users/{username}/posts")
    suspend fun getUserPosts(
        @Path("username") username: String,
        @Query("cursor") cursor: String?,
    ): PostsPage

    @POST("users/{username}/follow")
    suspend fun toggleFollow(@Path("username") username: String): FollowToggleResponse
}
