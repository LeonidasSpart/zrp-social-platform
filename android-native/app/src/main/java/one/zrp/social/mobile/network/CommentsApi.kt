package one.zrp.social.mobile.network

import retrofit2.http.Body
import retrofit2.http.DELETE
import retrofit2.http.GET
import retrofit2.http.POST
import retrofit2.http.PUT
import retrofit2.http.Path
import retrofit2.http.Query

data class CommentCounts(
    val likes: Int = 0,
    val reposts: Int = 0,
    val bookmarks: Int = 0,
)

/**
 * A single comment (or reply). `replies` and the viewer-status flags
 * are only present on the GET /comments listing, not on the POST
 * create response (which returns the bare created row) - see
 * comments/route.ts's GET vs POST handlers - so all four are nullable
 * here rather than defaulted, the same Gson-reflection-safety reason
 * UserPostsPage exists: a default only applies when Kotlin's own
 * constructor runs, which Gson's reflective deserialization bypasses
 * entirely for a key that's simply absent from the JSON.
 */
data class Comment(
    val id: String,
    val content: String,
    val createdAt: String,
    val author: PostAuthor,
    val parentId: String?,
    val _count: CommentCounts,
    val liked: Boolean?,
    val reposted: Boolean?,
    val bookmarked: Boolean?,
    val replies: List<Comment>?,
)

data class CommentsPage(val comments: List<Comment>?, val nextCursor: String?)

data class CreateCommentRequest(val content: String, val parentId: String? = null)

data class UpdateCommentRequest(val content: String)

/**
 * The same real threaded-comment system the website's post detail view
 * uses - GET /posts/{id}/comments (top-level page + their full reply
 * subtrees), POST to add a new one (top-level or a reply, via
 * parentId), and the same real like/repost/bookmark/edit/delete actions
 * CommentItem.tsx exposes per comment. LikeResponse/RepostResponse/
 * BookmarkResponse are PostsApi's own types, reused as-is since
 * /comments/{id}/like|repost|bookmark return the exact same
 * {liked|reposted|bookmarked: boolean} shape as their post equivalents.
 */
interface CommentsApi {
    @GET("posts/{id}/comments")
    suspend fun getComments(@Path("id") postId: String, @Query("cursor") cursor: String?): CommentsPage

    @POST("posts/{id}/comments")
    suspend fun createComment(@Path("id") postId: String, @Body request: CreateCommentRequest): Comment

    @POST("comments/{id}/like")
    suspend fun toggleLike(@Path("id") commentId: String): LikeResponse

    @POST("comments/{id}/repost")
    suspend fun toggleRepost(@Path("id") commentId: String): RepostResponse

    @POST("comments/{id}/bookmark")
    suspend fun toggleBookmark(@Path("id") commentId: String): BookmarkResponse

    // Same author-only + plan-length-limit enforcement as post editing,
    // server-side (src/app/api/comments/[id]/route.ts's PUT handler).
    // Returns the raw updated comment (no envelope, no replies/liked/
    // reposted/bookmarked - the same PUT/GET asymmetry Post already has).
    @PUT("comments/{id}")
    suspend fun updateComment(@Path("id") commentId: String, @Body request: UpdateCommentRequest): Comment

    // Deleting a comment cascades to every reply beneath it server-side
    // (Comment's self-relation onDelete: Cascade) - the same real
    // behavior the website's own handleDelete triggers.
    @DELETE("comments/{id}")
    suspend fun deleteComment(@Path("id") commentId: String)
}
