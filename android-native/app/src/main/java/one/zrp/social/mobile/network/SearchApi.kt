package one.zrp.social.mobile.network

import retrofit2.http.GET
import retrofit2.http.Query

data class SearchUser(
    val id: String,
    val username: String,
    val name: String?,
    val avatarUrl: String?,
    val badgeType: String?,
)

// Advanced Search's type=all mode - the pre-existing {users, posts}
// shape UNCHANGED, plus one additive list per new category and the
// per-category nextCursor a "See all" tap needs to switch into paginated
// single-category mode (see the searchXxxPage() methods below). Every
// pre-existing caller that only reads .users/.posts keeps working
// unchanged since Gson defaults the new fields when absent.
data class SearchResults(
    val users: List<SearchUser> = emptyList(),
    val posts: List<Post> = emptyList(),
    val hashtags: List<TrendingHashtag> = emptyList(),
    val communities: List<CommunitySummary> = emptyList(),
    val news: List<NewsArticleSummary> = emptyList(),
    val music: List<SearchMusicResult> = emptyList(),
    val opportunities: List<OpportunitySummary> = emptyList(),
    val marketplace: List<ListingSummary> = emptyList(),
    val nextCursors: Map<String, String?>? = null,
    val sort: String? = null,
)

data class TrendingHashtag(
    val tag: String,
    val count: Int = 0,
)

// Music search result - src/lib/search/categories/music.ts merges four
// heterogeneous Prisma models (artist/album/track/playlist) into one
// ranked list tagged by `kind`, since there is no shared table to
// deserialize polymorphically (Gson has no sealed-class/kind-dispatch
// support out of the box, and this codebase registers no custom type
// adapters) - a single flat class with every kind's fields optional,
// switched on `kind` by the UI, is the pragmatic match for that shape.
// Field names mirror the backend's per-kind object exactly so Gson maps
// them without any custom deserializer:
//   artist:   id, displayName, avatarUrl, verified, counter
//   album:    id, title, coverUrl, artist{id,displayName}, counter
//   track:    id, title, audioUrl, coverUrl, durationSec,
//             artist{id,displayName,avatarUrl}, playCount, counter
//   playlist: id, name, coverUrl, counter
data class SearchMusicArtistRef(
    val id: String,
    val displayName: String,
    val avatarUrl: String? = null,
)

data class SearchMusicResult(
    val kind: String,
    val id: String,
    val displayName: String? = null,
    val title: String? = null,
    val name: String? = null,
    val avatarUrl: String? = null,
    val coverUrl: String? = null,
    val verified: Boolean = false,
    val artist: SearchMusicArtistRef? = null,
    val audioUrl: String? = null,
    val durationSec: Int? = null,
    val playCount: Int = 0,
    val counter: Int = 0,
)

// One page of a single search category - GET /search?type=<category>
// (not "all") returns {results, nextCursor, category, sort}, real
// cursor-based pagination (see docs/advanced-search-architecture.md).
data class SearchPage<T>(
    val results: List<T> = emptyList(),
    val nextCursor: String? = null,
    val category: String? = null,
    val sort: String? = null,
)

/**
 * The same real search the website uses (GET /search?q=&type=all,
 * min 2 characters or the server returns empty results) plus the two
 * endpoints the Home feed's own widgets already reuse for a pre-search
 * "Discover" state (suggested users to follow, trending hashtags) -
 * no separate mobile search logic or invented results.
 *
 * The searchXxxPage() methods below back Advanced Search's single-
 * category paginated mode (type=<category>&sort=&dateRange=&...&cursor=)
 * - one Retrofit method per category since Gson/Retrofit resolve the
 * response type from each method's own declared return type, not a
 * runtime type parameter. All 8 share the exact same query parameters;
 * only `type`'s default and the return type differ.
 */
interface SearchApi {
    @GET("search")
    suspend fun search(
        @Query("q") query: String,
        @Query("type") type: String = "all",
        @Query("sort") sort: String? = null,
        @Query("dateRange") dateRange: String? = null,
        @Query("dateFrom") dateFrom: String? = null,
        @Query("dateTo") dateTo: String? = null,
        @Query("language") language: String? = null,
        @Query("country") country: String? = null,
        @Query("media") media: String? = null,
        @Query("verified") verified: Boolean? = null,
        @Query("professional") professional: Boolean? = null,
        @Query("creator") creator: Boolean? = null,
        @Query("community") community: String? = null,
    ): SearchResults

    @GET("users/suggested")
    suspend fun getSuggestedUsers(@Query("limit") limit: Int = 10): List<SearchUser>

    @GET("hashtags/trending")
    suspend fun getTrendingHashtags(@Query("limit") limit: Int = 10): List<TrendingHashtag>

