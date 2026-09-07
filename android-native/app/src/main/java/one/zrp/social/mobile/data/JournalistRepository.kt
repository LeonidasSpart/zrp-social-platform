package one.zrp.social.mobile.data

import one.zrp.social.mobile.network.ApiClient
import one.zrp.social.mobile.network.CreateJournalistArticleRequest
import one.zrp.social.mobile.network.JournalistApplyRequest
import one.zrp.social.mobile.network.JournalistArticleDetail
import one.zrp.social.mobile.network.JournalistProfile
import one.zrp.social.mobile.network.JournalistProfileResponse
import one.zrp.social.mobile.network.UpdateJournalistArticleRequest
import one.zrp.social.mobile.network.zrpErrorMessage
import retrofit2.HttpException

/**
 * ZRP Journalist - see JournalistApi's own KDoc for the full real
 * contract and status state machine.
 */
class JournalistRepository {
    suspend fun getProfile(): Result<JournalistProfileResponse> = runCatching {
        ApiClient.journalistApi.getProfile()
    }

    suspend fun apply(outlet: String?, pitch: String, portfolioUrl: String?): Result<JournalistProfile> {
        return try {
            val request = JournalistApplyRequest(outlet = outlet, pitch = pitch, portfolioUrl = portfolioUrl)
            Result.success(ApiClient.journalistApi.apply(request).profile)
        } catch (e: HttpException) {
            Result.failure(Exception(e.zrpErrorMessage() ?: "Couldn't submit your application."))
        } catch (e: Exception) {
            Result.failure(Exception("Couldn't reach ZRP. Check your connection and try again."))
        }
    }

    suspend fun getArticle(id: String): Result<JournalistArticleDetail> = runCatching {
        ApiClient.journalistApi.getArticle(id).article
    }

    suspend fun createArticle(
        title: String,
        slug: String,
        excerpt: String?,
        content: String,
        coverImage: String?,
        sourceName: String?,
        sourceUrl: String?,
        category: String,
        submit: Boolean,
    ): Result<JournalistArticleDetail> {
        return try {
            val request = CreateJournalistArticleRequest(
                title = title,
                slug = slug,
                excerpt = excerpt,
                content = content,
                coverImage = coverImage,
                sourceName = sourceName,
                sourceUrl = sourceUrl,
                category = category,
                status = if (submit) "PENDING_REVIEW" else "DRAFT",
            )
            Result.success(ApiClient.journalistApi.createArticle(request).article)
        } catch (e: HttpException) {
            Result.failure(Exception(e.zrpErrorMessage() ?: "Failed to save article"))
        } catch (e: Exception) {
            Result.failure(Exception("Couldn't reach ZRP. Check your connection and try again."))
        }
    }

    suspend fun updateArticle(
        id: String,
        title: String,
        slug: String,
        excerpt: String?,
        content: String,
        coverImage: String?,
        sourceName: String?,
        sourceUrl: String?,
        category: String,
        submit: Boolean,
    ): Result<JournalistArticleDetail> {
        return try {
            val request = UpdateJournalistArticleRequest(
                title = title,
                slug = slug,
                excerpt = excerpt,
                content = content,
                coverImage = coverImage,
                sourceName = sourceName,
                sourceUrl = sourceUrl,
                category = category,
                submit = submit,
            )
            Result.success(ApiClient.journalistApi.updateArticle(id, request).article)
        } catch (e: HttpException) {
            Result.failure(Exception(e.zrpErrorMessage() ?: "Failed to save article"))
        } catch (e: Exception) {
            Result.failure(Exception("Couldn't reach ZRP. Check your connection and try again."))
        }
    }
}
