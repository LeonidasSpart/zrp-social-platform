package one.zrp.social.mobile.ui.discover

import one.zrp.social.mobile.network.DiscoverAuthor
import one.zrp.social.mobile.network.DiscoverItem
import one.zrp.social.mobile.network.DiscoverMedia
import one.zrp.social.mobile.network.DiscoverStats
import one.zrp.social.mobile.network.DiscoverViewerState
import org.junit.Assert.assertEquals
import org.junit.Assert.assertFalse
import org.junit.Assert.assertTrue
import org.junit.Test

/**
 * Pure-function coverage for Discover's pagination guard, prefetch
 * trigger, and optimistic like/repost toggles (Task #3, Discover/
 * Explore parity audit: only DiscoverWatchEvents.kt's watch-event
 * decision logic was tested before this - the feed/pagination/toggle
 * logic in DiscoverViewModel itself had none). DiscoverViewModel is not
 * instantiated here for the same reason HomeViewModelTest.kt doesn't
 * instantiate HomeViewModel - its `init` block launches on
 * `viewModelScope`, which needs a `Dispatchers.Main` this project's
 * plain-JUnit test setup doesn't provide.
 */
class DiscoverViewModelTest {

    private fun sampleItem(
        liked: Boolean = false,
        reposted: Boolean = false,
        likes: Int = 0,
        reposts: Int = 0,
    ): DiscoverItem = DiscoverItem(
        id = "item-1",
        author = DiscoverAuthor(id = "author-1", username = "leonidas", name = "Leonidas", avatarUrl = null, badgeType = null),
        media = DiscoverMedia(url = "https://cdn.zrp.one/video.mp4", type = "video"),
        caption = "Hello Discover",
        stats = DiscoverStats(likes = likes, comments = 0, reposts = reposts, saves = 0, views = 0),
        viewerState = DiscoverViewerState(liked = liked, saved = false, reposted = reposted, followsAuthor = false),
        commentsEnabled = true,
        createdAt = "2026-09-10T09:00:00.000Z",
        reason = "recent",
    )

    private fun state(
        isLoadingMore: Boolean = false,
        endReached: Boolean = false,
        nextCursor: String? = "cursor-1",
    ): DiscoverUiState = DiscoverUiState(isLoadingMore = isLoadingMore, endReached = endReached, nextCursor = nextCursor)

    // ---- canLoadMoreDiscover ----

    @Test
    fun `can load more when nothing else is in flight and a next page exists`() {
        assertTrue(canLoadMoreDiscover(state()))
    }

    @Test
    fun `cannot load more while a page request is already in flight`() {
        assertFalse(canLoadMoreDiscover(state(isLoadingMore = true)))
    }

    @Test
    fun `cannot load more once the server has said the feed is exhausted`() {
        assertFalse(canLoadMoreDiscover(state(endReached = true)))
    }

    @Test
    fun `cannot load more with no cursor to page from`() {
        assertFalse(canLoadMoreDiscover(state(nextCursor = null)))
    }

    // ---- shouldPrefetchDiscoverAt ----

    @Test
    fun `does not prefetch while more than two pages from the end`() {
        assertFalse(shouldPrefetchDiscoverAt(index = 0, itemCount = 10))
        assertFalse(shouldPrefetchDiscoverAt(index = 5, itemCount = 10))
    }

    @Test
    fun `prefetches once within two items of the end`() {
        assertTrue(shouldPrefetchDiscoverAt(index = 8, itemCount = 10))
        assertTrue(shouldPrefetchDiscoverAt(index = 9, itemCount = 10))
    }

    @Test
    fun `a single-item feed prefetches immediately at index zero`() {
        assertTrue(shouldPrefetchDiscoverAt(index = 0, itemCount = 1))
    }

    // ---- applyOptimisticLike ----

    @Test
    fun `liking flips liked true and increments the count`() {
        val result = applyOptimisticLike(sampleItem(liked = false, likes = 4))
        assertTrue(result.viewerState.liked)
        assertEquals(5, result.stats.likes)
    }

    @Test
    fun `unliking flips liked false and decrements the count`() {
        val result = applyOptimisticLike(sampleItem(liked = true, likes = 4))
        assertFalse(result.viewerState.liked)
        assertEquals(3, result.stats.likes)
    }

    @Test
    fun `unliking never drives the like count negative`() {
        // Should never happen from a correct backend (liked=true implies
        // likes greater than 0), but the optimistic update must not hand
        // the UI a negative count if the server and client ever disagree.
        val result = applyOptimisticLike(sampleItem(liked = true, likes = 0))
        assertEquals(0, result.stats.likes)
    }

    // ---- applyOptimisticRepost ----

    @Test
    fun `reposting flips reposted true and increments the count`() {
        val result = applyOptimisticRepost(sampleItem(reposted = false, reposts = 2))
        assertTrue(result.viewerState.reposted)
        assertEquals(3, result.stats.reposts)
    }

    @Test
    fun `un-reposting flips reposted false and decrements the count`() {
        val result = applyOptimisticRepost(sampleItem(reposted = true, reposts = 2))
        assertFalse(result.viewerState.reposted)
        assertEquals(1, result.stats.reposts)
    }

    @Test
    fun `un-reposting never drives the repost count negative`() {
        val result = applyOptimisticRepost(sampleItem(reposted = true, reposts = 0))
        assertEquals(0, result.stats.reposts)
    }
}
