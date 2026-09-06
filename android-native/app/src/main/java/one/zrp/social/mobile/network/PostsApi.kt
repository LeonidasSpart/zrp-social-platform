package one.zrp.social.mobile.network

import retrofit2.http.Body
import retrofit2.http.DELETE
import retrofit2.http.GET
import retrofit2.http.POST
import retrofit2.http.PUT
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
    // Unlike `liked`, none of the feed/profile list endpoints attach a
    // per-viewer repost flag to each post (checked against explore,
    // following, and profile posts routes) - only GET
    // /posts/{id}/repost does, and only for a single post. So this is
    // always null from a list response; PostCard/HomeViewModel treat it
    // as "reposted state unknown until you act on it here" rather than
    // pre-highlighting reposts the backend itself doesn't report yet.
    val reposted: Boolean? = null,
    // Same story as `reposted` above: no list/feed endpoint attaches a
    // per-viewer bookmark flag (only GET /bookmarks, which returns the
    // bookmarked posts themselves, not a flag on arbitrary posts), so
    // this is always null from a feed response and only becomes known
    // once toggled here or the post is viewed via the Bookmarks screen.
    val bookmarked: Boolean? = null,
)

data class PostsPage(
    val posts: List<Post>,
    val nextCursor: String?,
)

data class LikeResponse(val liked: Boolean)

data class RepostResponse(val reposted: Boolean)

data class BookmarkResponse(val bookmarked: Boolean)

data class PinToggleResponse(val pinned: Boolean)

data class ReactionUser(
    val id: String,
    val username: String,
    val name: String?,
    val avatarUrl: String?,
)

// The Reaction table's own unique constraint is [postId, userId, emoji]
// - a user really can hold more than one distinct emoji reaction on the
// same post server-side - but the website's own PostCard.tsx models
// "your reaction" as a single value (userReaction, picked via
// data.find(...) - the first match), never a set. PostCard mirrors that
// same single-value client treatment rather than inventing multi-select
// support the real UI doesn't actually have.
data class Reaction(
    val id: String,
    val emoji: String,
    val user: ReactionUser,
)

data class ReactionToggleRequest(val emoji: String)

data class ReactionToggleResponse(val reaction: Reaction?)

data class CreatePostRequest(val content: String, val quotePostId: String? = null)

data class UpdatePostRequest(val content: String)

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

    @POST("posts/{id}/repost")
    suspend fun toggleRepost(@Path("id") postId: String): RepostResponse

    @POST("posts/{id}/bookmark")
    suspend fun toggleBookmark(@Path("id") postId: String): BookmarkResponse

    // Pinning is single-slot per user (User.pinnedPostId), not a list -
    // toggling a post that's already pinned clears it, toggling any
    // other post replaces whatever was pinned before (see
    // src/app/api/posts/[id]/pin/route.ts). Same 403-for-non-author
    // enforcement as delete/edit, server-side.
    @POST("posts/{id}/pin")
    suspend fun togglePin(@Path("id") postId: String): PinToggleResponse

    // Bare JSON array, not {items: ...} - see src/app/api/posts/[id]/
    // reaction/route.ts's GET handler, which returns prisma.reaction.
    // findMany(...) directly.
    @GET("posts/{id}/reaction")
    suspend fun getReactions(@Path("id") postId: String): List<Reaction>

    @POST("posts/{id}/reaction")
    suspend fun toggleReaction(@Path("id") postId: String, @Body request: ReactionToggleRequest): ReactionToggleResponse

    // The website only lets a post's own author delete it - enforced
    // server-side (403 for anyone else), not just hidden client-side -
    // so this is safe to expose from any PostCard; the backend is the
    // real gate.
    @DELETE("posts/{id}")
    suspend fun deletePost(@Path("id") postId: String)

    // Text-only, matching the website's own EditPostModal exactly - it
    // never sends imageUrl either, and the backend only touches that
    // field when the request body explicitly includes it (see
    // src/app/api/posts/[id]/route.ts's "imageUrl" in body check), so
    // omitting it here is what keeps an edited post's existing image
    // intact rather than silently clearing it. Same 403-for-non-author
    // and plan-length-limit enforcement as delete/create - server-side,
    // not just hidden client-side. Returns the raw updated post object,
    // the same shape GET /posts/{id} returns (no {post: ...} envelope).
    // There is no "edited" indicator anywhere on the website (no
    // isEdited/editedAt field exists), so none is added here either.
    @PUT("posts/{id}")
    suspend fun updatePost(@Path("id") postId: String, @Body request: UpdatePostRequest): Post

    // Text-only for now - the same JSON body shape POST /api/posts
    // accepts for content, just without imageUrl/imageUrls. Media
    // attachment goes through UploadThing on the website (a presigned-
    // upload SDK flow, not a plain REST call) and needs its own native
    // upload path; shipping real, working text posts now rather than
    // an untested native upload flow in the same change.
    @POST("posts")
    suspend fun createPost(@Body request: CreatePostRequest): CreatePostResponse

    // Unlike createPost's {post: ...} envelope, GET /posts/{id} returns
    // the raw post object directly - the same real single-post fetch
    // the website's quote-post preview and post-detail page both use
    // (src/app/api/posts/[id]/route.ts), quotePost included one level
    // deep exactly like the list endpoints' own Post.quotePost field.
    @GET("posts/{id}")
    suspend fun getPost(@Path("id") postId: String): Post

    // {items, nextCursor}, the same shape FollowListPage already models
    // for users/{username}/followers|following - reused here rather
    // than duplicated, since GET /posts/{id}/reposts returns the exact
    // same real user fields (id/username/name/avatarUrl/badgeType/
    // isFollowing), just for "who reposted this post" instead of "who
    // follows this account".
    @GET("posts/{id}/reposts")
    suspend fun getReposts(
        @Path("id") postId: String,
        @Query("cursor") cursor: String?,
    ): FollowListPage

    // {items, nextCursor} of real Post objects (the quote posts
    // themselves) - the same envelope UserPostsPage already models for
    // GET /users/{username}/posts.
    @GET("posts/{id}/quotes")
    suspend fun getQuotes(
        @Path("id") postId: String,
        @Query("cursor") cursor: String?,
    ): UserPostsPage
}
