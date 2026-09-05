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

data class SearchResults(
    val users: List<SearchUser> = emptyList(),
    val posts: List<Post> = emptyList(),
)

data class TrendingHashtag(
    val tag: String,
    val count: Int = 0,
)

/**
 * The same real search the website uses (GET /search?q=&type=all,
 * min 2 characters or the server returns empty results) plus the two
 * endpoints the Home feed's own widgets already reuse for a pre-search
 * "Discover" state (suggested users to follow, trending hashtags) -
 * no separate mobile search logic or invented results.
 */
interface SearchApi {
    @GET("search")
    suspend fun search(
        @Query("q") query: String,
        @Query("type") type: String = "all",
    ): SearchResults

    @GET("users/suggested")
    suspend fun getSuggestedUsers(@Query("limit") limit: Int = 10): List<SearchUser>

    @GET("hashtags/trending")
    suspend fun getTrendingHashtags(@Query("limit") limit: Int = 10): List<TrendingHashtag>
}
