package one.zrp.social.mobile.ui.home

import one.zrp.social.mobile.network.Post
import one.zrp.social.mobile.network.PostAuthor
import one.zrp.social.mobile.network.PostCounts
import org.junit.Assert.assertEquals
import org.junit.Assert.assertFalse
import org.junit.Assert.assertTrue
import org.junit.Test

/**
 * Pure-function coverage for Home's pagination guard and optimistic
 * like/repost/bookmark toggles (Task #3, Discover/Explore parity audit:
 * this ViewModel had zero test coverage despite being the app's busiest
 * screen). [HomeViewModel] itself is not instantiated here - its `init`
 * block launches on `viewModelScope` (`Dispatchers.Main`), and this
 * project's test setup has no Robolectric/kotlinx-coroutines-test
 * dependency to supply one - so `canLoadMoreHome`/`applyOptimisticLike`/
 * `applyOptimisticRepost`/`applyOptimisticBookmark` are tested as the
 * plain top-level functions they were extracted into, the same pattern
 * `SearchViewModelTest.kt`'s `canLoadMoreSearch()` already established.
 */
class HomeViewModelTest {

    private fun samplePost(
        liked: Boolean? = false,
        reposted: Boolean? = null,
        bookmarked: Boolean? = null,
        likes: Int = 0,
        reposts: Int = 0,
    ): Post = Post(
        id = "post-1",
        content = "Hello ZRP",
        imageUrl = null,
        imageUrls = null,
        mediaType = null,
        createdAt = "2026-09-10T09:00:00.000Z",
        author = PostAuthor(id = "author-1", username = "leonidas", name = "Leonidas", avatarUrl = null, badgeType = null),
        quotePost = null,
        _count = PostCounts(likes = likes, comments = 0, reposts = reposts),
        liked = liked,
        reposted = reposted,
        bookmarked = bookmarked,
    )

    private fun state(
        isLoadingMore: Boolean = false,
        endReached: Boolean = false,
        nextCursor: String? = "cursor-1",
    ): HomeUiState = HomeUiState(isLoadingMore = isLoadingMore, endReached = endReached, nextCursor = nextCursor)

    // ---- canLoadMoreHome ----

    @Test
    fun `can load more when nothing else is in flight and a next page exists`() {
        assertTrue(canLoadMoreHome(state()))
    }

    @Test
    fun `cannot load more while a page request is already in flight`() {
        assertFalse(canLoadMoreHome(state(isLoadingMore = true)))
    }

    @Test
    fun `cannot load more once the server has said the feed is exhausted`() {
        assertFalse(canLoadMoreHome(state(endReached = true)))
    }

    @Test
    fun `cannot load more with no cursor to page from`() {
        assertFalse(canLoadMoreHome(state(nextCursor = null)))
    }

    // ---- applyOptimisticLike ----

    @Test
    fun `liking an unliked post flips liked true and increments the count`() {
        val result = applyOptimisticLike(samplePost(liked = false, likes = 4))
        assertTrue(result.liked == true)
        assertEquals(5, result._count.likes)
    }

    @Test
    fun `unliking a liked post flips liked false and decrements the count`() {
        val result = applyOptimisticLike(samplePost(liked = true, likes = 4))
        assertFalse(result.liked == true)
        assertEquals(3, result._count.likes)
    }

    @Test
    fun `a post with an unknown liked state is treated as not liked`() {
        val result = applyOptimisticLike(samplePost(liked = null, likes = 0))
        assertTrue(result.liked == true)
        assertEquals(1, result._count.likes)
    }

    // ---- applyOptimisticRepost ----

    @Test
    fun `reposting flips reposted true and increments the count`() {
        val result = applyOptimisticRepost(samplePost(reposted = false, reposts = 2))
        assertTrue(result.reposted == true)
        assertEquals(3, result._count.reposts)
    }

    @Test
    fun `un-reposting flips reposted false and decrements the count`() {
        val result = applyOptimisticRepost(samplePost(reposted = true, reposts = 2))
        assertFalse(result.reposted == true)
        assertEquals(1, result._count.reposts)
    }

    // ---- applyOptimisticBookmark ----

    @Test
    fun `bookmarking a never-bookmarked post sets bookmarked true`() {
        val result = applyOptimisticBookmark(samplePost(bookmarked = null))
        assertTrue(result.bookmarked == true)
    }

    @Test
    fun `un-bookmarking a bookmarked post sets bookmarked false`() {
        val result = applyOptimisticBookmark(samplePost(bookmarked = true))
        assertFalse(result.bookmarked == true)
    }
}
