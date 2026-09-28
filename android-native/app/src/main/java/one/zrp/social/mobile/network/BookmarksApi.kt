package one.zrp.social.mobile.network

import retrofit2.http.GET
import retrofit2.http.Query

/**
 * The post a bookmarked comment belongs to (src/lib/bookmarks.ts's
 * COMMENT_INCLUDE) - a narrower projection than the real [Post] used
 * elsewhere (no counts/poll/etc.), just enough to link back to the
 * post and show whose thread the comment replied in.
 */
data class BookmarkedCommentPostAuthor(
    val username: String,
    val name: String?,
)

data class BookmarkedCommentPost(
    val id: String,
    val authorId: String,
    val content: String,
    val author: BookmarkedCommentPostAuthor,
)

data class BookmarkedComment(
    val id: String,
    val content: String,
    val createdAt: String,
    val author: PostAuthor,
    val post: BookmarkedCommentPost,
)

/**
 * GET /bookmarks returns a single merged timeline of two independent
 * kinds of bookmark - a saved post and a saved comment (see
 * src/lib/bookmarks.ts's BookmarkItem union) - distinguished by `type`,
 * with exactly one of `post`/`comment` populated per item.
 */
data class BookmarkItem(
    val type: String,
    val id: String,
    val post: Post?,
    val comment: BookmarkedComment?,
)

data class BookmarksPage(
    val items: List<BookmarkItem>,
    val nextCursor: String?,
)

interface BookmarksApi {
    @GET("bookmarks")
    suspend fun getBookmarks(@Query("cursor") cursor: String?): BookmarksPage
}
