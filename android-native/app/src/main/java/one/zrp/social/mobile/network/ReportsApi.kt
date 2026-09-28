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
    // ZRP PLAY user-created challenges (PlayChallenge) - the backend's
    // Report model has supported this target since it was added, but
    // this app never had the field, so it was impossible for any future
    // Android reporting UI on a PLAY challenge to reach it.
    val challengeId: String? = null,
    val opportunityId: String? = null,
    val campaignId: String? = null,
    // Live Audio rooms (abusive/illegal content spoken in a room,
    // harassment by a host/speaker) - same gap as challengeId above.
    val liveAudioRoomId: String? = null,
    // A bare profile report (harassment, impersonation, fake account)
    // with no single post/comment/listing attached - see the backend's
    // reportedUserId field in prisma/schema.prisma.
    val userId: String? = null,
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
