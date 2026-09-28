package one.zrp.social.mobile.data

import one.zrp.social.mobile.network.BookmarkItem
import one.zrp.social.mobile.network.BookmarkedComment
import one.zrp.social.mobile.network.BookmarkedCommentPost
import one.zrp.social.mobile.network.BookmarkedCommentPostAuthor
import one.zrp.social.mobile.network.Post
import one.zrp.social.mobile.network.PostAuthor
import one.zrp.social.mobile.network.PostCounts
import org.junit.Assert.assertEquals
import org.junit.Assert.assertTrue
import org.junit.Test

/**
 * Regression coverage for the "Bookmarks tab only ever showed saved
 * posts" gap: GET /bookmarks returns a merged union of saved posts AND
 * saved comments (src/lib/bookmarks.ts), but this app used to filter
 * every comment-type item out before it ever reached the screen.
 * mapBookmarkItemsToRows is what BookmarksRepository.getBookmarks now
 * uses to turn that raw union into typed, orderable rows.
 */
class BookmarksRepositoryTest {

    private fun post(id: String) = Post(
        id = id,
        content = "content-$id",
        imageUrl = null,
        imageUrls = null,
        mediaType = null,
        createdAt = "2026-01-01T00:00:00.000Z",
        author = PostAuthor(id = "author-$id", username = "user$id", name = null, avatarUrl = null, badgeType = null),
        quotePost = null,
        _count = PostCounts(),
        liked = null,
    )

    private fun comment(id: String) = BookmarkedComment(
        id = id,
        content = "comment-$id",
        createdAt = "2026-01-01T00:00:00.000Z",
        author = PostAuthor(id = "author-$id", username = "user$id", name = null, avatarUrl = null, badgeType = null),
        post = BookmarkedCommentPost(
            id = "post-for-$id",
            authorId = "post-author-$id",
            content = "parent post $id",
            author = BookmarkedCommentPostAuthor(username = "postauthor$id", name = null),
        ),
    )

    @Test
    fun `a post item becomes a PostRow marked as bookmarked`() {
        val items = listOf(BookmarkItem(type = "post", id = "b1", post = post("p1"), comment = null))

        val rows = mapBookmarkItemsToRows(items)

        assertEquals(1, rows.size)
        val row = rows[0] as BookmarkRow.PostRow
        assertEquals("p1", row.post.id)
        assertTrue(row.post.bookmarked == true)
    }

    @Test
    fun `a comment item becomes a CommentRow`() {
        val items = listOf(BookmarkItem(type = "comment", id = "b2", post = null, comment = comment("c1")))

        val rows = mapBookmarkItemsToRows(items)

        assertEquals(1, rows.size)
        assertEquals("c1", (rows[0] as BookmarkRow.CommentRow).comment.id)
    }

    @Test
    fun `posts and comments preserve the server's own interleaved order`() {
        val items = listOf(
            BookmarkItem(type = "post", id = "b1", post = post("p1"), comment = null),
            BookmarkItem(type = "comment", id = "b2", post = null, comment = comment("c1")),
            BookmarkItem(type = "post", id = "b3", post = post("p2"), comment = null),
        )

        val rows = mapBookmarkItemsToRows(items)

        assertEquals(
            listOf("post:p1", "comment:c1", "post:p2"),
            rows.map { row ->
                when (row) {
                    is BookmarkRow.PostRow -> "post:${row.post.id}"
                    is BookmarkRow.CommentRow -> "comment:${row.comment.id}"
                }
            },
        )
    }

    @Test
    fun `a post-typed item missing its post payload is dropped, not crashed on`() {
        val items = listOf(BookmarkItem(type = "post", id = "b1", post = null, comment = null))

        assertEquals(emptyList<BookmarkRow>(), mapBookmarkItemsToRows(items))
    }

    @Test
    fun `an unrecognized type is dropped, not assumed to be a post`() {
        val items = listOf(BookmarkItem(type = "listing", id = "b1", post = post("p1"), comment = null))

        assertEquals(emptyList<BookmarkRow>(), mapBookmarkItemsToRows(items))
    }
}
