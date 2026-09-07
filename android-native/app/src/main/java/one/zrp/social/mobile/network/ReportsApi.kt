package one.zrp.social.mobile.network

import retrofit2.http.Body
import retrofit2.http.POST

/**
 * The same real moderation pipeline the website's ReportModal feeds -
 * a report lands in the same Report table admins/moderators review,
 * regardless of which client filed it. `reason` must stay one of the
 * website's own fixed English values (see ReportModal.tsx's `reasons`
 * array) since the backend stores it verbatim for moderators to read,
 * not a native-only value moderators would never recognize.
 */
data class CreateReportRequest(
    val postId: String? = null,
    val commentId: String? = null,
    val listingId: String? = null,
    val reason: String,
    val details: String? = null,
)

interface ReportsApi {
    @POST("reports")
    suspend fun createReport(@Body request: CreateReportRequest)
}

/** The website's own fixed reason values (ReportModal.tsx) - reused verbatim. */
val ReportReasons = listOf(
    "Spam",
    "Harassment or bullying",
    "Inappropriate content",
    "Misinformation",
    "Hate speech",
    "Impersonation",
    "Other",
)