    @GET("search")
    suspend fun searchUsersPage(
        @Query("q") query: String,
        @Query("type") type: String = "users",
        @Query("sort") sort: String? = null,
        @Query("dateRange") dateRange: String? = null,
        @Query("dateFrom") dateFrom: String? = null,
        @Query("dateTo") dateTo: String? = null,
        @Query("language") language: String? = null,
        @Query("country") country: String? = null,
        @Query("verified") verified: Boolean? = null,
        @Query("professional") professional: Boolean? = null,
        @Query("creator") creator: Boolean? = null,
        @Query("cursor") cursor: String? = null,
        @Query("limit") limit: Int? = null,
    ): SearchPage<SearchUser>

    @GET("search")
    suspend fun searchPostsPage(
        @Query("q") query: String,
        @Query("type") type: String = "posts",
        @Query("sort") sort: String? = null,
        @Query("dateRange") dateRange: String? = null,
        @Query("dateFrom") dateFrom: String? = null,
        @Query("dateTo") dateTo: String? = null,
        @Query("language") language: String? = null,
        @Query("country") country: String? = null,
        @Query("media") media: String? = null,
        @Query("verified") verified: Boolean? = null,
        @Query("professional") professional: Boolean? = null,
        @Query("creator") creator: Boolean? = null,
        @Query("community") community: String? = null,
        @Query("cursor") cursor: String? = null,
        @Query("limit") limit: Int? = null,
    ): SearchPage<Post>

    @GET("search")
    suspend fun searchHashtagsPage(
        @Query("q") query: String,
        @Query("type") type: String = "hashtags",
        @Query("sort") sort: String? = null,
        @Query("dateRange") dateRange: String? = null,
        @Query("dateFrom") dateFrom: String? = null,
        @Query("dateTo") dateTo: String? = null,
        @Query("community") community: String? = null,
        @Query("cursor") cursor: String? = null,
        @Query("limit") limit: Int? = null,
    ): SearchPage<TrendingHashtag>

    @GET("search")
    suspend fun searchCommunitiesPage(
        @Query("q") query: String,
        @Query("type") type: String = "communities",
        @Query("sort") sort: String? = null,
        @Query("dateRange") dateRange: String? = null,
        @Query("dateFrom") dateFrom: String? = null,
        @Query("dateTo") dateTo: String? = null,
        @Query("cursor") cursor: String? = null,
        @Query("limit") limit: Int? = null,
    ): SearchPage<CommunitySummary>

    @GET("search")
    suspend fun searchNewsPage(
        @Query("q") query: String,
        @Query("type") type: String = "news",
        @Query("sort") sort: String? = null,
        @Query("dateRange") dateRange: String? = null,
        @Query("dateFrom") dateFrom: String? = null,
        @Query("dateTo") dateTo: String? = null,
        @Query("cursor") cursor: String? = null,
        @Query("limit") limit: Int? = null,
    ): SearchPage<NewsArticleSummary>

    @GET("search")
    suspend fun searchMusicPage(
        @Query("q") query: String,
        @Query("type") type: String = "music",
        @Query("sort") sort: String? = null,
        @Query("dateRange") dateRange: String? = null,
        @Query("dateFrom") dateFrom: String? = null,
        @Query("dateTo") dateTo: String? = null,
        @Query("cursor") cursor: String? = null,
        @Query("limit") limit: Int? = null,
    ): SearchPage<SearchMusicResult>

    @GET("search")
    suspend fun searchOpportunitiesPage(
        @Query("q") query: String,
        @Query("type") type: String = "opportunities",
        @Query("sort") sort: String? = null,
        @Query("dateRange") dateRange: String? = null,
        @Query("dateFrom") dateFrom: String? = null,
        @Query("dateTo") dateTo: String? = null,
        @Query("language") language: String? = null,
        @Query("country") country: String? = null,
        @Query("verified") verified: Boolean? = null,
        @Query("professional") professional: Boolean? = null,
        @Query("creator") creator: Boolean? = null,
        @Query("cursor") cursor: String? = null,
        @Query("limit") limit: Int? = null,
    ): SearchPage<OpportunitySummary>

    @GET("search")
    suspend fun searchMarketplacePage(
        @Query("q") query: String,
        @Query("type") type: String = "marketplace",
        @Query("sort") sort: String? = null,
        @Query("dateRange") dateRange: String? = null,
        @Query("dateFrom") dateFrom: String? = null,
        @Query("dateTo") dateTo: String? = null,
        @Query("language") language: String? = null,
        @Query("country") country: String? = null,
        @Query("verified") verified: Boolean? = null,
        @Query("professional") professional: Boolean? = null,
        @Query("creator") creator: Boolean? = null,
        @Query("cursor") cursor: String? = null,
        @Query("limit") limit: Int? = null,
    ): SearchPage<ListingSummary>
}
