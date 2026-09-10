package one.zrp.social.mobile.network

import retrofit2.http.GET

data class TransparencyTotals(
    val allTime: Long,
    val last30Days: Long,
    val last90Days: Long,
)

data class TransparencyReasonCount(
    val reason: String,
    val count: Long,
)

data class TransparencyStatusCount(
    val status: String,
    val count: Long,
)

data class TransparencyActionCount(
    val actionType: String,
    val count: Long,
)

data class TransparencySeriesPoint(
    val month: String,
    val received: Long,
    val actioned: Long,
)

data class TransparencyAppeals(
    val pending: Long,
    val upheld: Long,
    val overturned: Long,
)

data class ModerationTransparencyResponse(
    val generatedAt: String,
    val totals: TransparencyTotals,
    val byReason: List<TransparencyReasonCount>,
    val byStatus: List<TransparencyStatusCount>,
    val byActionType: List<TransparencyActionCount>,
    val medianResolutionHours: Double?,
    val series: List<TransparencySeriesPoint>,
    val appeals: TransparencyAppeals,
)

/**
 * The real, public GET /api/transparency/moderation route
 * src/app/transparency/page.tsx itself calls - no auth required
 * server-side, matching the real route. Aggregate counts only (see
 * that route's own comment): never a reporter's identity, a reported
 * user's identity, or any post/comment content.
 */
interface TransparencyApi {
    @GET("transparency/moderation")
    suspend fun getModerationTransparency(): ModerationTransparencyResponse
}
