package one.zrp.social.mobile.network

import retrofit2.http.GET
import retrofit2.http.Query

/**
 * GET /bookmarks returns a single merged timeline of two independent
 * kinds of bookmark - a saved post and a saved comment (see
 * src/lib/bookmarks.ts's BookmarkItem union) - distinguished by `type`,
 * with exactly one of `post`/`comment` populated per item. The native
 * Bookmarks screen only has a real comment-viewing surface for a
 * comment reached through its parent post, not a standalone comment
 * screen, so it renders `type == "post"` items as real PostCards and
 * leaves comment bookmarks for a later, dedicated pass rather than
 * inventing a screen for them here.
 */
data class BookmarkItem(
    val type: String,
    val id: String,
    val post: Post?,
    val comment: Comment?,
)

data class BookmarksPage(
    val items: List<BookmarkItem>,
    val nextCursor: String?,
)

interface BookmarksApi {
    @GET("bookmarks")
    suspend fun getBookmarks(@Query("cursor") cursor: String?): BookmarksPage
}
