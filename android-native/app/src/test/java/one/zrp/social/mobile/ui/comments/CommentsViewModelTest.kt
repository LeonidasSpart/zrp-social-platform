package one.zrp.social.mobile.ui.comments

import org.junit.Assert.assertFalse
import org.junit.Assert.assertTrue
import org.junit.Test

/**
 * Regression coverage for the comments-pagination bug: the client used
 * to call GET /posts/{id}/comments once with no cursor and never looked
 * at the response's `nextCursor`, so any post with more than 10 top-
 * level comments (the backend's page size) silently truncated on
 * Android with no error and no way to reach the rest, while the exact
 * same API fully supports paging further (see CommentsViewModel's own
 * loadMore()/canLoadMoreComments() KDoc, and PollMathTest.kt /
 * MessagesViewModelTest.kt for why this is a pure-function extraction
 * rather than a full ViewModel test - no fake-repository/coroutine test
 * seam exists for ViewModels in this module yet).
 */
class CommentsViewModelTest {

    private fun state(
        isLoadingMore: Boolean = false,
        endReached: Boolean = false,
        nextCursor: String? = "cursor-1",
    ) = CommentsUiState(isLoadingMore = isLoadingMore, endReached = endReached, nextCursor = nextCursor)

    @Test
    fun `can load more when a next page exists and nothing else is in flight`() {
        assertTrue(canLoadMoreComments(state()))
    }

    @Test
    fun `cannot load more while a page request is already in flight`() {
        assertFalse(canLoadMoreComments(state(isLoadingMore = true)))
    }

    @Test
    fun `cannot load more once the server has said there is nothing left`() {
        assertFalse(canLoadMoreComments(state(endReached = true, nextCursor = null)))
    }

    @Test
    fun `cannot load more when there is no cursor yet, even if endReached is somehow false`() {
        // The real first-page state before refresh() ever completes -
        // nextCursor null must block loadMore() on its own, not only via
        // endReached, since the two are set together in practice but
        // this guard must not silently assume that invariant holds.
        assertFalse(canLoadMoreComments(state(endReached = false, nextCursor = null)))
    }
}
