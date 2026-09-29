package one.zrp.social.mobile.ui.search

/**
 * Advanced Search's category/sort/filter vocabulary - shared between
 * SearchViewModel's UI state and SearchRepository's wire calls, so both
 * sides always agree on the same set of values as the real GET /search
 * contract (docs/advanced-search-architecture.md). Kept in the UI layer
 * (not network/) since these are also the exact options the search
 * screen's tab/dropdown/filter-panel UI renders - label resolution to a
 * string resource lives in SearchScreen.kt's categoryLabel()/sortLabel()/
 * dateRangeLabel()/mediaLabel().
 *
 * SearchCategory has no wire value of its own: each category dispatches
 * to its own dedicated SearchApi.searchXxxPage() method (searchUsersPage,
 * searchPostsPage, ...), whose own `type` query parameter default already
 * encodes it - see SearchRepository's per-category methods.
 */
enum class SearchCategory {
    ALL,
    PEOPLE,
    POSTS,
    HASHTAGS,
    COMMUNITIES,
    NEWS,
    MUSIC,
    OPPORTUNITIES,
    MARKETPLACE,
}

enum class SearchSort(val wireValue: String) {
    RELEVANCE("relevance"),
    RECENT("recent"),
    ENGAGEMENT("engagement"),
    TRENDING("trending"),
}

enum class SearchDateRange(val wireValue: String) {
    ANY("any"),
    LAST_24H("24h"),
    LAST_7D("7d"),
    LAST_30D("30d"),
    CUSTOM("custom"),
}

// `null` means "All media" (no filter) - there is no "all" wire value,
// matching MediaFilter's real 5 values in src/lib/search/types.ts.
enum class SearchMediaFilter(val wireValue: String) {
    IMAGE("image"),
    VIDEO("video"),
    GIF("gif"),
    POLL("poll"),
    NONE("none"),
}

data class SearchFilters(
    val dateRange: SearchDateRange = SearchDateRange.ANY,
    // ISO-8601 date strings (yyyy-MM-dd), only meaningful when dateRange == CUSTOM.
    val dateFrom: String? = null,
    val dateTo: String? = null,
    val language: String? = null,
    val country: String? = null,
    // Posts only.
    val media: SearchMediaFilter? = null,
    // People/Posts only.
    val verified: Boolean = false,
    val professional: Boolean = false,
    val creator: Boolean = false,
    // Scopes Posts/Hashtags to one Community's hashtag.
    val community: String? = null,
) {
    val isActive: Boolean
        get() = dateRange != SearchDateRange.ANY ||
            !language.isNullOrBlank() ||
            !country.isNullOrBlank() ||
            media != null ||
            verified ||
            professional ||
            creator
}
