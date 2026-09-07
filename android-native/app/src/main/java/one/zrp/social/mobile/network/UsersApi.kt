package one.zrp.social.mobile.network

import retrofit2.http.Body
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
    val usernameChangedAt: String?,
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

data class BlockToggleResponse(val blocked: Boolean)

data class FollowListUser(
    val id: String,
    val username: String,
    val name: String?,
    val avatarUrl: String?,
    val bio: String?,
    val badgeType: String?,
    val isFollowing: Boolean,
)

data class FollowListPage(val items: List<FollowListUser>, val nextCursor: String?)

data class MuteToggleRequest(val userId: String)
data class MuteToggleResponse(val muted: Boolean)
data class MuteStatusResponse(val muted: Boolean)

data class ModerationCounts(val followers: Int = 0, val following: Int = 0)

// GET /users/blocked and GET /users/muted both respond with a bare
// JSON array (no {items: ...} envelope, and no pagination - see their
// route.ts files), the one real user-facing block/mute management
// surface each list backs (src/app/settings/blocked|muted/page.tsx).
data class BlockedUser(
    val id: String,
    val username: String,
    val name: String?,
    val avatarUrl: String?,
    val badgeType: String?,
    val bio: String?,
    val blockedAt: String,
    val _count: ModerationCounts,
)

data class MutedUser(
    val id: String,
    val username: String,
    val name: String?,
    val avatarUrl: String?,
    val badgeType: String?,
    val bio: String?,
    val mutedAt: String,
    val _count: ModerationCounts,
)

// GET /users/{username}/posts responds with {"items": [...], "nextCursor": ...}
// - a genuinely different envelope key from PostsApi's PostsPage
// ({"posts": [...]}), which the website's own profile page also
// specifically reads as `data.items` (see src/app/profile/[username]/
// page.tsx's fetchPosts). Reusing PostsPage here silently deserialized
// to a null `posts` list (Gson's reflection-based construction doesn't
// go through Kotlin's constructor, so it never enforced List<Post>'s
// non-null constraint), which crashed the very first time a screen
// tried to read it - the native Profile crash. A distinct response
// type for this endpoint's actual shape, mapped to PostsPage in
// ProfileRepository, keeps that mismatch from recurring.
data class UserPostsPage(val items: List<Post>?, val nextCursor: String?)

// GET /users/{username}/replies has its own distinct shape - a comment
// row, not a Post - matching the website's own separate `Reply`
// interface (page.tsx). replyTo mirrors the parent post's author using
// a smaller shape than ReplyAuthor since that's all the endpoint sends.
data class ReplyAuthor(
    val id: String,
    val username: String,
    val name: String?,
    val avatarUrl: String?,
    val badgeType: String?,
)

data class ReplyToAuthor(val username: String, val name: String?)

data class ReplyToInfo(val id: String, val content: String, val author: ReplyToAuthor)

data class UserReply(
    val id: String,
    val content: String,
    val imageUrl: String?,
    val createdAt: String,
    val author: ReplyAuthor,
    val postId: String,
    val replyTo: ReplyToInfo?,
)

data class UserRepliesPage(val items: List<UserReply>?, val nextCursor: String?)

// Mirrors PostsApi's own PostsPage - the repository-facing shape with a
// guaranteed non-null list, mapped from UserRepliesPage the same way
// getUserPosts maps UserPostsPage to PostsPage.
data class RepliesPage(val replies: List<UserReply>, val nextCursor: String?)

/**
 * The same profile endpoints the website itself uses - GET
 * /users/{username} for the profile header/stats, GET
 * /users/{username}/posts for their real posts (reusing PostsApi's
 * Post model, but NOT its PostsPage envelope - see UserPostsPage's
 * KDoc), the same follow toggle, and the profile page's other four
 * tabs (replies/media/likes/reposts), each backed by its own real
 * endpoint the same way. No profile data is invented natively.
 */
interface UsersApi {
    @GET("users/{username}")
    suspend fun getProfile(@Path("username") username: String): UserProfile

    @GET("users/{username}/posts")
    suspend fun getUserPosts(
        @Path("username") username: String,
        @Query("cursor") cursor: String?,
    ): UserPostsPage

    @GET("users/{username}/replies")
    suspend fun getUserReplies(
        @Path("username") username: String,
        @Query("cursor") cursor: String?,
    ): UserRepliesPage

    @GET("users/{username}/media")
    suspend fun getUserMedia(
        @Path("username") username: String,
        @Query("cursor") cursor: String?,
    ): UserPostsPage

    @GET("users/{username}/likes")
    suspend fun getUserLikes(
        @Path("username") username: String,
        @Query("cursor") cursor: String?,
    ): UserPostsPage

    @GET("users/{username}/reposts")
    suspend fun getUserReposts(
        @Path("username") username: String,
        @Query("cursor") cursor: String?,
    ): UserPostsPage

    @POST("users/{username}/follow")
    suspend fun toggleFollow(@Path("username") username: String): FollowToggleResponse

    @POST("users/{username}/block")
    suspend fun toggleBlock(@Path("username") username: String): BlockToggleResponse

    @GET("users/{username}/followers")
    suspend fun getFollowers(
        @Path("username") username: String,
        @Query("cursor") cursor: String?,
    ): FollowListPage

    @GET("users/{username}/following")
    suspend fun getFollowing(
        @Path("username") username: String,
        @Query("cursor") cursor: String?,
    ): FollowListPage

    @POST("users/mute")
    suspend fun toggleMute(@Body request: MuteToggleRequest): MuteToggleResponse

    @GET("users/mute")
    suspend fun getMuteStatus(@Query("userId") userId: String): MuteStatusResponse

    @GET("users/blocked")
    suspend fun getBlockedUsers(): List<BlockedUser>

    @GET("users/muted")
    suspend fun getMutedUsers(): List<MutedUser>
}
