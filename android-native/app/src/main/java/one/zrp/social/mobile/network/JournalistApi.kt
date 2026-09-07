package one.zrp.social.mobile.network

import retrofit2.http.Body
import retrofit2.http.GET
import retrofit2.http.PATCH
import retrofit2.http.POST
import retrofit2.http.Path

// The same 11 real categories NewsApi's own NEWS_CATEGORIES already
// lists (src/app/news/page.tsx's categories array minus "ALL",
// the NewsArticleCategory Prisma enum) - a journalist article's
// category is written from this exact same set, so this reuses
// NEWS_CATEGORIES rather than redeclaring it.

data class JournalistProfile(
    val id: String,
    val status: String,
    val outlet: String? = null,
    val pitch: String? = null,
    val portfolioUrl: String? = null,
    val rejectionReason: String? = null,
    val suspensionReason: String? = null,
)

data class JournalistArticleSummary(
    val id: String,
    val title: String,
    val slug: String,
    val status: String,
    val category: String,
    val coverImage: String? = null,
    val views: Int = 0,
    val reviewNote: String? = null,
    val submittedAt: String? = null,
    val publishedAt: String? = null,
    val updatedAt: String,
)

data class JournalistCounts(
    val total: Int = 0,
    val draft: Int = 0,
    val pendingReview: Int = 0,
    val published: Int = 0,
    val rejected: Int = 0,
    val archived: Int = 0,
)

// GET /api/journalist/profile: isJournalist mirrors session
// user.role === "JOURNALIST" server-side. profile/counts/recentArticles
// are null/empty until a profile exists at all (brand-new applicant).
data class JournalistProfileResponse(
    val isJournalist: Boolean = false,
    val profile: JournalistProfile? = null,
    val counts: JournalistCounts? = null,
    val recentArticles: List<JournalistArticleSummary> = emptyList(),
)

data class JournalistApplyRequest(
    val outlet: String?,
    val pitch: String,
    val portfolioUrl: String?,
)

data class JournalistApplyResponse(val profile: JournalistProfile)

data class JournalistArticleDetail(
    val id: String,
    val title: String,
    val slug: String,
    val excerpt: String? = null,
    val content: String,
    val coverImage: String? = null,
    val sourceName: String? = null,
    val sourceUrl: String? = null,
    val category: String,
    val status: String,
    val reviewNote: String? = null,
)

data class JournalistArticleResponse(val article: JournalistArticleDetail)

data class CreateJournalistArticleRequest(
    val title: String,
    val slug: String,
    val excerpt: String?,
    val content: String,
    val coverImage: String?,
    val sourceName: String?,
    val sourceUrl: String?,
    val category: String,
    val status: String,
)

data class UpdateJournalistArticleRequest(
    val title: String,
    val slug: String,
    val excerpt: String?,
    val content: String,
    val coverImage: String?,
    val sourceName: String?,
    val sourceUrl: String?,
    val category: String,
    val submit: Boolean,
)

/**
 * ZRP Journalist - the real /api/journalist/ routes the website's own
 * /journalist dashboard and article editor pages use. Full status
 * state machine, ported verbatim from journalist/page.tsx and
 * ArticleEditorForm.tsx:
 *
 *  - No profile yet, or profile.status === "REJECTED": role is "USER"
 *    (rejection reverts the role, per the admin route's own doc
 *    comment), so the dashboard shows the apply form - with a rejection
 *    notice/reason if a prior application was rejected.
 *  - PENDING: awaiting admin review.
 *  - SUSPENDED: role stays "JOURNALIST" so this state itself is
 *    reachable, but article creation/editing is blocked (403
 *    server-side) - the dashboard shows only the suspension reason.
 *  - VERIFIED: the full dashboard - stats, recent articles, and a
 *    working article editor. Only a VERIFIED journalist can submit an
 *    article for review (canSubmit); DRAFT is always allowed.
 *
 * Article editing is only allowed while status is DRAFT or REJECTED
 * (409 otherwise) - PENDING_REVIEW/PUBLISHED/ARCHIVED are locked,
 * matching ArticleEditorForm.tsx's own isLocked check. Deletion (DELETE
 * /api/journalist/articles/{id}, DRAFT-only) and the filtered/paginated
 * article list (GET /api/journalist/articles) are deliberately NOT
 * wrapped here - the real website UI never exposes either (the
 * dashboard only ever shows its own fixed 10 most-recent articles via
 * this profile response), so there's no reachable feature on web to
 * bring native parity to yet, the same reasoning already applied to
 * Creator Studio's un-wrapped premium-post creation.
 */
interface JournalistApi {
    @GET("journalist/profile")
    suspend fun getProfile(): JournalistProfileResponse

    @POST("journalist/apply")
    suspend fun apply(@Body request: JournalistApplyRequest): JournalistApplyResponse

    @POST("journalist/articles")
    suspend fun createArticle(@Body request: CreateJournalistArticleRequest): JournalistArticleResponse

    @GET("journalist/articles/{id}")
    suspend fun getArticle(@Path("id") id: String): JournalistArticleResponse

    @PATCH("journalist/articles/{id}")
    suspend fun updateArticle(@Path("id") id: String, @Body request: UpdateJournalistArticleRequest): JournalistArticleResponse
}
