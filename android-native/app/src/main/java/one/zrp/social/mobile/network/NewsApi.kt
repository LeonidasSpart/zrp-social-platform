package one.zrp.social.mobile.network

import retrofit2.http.GET
import retrofit2.http.Path
import retrofit2.http.Query

// The same 11 real categories src/app/news/page.tsx's own `categories`
// array (minus the "ALL" client-side filter option) and the
// NewsArticleCategory Prisma enum use, kept as plain strings matching
// the wire values verbatim.
val NEWS_CATEGORIES = listOf(
    "WORLD", "EUROPE", "SWITZERLAND", "POLITICS", "BUSINESS", "TECHNOLOGY",
    "CRYPTO", "SCIENCE", "SPORTS", "CULTURE", "COMMUNITY",
)

data class NewsAuthor(
    val id: String,
    val username: String,
    val name: String? = null,
    val avatarUrl: String? = null,
    val badgeType: String? = null,
)

data class NewsArticleSummary(
    val id: String,
    val title: String,
    val slug: String,
    val excerpt: String? = null,
    val coverImage: String? = null,
    val sourceName: String? = null,
    val category: String,
    val views: Int = 0,
    val featured: Boolean = false,
    val publishedAt: String? = null,
    val createdAt: String,
    val author: NewsAuthor,
)

data class NewsPagination(val limit: Int, val hasMore: Boolean, val nextCursor: String?)

data class NewsListResponse(val articles: List<NewsArticleSummary> = emptyList(), val pagination: NewsPagination)

data class NewsArticleDetail(
    val id: String,
    val title: String,
    val slug: String,
    val excerpt: String? = null,
    val content: String,
    val coverImage: String? = null,
    val sourceName: String? = null,
    val sourceUrl: String? = null,
    val category: String,
    val views: Int = 0,
    val featured: Boolean = false,
    val publishedAt: String? = null,
    val createdAt: String,
    val updatedAt: String,
    val author: NewsAuthor,
)

data class NewsArticleDetailResponse(val article: NewsArticleDetail)

/**
 * ZRP News - the same real GET /news and GET /news/{slug} routes the
 * website's /news pages use. Read-only: article authoring is a
 * journalist/admin editorial workflow, out of scope for this app the
 * same way Music Studio's upload tools are owner-only rather than a
 * general-audience feature.
 */
interface NewsApi {
    @GET("news")
    suspend fun getNews(
        @Query("category") category: String? = null,
        @Query("limit") limit: Int = 20,
        @Query("cursor") cursor: String? = null,
    ): NewsListResponse

    @GET("news/{slug}")
    suspend fun getArticle(@Path("slug") slug: String): NewsArticleDetailResponse
}
