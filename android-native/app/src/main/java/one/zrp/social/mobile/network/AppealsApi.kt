package one.zrp.social.mobile.network

import retrofit2.http.Body
import retrofit2.http.GET
import retrofit2.http.POST

data class EligibleReport(
    val id: String,
    val reason: String,
    val actionType: String?,
    val actionNote: String?,
    val actionedAt: String?,
)

data class AppealReportSummary(val id: String, val reason: String, val actionType: String?)

data class Appeal(
    val id: String,
    val message: String,
    // "pending" | "upheld" | "overturned" - the real Prisma enum values,
    // matched case-for-case rather than parsed into a native enum.
    val status: String,
    val resolutionNote: String? = null,
    val resolvedAt: String? = null,
    val createdAt: String,
    val report: AppealReportSummary,
)

data class AppealsResponse(val eligibleReports: List<EligibleReport>, val appeals: List<Appeal>)

data class CreateAppealRequest(val reportId: String, val message: String)

/**
 * The real moderation-appeals feature (src/app/settings/appeals/page.tsx
 * + src/app/api/appeals/route.ts) - lets a user appeal a moderation
 * action taken against one of their own posts/comments/account (a
 * Report the same admin review queue already actioned) and track its
 * resolution. Filing one calls the same POST /api/appeals real staff
 * review, so there's no invented "appeal" state here.
 */
interface AppealsApi {
    @GET("appeals")
    suspend fun getAppeals(): AppealsResponse

    @POST("appeals")
    suspend fun createAppeal(@Body request: CreateAppealRequest): Appeal
}
