package one.zrp.social.mobile.ui.search

import org.junit.Assert.assertFalse
import org.junit.Assert.assertTrue
import org.junit.Test

/**
 * Pure-function coverage for Advanced Search's pagination guard and
 * filter-activity check - no fake-repository/coroutine test seam exists
 * for ViewModels in this module yet (see CommentsViewModelTest.kt's own
 * KDoc for why this is the established pattern here), so
 * canLoadMoreSearch()/SearchFilters.isActive are tested as standalone
 * pure functions/properties rather than by driving the ViewModel.
 */
class SearchViewModelTest {

    private fun state(
        category: SearchCategory = SearchCategory.PEOPLE,
        query: String = "leonidas",
        isLoadingMore: Boolean = false,
        endReached: Boolean = false,
        nextCursor: String? = "cursor-1",
    ) = SearchUiState(category = category, query = query, isLoadingMore = isLoadingMore, endReached = endReached, nextCursor = nextCursor)

    @Test
    fun `can load more when a single category has a next page and nothing else is in flight`() {
        assertTrue(canLoadMoreSearch(state()))
    }

    @Test
    fun `cannot load more in All mode, which is a fixed-size teaser server-side`() {
        assertFalse(canLoadMoreSearch(state(category = SearchCategory.ALL)))
    }

    @Test
    fun `cannot load more while a page request is already in flight`() {
        assertFalse(canLoadMoreSearch(state(isLoadingMore = true)))
    }

    @Test
    fun `cannot load more once the server has said there is nothing left`() {
        assertFalse(canLoadMoreSearch(state(endReached = true, nextCursor = null)))
    }

    @Test
    fun `cannot load more when there is no cursor yet, even if endReached is somehow false`() {
        assertFalse(canLoadMoreSearch(state(endReached = false, nextCursor = null)))
    }

    @Test
    fun `cannot load more once the query has been cleared below the 2-character minimum`() {
        assertFalse(canLoadMoreSearch(state(query = "a")))
    }

    @Test
    fun `filters are inactive by default`() {
        assertFalse(SearchFilters().isActive)
    }

    @Test
    fun `a non-default date range makes filters active`() {
        assertTrue(SearchFilters(dateRange = SearchDateRange.LAST_7D).isActive)
    }

    @Test
    fun `a language filter makes filters active`() {
        assertTrue(SearchFilters(language = "en").isActive)
    }

    @Test
    fun `a blank language does not count as active`() {
        assertFalse(SearchFilters(language = "  ").isActive)
    }

    @Test
    fun `a country filter makes filters active`() {
        assertTrue(SearchFilters(country = "CH").isActive)
    }

    @Test
    fun `a media filter makes filters active`() {
        assertTrue(SearchFilters(media = SearchMediaFilter.IMAGE).isActive)
    }

    @Test
    fun `each boolean toggle makes filters active on its own`() {
        assertTrue(SearchFilters(verified = true).isActive)
        assertTrue(SearchFilters(professional = true).isActive)
        assertTrue(SearchFilters(creator = true).isActive)
    }
}
