package one.zrp.social.mobile.network

import retrofit2.http.Body
import retrofit2.http.GET
import retrofit2.http.POST
import retrofit2.http.Path
import retrofit2.http.Query

data class PostAuthor(
    val id: String,
    val username: String,
    val name: String?,
    val avatarUrl: String?,
    val badgeType: String?,
)

data class PostCounts(
    val likes: Int = 0,
    val comments: Int = 0,
    val reposts: Int = 0,
    // Only present in the explore ("For You") response, not the
    // following-tab response - see PostsApi's KDoc. Nullable rather
    // than defaulted: Gson's reflection-based deserialization doesn't
    // apply Kotlin default parameter values for a JSON key that's
    // simply absent, only for a key present with a null value, so a
    // non-null default here would be misleading about what actually
    // happens when the following endpoint omits it.
    val quotedBy: Int? = null,
)

data class Post(
    val id: String,
    val content: String,
    val imageUrl: String?,
    val imageUrls: List<String>?,
    val mediaType: String?,
    val createdAt: String,
    val author: PostAuthor,
    val quotePost: Post?,
    val _count: PostCounts,
    val liked: Boolean?,
)

data class PostsPage(
    val posts: List<Post>,
    val nextCursor: String?,
)

data class LikeResponse(val liked: Boolean)

data class CreatePostRequest(val content: String)

data class CreatePostResponse(val post: Post)

/**
 * The two real Home feed streams the website itself uses - see
 * src/app/api/posts/explore/route.ts ("For You", engagement/age-ranked,
 * numeric-offset cursor) and src/app/api/posts/route.ts?tab=following
 * (real follow-graph filter, post-id cursor). Same backend, same
 * ranking, same real data - the native app does not re-implement
 * ranking logic or invent its own feed algorithm.
 */
interface PostsApi {
    @GET("posts/explore")
    suspend fun getForYouFeed(@Query("cursor") cursor: String?): PostsPage

    @GET("posts")
    suspend fun getFollowingFeed(
        @Query("tab") tab: String = "following",
        @Query("cursor") cursor: String?,
    ): PostsPage

    @POST("posts/{id}/like")
    suspend fun toggleLike(@Path("id") postId: String): LikeResponse

    // Text-only for now - the same JSON body shape POST /api/posts
    // accepts for content, just without imageUrl/imageUrls. Media
    // attachment goes through UploadThing on the website (a presigned-
    // upload SDK flow, not a plain REST call) and needs its own native
    // upload path; shipping real, working text posts now rather than
    // an untested native upload flow in the same change.
    @POST("posts")
    suspend fun createPost(@Body request: CreatePostRequest): CreatePostResponse
}
