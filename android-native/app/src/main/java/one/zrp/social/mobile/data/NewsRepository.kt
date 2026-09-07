package one.zrp.social.mobile.data

import one.zrp.social.mobile.network.ApiClient
import one.zrp.social.mobile.network.NewsArticleDetail
import one.zrp.social.mobile.network.NewsListResponse

/**
 * ZRP News - the same real GET /news and GET /news/{slug} routes the
 * website's /news pages use.
 */
class NewsRepository {
    suspend fun getNews(cursor: String? = null, category: String? = null, limit: Int = 12): Result<NewsListResponse> = runCatching {
        ApiClient.newsApi.getNews(cursor = cursor, category = category, limit = limit)
    }

    suspend fun getArticle(slug: String): Result<NewsArticleDetail> = runCatching {
        ApiClient.newsApi.getArticle(slug).article
    }
}
