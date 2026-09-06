package one.zrp.social.mobile.network

import retrofit2.http.Body
import retrofit2.http.GET
import retrofit2.http.POST
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

/**
 * The same real threaded-comment system the website's post detail view
 * uses - GET /posts/{id}/comments (top-level page + their full reply
 * subtrees) and POST to add a new one. No separate native comment
 * store, no invented reply UI beyond what the backend already returns.
 */
interface CommentsApi {
    @GET("posts/{id}/comments")
    suspend fun getComments(@Path("id") postId: String, @Query("cursor") cursor: String?): CommentsPage

    @POST("posts/{id}/comments")
    suspend fun createComment(@Path("id") postId: String, @Body request: CreateCommentRequest): Comment
}
