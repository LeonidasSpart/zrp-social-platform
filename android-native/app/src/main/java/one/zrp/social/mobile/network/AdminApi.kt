package one.zrp.social.mobile.network

import com.google.gson.JsonElement
import retrofit2.http.Body
import retrofit2.http.DELETE
import retrofit2.http.GET
import retrofit2.http.PATCH
import retrofit2.http.POST
import retrofit2.http.PUT
import retrofit2.http.Path
import retrofit2.http.Query

// ─── Dashboard (GET /admin/stats) ────────────────────────────────────
data class AdminStats(
    val users: Int,
    val posts: Int,
    val comments: Int,
    val reports: Int,
    val pendingReports: Int,
    val roleCounts: Map<String, Int> = emptyMap(),
)

// ─── Reports (GET/PUT /admin/reports) ────────────────────────────────
// A report's target is polymorphic - post, comment, marketplace
// listing, PLAY challenge, opportunity, or aid campaign - matching the
// real Report model's own six mutually-exclusive optional relations
// (see the route's own include). Exactly one is ever non-null.
data class AdminReportAuthor(val id: String, val username: String, val name: String?)
data class AdminReportPost(val id: String, val content: String, val author: AdminReportAuthor)
data class AdminReportComment(val id: String, val content: String, val postId: String, val author: AdminReportAuthor)
data class AdminReportListing(val id: String, val title: String, val category: String?, val seller: AdminReportAuthor)
data class AdminReportChallenge(val id: String, val title: String, val creator: AdminReportAuthor?)
data class AdminReportOpportunity(val id: String, val title: String, val poster: AdminReportAuthor)
data class AdminReportCampaign(val id: String, val title: String, val organizer: AdminReportAuthor)

data class AdminReport(
    val id: String,
    val reason: String,
    val details: String?,
    val status: String,
    val actionType: String?,
    val actionNote: String?,
    val actionedAt: String?,
    val createdAt: String,
    val reporter: AdminReportAuthor,
    val post: AdminReportPost?,
    val comment: AdminReportComment?,
    val listing: AdminReportListing?,
    val challenge: AdminReportChallenge?,
    val opportunity: AdminReportOpportunity?,
    val campaign: AdminReportCampaign?,
)

data class AdminReportsResponse(val reports: List<AdminReport>, val total: Int, val page: Int, val totalPages: Int)

// status is "reviewed" | "dismissed" | "actioned"; actionType/actionNote
// only meaningful (and only sent) when status == "actioned" - matches
// the website's own AdminReports page exactly (see its ACTION_TYPES).
data class UpdateReportRequest(val status: String, val actionType: String? = null, val actionNote: String? = null)

// ─── User management (GET/PUT/DELETE /admin/users) ───────────────────
data class AdminUserCounts(val posts: Int, val comments: Int, val reports: Int)
data class AdminUser(
    val id: String,
    val username: String,
    val name: String?,
    val email: String,
    val createdAt: String,
    val role: String,
    val badgeType: String?,
    val plan: String?,
    val banned: Boolean,
    val _count: AdminUserCounts,
)
data class AdminUsersStats(val total: Int, val active: Int, val banned: Int, val admins: Int, val mods: Int)
data class AdminUsersResponse(
    val users: List<AdminUser>,
    val total: Int,
    val page: Int,
    val totalPages: Int,
    val stats: AdminUsersStats,
)
data class ToggleBanResponse(val banned: Boolean)

// role must be one of USER/MODERATOR/ADMIN - the server 400s on
// anything else (see the route's own VALID_ROLES). Requires the real
// ADMIN role server-side (requireAdmin, not requireStaff) - a
// MODERATOR calling this gets a real 403, matching the website exactly.
data class UpdateUserRoleRequest(val role: String)

// ─── Post moderation (GET/DELETE /admin/posts) ───────────────────────
data class AdminPostAuthor(val id: String, val username: String, val name: String?)
data class AdminPostCounts(val likes: Int, val comments: Int, val reposts: Int)
data class AdminPost(
    val id: String,
    val content: String,
    val imageUrl: String?,
    val createdAt: String,
    val author: AdminPostAuthor,
    val _count: AdminPostCounts,
)
data class AdminPostsResponse(val posts: List<AdminPost>, val total: Int, val page: Int, val totalPages: Int)

// ─── Appeals (GET /admin/appeals, PUT /admin/appeals/{id}) ───────────
// The staff side of the same Appeal rows AppealsApi lets a user file
// against a Report that was already actioned against them. Status is
// the real lowercase Prisma value ("pending"/"upheld"/"overturned"),
// matched case-for-case rather than parsed into a native enum - the
// same convention Appeal.status already uses in AppealsApi.
data class AdminAppealUser(val id: String, val username: String, val name: String?)
data class AdminAppealReport(
    val id: String,
    val reason: String,
    val actionType: String?,
    val actionNote: String?,
    val actionedAt: String?,
)
data class AdminAppeal(
    val id: String,
    val message: String,
    val status: String,
    val resolutionNote: String?,
    val resolvedAt: String?,
    val createdAt: String,
    val user: AdminAppealUser,
    val report: AdminAppealReport,
)
data class AdminAppealsResponse(
    val appeals: List<AdminAppeal>,
    val total: Int,
    val page: Int,
    val totalPages: Int,
)

// status must be "upheld" or "overturned" - the route 400s on anything
// else, and 409s if the appeal was already resolved.
data class ResolveAppealRequest(val status: String, val resolutionNote: String? = null)

// ─── Ad review (GET /admin/ads, PUT /admin/ads/{id}) ─────────────────
// bidAmount/budgetTotal are Prisma Decimals server-side but always
// reach the client as plain JSON numbers (see lib/serialize-decimal's
// jsonWithDecimals, which every money-carrying admin route uses).
data class AdminAdAdvertiser(val id: String, val username: String, val name: String?, val email: String?)
data class AdminAdPost(
    val id: String,
    val content: String,
    val imageUrl: String?,
    val imageUrls: List<String> = emptyList(),
    val mediaType: String?,
)
data class AdminAdCampaign(
    val id: String,
    val name: String,
    val bidType: String,
    val bidAmount: Double,
    val budgetTotal: Double,
    val status: String,
    val rejectionReason: String?,
    val createdAt: String,
    val advertiser: AdminAdAdvertiser,
    val post: AdminAdPost?,
)
data class AdminAdsResponse(
    val campaigns: List<AdminAdCampaign>,
    val total: Int,
    val page: Int,
    val totalPages: Int,
)

// action is "approve" | "reject"; rejectionReason is only stored on a
// reject (the route nulls it on approve). Only a PENDING_REVIEW
// campaign can be reviewed - anything else 400s.
data class ReviewAdRequest(val action: String, val rejectionReason: String? = null)

// ─── Marketplace review (GET/PUT /admin/marketplace) ─────────────────
data class AdminListingSeller(
    val id: String,
    val username: String,
    val name: String?,
    val avatarUrl: String?,
    val badgeType: String?,
)
data class AdminListing(
    val id: String,
    val category: String,
    val title: String,
    val price: Double?,
    val currency: String,
    val priceOnRequest: Boolean,
    val location: String?,
    val status: String,
    val rejectionReason: String?,
    val createdAt: String,
    val seller: AdminListingSeller,
)
data class AdminMarketplaceResponse(
    val listings: List<AdminListing>,
    val total: Int,
    val page: Int,
    val totalPages: Int,
)

// ─── Opportunity review (GET/PUT /admin/opportunity) ─────────────────
data class AdminOpportunityPoster(
    val id: String,
    val username: String,
    val name: String?,
    val avatarUrl: String?,
    val badgeType: String?,
)
data class AdminOpportunityListing(
    val id: String,
    val type: String,
    val title: String,
    val organizationName: String?,
    val location: String?,
    val remote: Boolean,
    val isPaid: Boolean,
    val status: String,
    val rejectionReason: String?,
    val createdAt: String,
    val poster: AdminOpportunityPoster,
)
data class AdminOpportunityResponse(
    val listings: List<AdminOpportunityListing>,
    val total: Int,
    val page: Int,
    val totalPages: Int,
)

// ─── HELP campaign review (GET/PUT /admin/help) ──────────────────────
data class AdminHelpOrganizer(
    val id: String,
    val username: String,
    val name: String?,
    val avatarUrl: String?,
    val badgeType: String?,
)
data class AdminHelpCampaign(
    val id: String,
    val category: String,
    val title: String,
    val location: String?,
    val goalAmount: Double?,
    val currency: String,
    val raisedAmount: Double,
    val status: String,
    val rejectionReason: String?,
    val createdAt: String,
    val organizer: AdminHelpOrganizer,
)
data class AdminHelpResponse(
    val campaigns: List<AdminHelpCampaign>,
    val total: Int,
    val page: Int,
    val totalPages: Int,
)

// The one request shape shared by marketplace/opportunity/help review:
// action is "approve" | "reject" | "remove". approve/reject require the
// row to be PENDING_REVIEW, remove requires it to be ACTIVE - the
// routes enforce that and 400 otherwise, which is exactly why each
// screen only offers the actions valid for the row's current status.
data class ReviewSubmissionRequest(val action: String, val rejectionReason: String? = null)

// ─── Journalists (GET/POST /admin/journalists, PATCH .../{id}) ───────
// Status here is the real UPPERCASE JournalistStatus enum
// (PENDING/VERIFIED/REJECTED/SUSPENDED), unlike the lowercase Appeal
// status above. Note the PATCH path segment is the target USER's id,
// not the JournalistProfile id - see the route's own KDoc.
data class AdminJournalistUser(
    val id: String,
    val username: String,
    val name: String?,
    val email: String?,
    val avatarUrl: String?,
    val badgeType: String?,
    val role: String?,
)
data class AdminJournalistReviewer(val id: String, val username: String, val name: String?)
data class AdminJournalistProfile(
    val id: String,
    val status: String,
    val outlet: String?,
    val pitch: String?,
    val portfolioUrl: String?,
    val rejectionReason: String?,
    val suspensionReason: String?,
    val appliedAt: String?,
    val reviewedAt: String?,
    val user: AdminJournalistUser,
    val reviewedBy: AdminJournalistReviewer?,
)
data class AdminJournalistsPagination(
    val page: Int = 1,
    val limit: Int = 20,
    val total: Int = 0,
    val totalPages: Int = 1,
    val hasMore: Boolean = false,
)
data class AdminJournalistsResponse(
    val success: Boolean = false,
    val profiles: List<AdminJournalistProfile> = emptyList(),
    // Keyed by the same UPPERCASE status values, always carrying all
    // four keys (the route seeds them at zero before merging the real
    // groupBy counts in).
    val counts: Map<String, Int> = emptyMap(),
    val pagination: AdminJournalistsPagination? = null,
)

// action is one of approve/reject/suspend/restore/remove; reason is
// stored as rejectionReason (reject/remove) or suspensionReason
// (suspend) and ignored by approve/restore.
data class JournalistActionRequest(val action: String, val reason: String? = null)

// Admin-initiated grant - makes an existing user a VERIFIED journalist
// without them ever submitting an application (POST /admin/journalists,
// which also flips their role and syncs the badge).
data class GrantJournalistRequest(val username: String)

// ─── Music artists (GET /admin/music/artists, verify/delete) ─────────
data class AdminMusicArtistUser(
    val id: String,
    val username: String,
    val name: String?,
    val avatarUrl: String?,
    val email: String?,
)
data class AdminMusicArtistCounts(val tracks: Int = 0, val followers: Int = 0)
data class AdminMusicArtist(
    val id: String,
    val displayName: String,
    val verified: Boolean,
    val avatarUrl: String?,
    val createdAt: String,
    val user: AdminMusicArtistUser,
    val _count: AdminMusicArtistCounts = AdminMusicArtistCounts(),
)
data class AdminMusicArtistsResponse(
    val artists: List<AdminMusicArtist>,
    val total: Int,
    val page: Int,
    val totalPages: Int,
)

// The verify route takes the desired state rather than toggling
// server-side, so unverifying is the same call with verified = false.
data class VerifyArtistRequest(val verified: Boolean)

// ─── Support tickets (/admin/support/tickets) ────────────────────────
// The admin view of EVERY user's tickets - a different surface from the
// caller's own tickets in SupportApi. Every route under
// /api/admin/support/tickets is gated by requireAdmin (real ADMIN role
// only, never MODERATOR), matching the website's own
// /admin/support pages, which themselves render "Access denied. Admin
// only." for anything but role === 'ADMIN'.
data class AdminTicketUser(
    val id: String,
    val username: String,
    val email: String? = null,
    val avatarUrl: String? = null,
    val plan: String? = null,
)

data class AdminTicketAdmin(val id: String, val username: String, val email: String? = null)

data class AdminTicketReplyUser(
    val id: String,
    val username: String,
    val avatarUrl: String? = null,
    val role: String? = null,
)

// isInternal is the one real field separating a public reply (which the
// ticket's owner sees on their own /support/tickets/{id} page) from an
// admin-only internal note - see the reply route's own body
// destructuring: { message, isInternal }.
data class AdminTicketReply(
    val id: String,
    val message: String,
    val isInternal: Boolean = false,
    val createdAt: String,
    val user: AdminTicketReplyUser,
)

data class AdminTicketReplyCount(val replies: Int = 0)

// GET /admin/support/tickets list row - matches the route's own include
// (user, assignedAdmin, _count) exactly.
data class AdminSupportTicket(
    val id: String,
    val subject: String,
    val category: String,
    val priority: String,
    val status: String,
    val createdAt: String,
    val user: AdminTicketUser,
    val assignedAdmin: AdminTicketAdmin? = null,
    val _count: AdminTicketReplyCount = AdminTicketReplyCount(),
)

data class AdminSupportPagination(val page: Int, val limit: Int, val total: Int, val pages: Int)

data class AdminSupportTicketsResponse(
    val tickets: List<AdminSupportTicket>,
    val pagination: AdminSupportPagination,
)

// GET /admin/support/tickets/stats - five real counts, nothing derived.
data class AdminSupportStats(
    val open: Int,
    val inProgress: Int,
    val awaitingReply: Int,
    val resolved: Int,
    val total: Int,
)

// GET /admin/support/tickets/{id} - the full ticket with its whole
// reply thread (internal notes included, ordered oldest-first by the
// route itself).
data class AdminSupportTicketDetail(
    val id: String,
    val subject: String,
    val message: String,
    val category: String,
    val priority: String,
    val status: String,
    val createdAt: String,
    val resolution: String? = null,
    val resolvedAt: String? = null,
    val user: AdminTicketUser,
    val assignedAdmin: AdminTicketAdmin? = null,
    val replies: List<AdminTicketReply> = emptyList(),
)

// PUT /admin/support/tickets/{id}. status/priority are validated
// server-side against the same enums the detail screen offers.
// assignedTo is deliberately a non-null String: the route treats both
// '' and null as "unassign" (see its own `assignedTo === '' ||
// assignedTo === null` branch), and Gson omits null fields entirely -
// an omitted assignedTo would read as `undefined` server-side and leave
// the existing assignment untouched, so clearing one has to be sent as
// the empty string.
data class UpdateSupportTicketRequest(
    val status: String,
    val priority: String,
    val assignedTo: String,
)

data class AdminTicketReplyRequest(val message: String, val isInternal: Boolean)

// POST /admin/support/tickets/{id}/resolve - the route stores
// `resolution || null`, so an empty string resolves with no note.
data class ResolveTicketRequest(val resolution: String)

// ─── Platform analytics (GET /admin/analytics) ───────────────────────
// requireAdmin (real ADMIN role only), the same gate the website's own
// /admin/analytics page sits behind. Every number below is an aggregate
// the route computes server-side - nothing here is derived on-device.
data class AdminAnalyticsSummary(
    val users: Int = 0,
    val posts: Int = 0,
    val comments: Int = 0,
    val likes: Int = 0,
    val reposts: Int = 0,
)

// One day of the route's own 30-day $queryRaw series - real independent
// per-type counts (a source tag carried through the UNION plus a
// conditional COUNT() per column; an earlier version of this route
// unioned all 5 tables into one bare `id` column and ran the identical
// COUNT() expression for every output column, which made all 5 values
// equal by construction - fixed server-side, not something this
// client needs to work around). `date` is a serialised SQL DATE, i.e.
// an ISO-8601 timestamp string, not a bare yyyy-MM-dd. Fields are Long
// rather than Int purely to be a safe superset of whatever integer
// width the route's COUNT()::int cast actually produces on the wire -
// Gson deserializes a JSON integer into either without issue.
data class AdminAnalyticsDaily(
    val date: String,
    val users: Long = 0,
    val posts: Long = 0,
    val comments: Long = 0,
    val likes: Long = 0,
    val reposts: Long = 0,
)

data class AdminAnalyticsPostAuthor(val username: String, val name: String?)
data class AdminAnalyticsPostCounts(val likes: Int = 0, val comments: Int = 0, val reposts: Int = 0)
data class AdminAnalyticsTopPost(
    val id: String,
    val content: String,
    val createdAt: String,
    val author: AdminAnalyticsPostAuthor,
    val _count: AdminAnalyticsPostCounts = AdminAnalyticsPostCounts(),
    // likes + comments + reposts, summed by the route itself before it
    // re-sorts and slices its top ten - never recomputed client-side.
    val engagement: Int = 0,
)

data class AdminAnalyticsEngagement(
    val avgLikesPerPost: Double = 0.0,
    val avgCommentsPerPost: Double = 0.0,
    val totalLikes: Int = 0,
    val totalComments: Int = 0,
    val totalPosts: Int = 0,
)

data class AdminAnalyticsResponse(
    val summary: AdminAnalyticsSummary = AdminAnalyticsSummary(),
    val daily: List<AdminAnalyticsDaily> = emptyList(),
    val topPosts: List<AdminAnalyticsTopPost> = emptyList(),
    val engagement: AdminAnalyticsEngagement = AdminAnalyticsEngagement(),
)

// ─── Audit log (GET /admin/audit-log) ────────────────────────────────
// requireAdmin. This route has no web page at all - the native screen
// is the first UI for it on either platform. The entries are the raw
// AuditLog rows logAdminAction() writes (src/lib/audit-log.ts),
// returned by the route without any reshaping, so every field below is
// a real column on that model. `metadata` is free-form JSON whose keys
// differ per action (the disbursement writer stores beneficiaryName/
// cause/amount, a ban writer stores something else entirely), so it
// stays an unparsed JsonElement and is displayed as the stored JSON
// rather than being forced into one fixed shape.
data class AdminAuditEntry(
    val id: String,
    val actorId: String,
    val actorUsername: String?,
    val action: String,
    val targetType: String?,
    val targetId: String?,
    val metadata: JsonElement?,
    val createdAt: String,
)

// Cursor pagination rather than page numbers: nextCursor is the id the
// next request continues from, and is null once the list is exhausted.
data class AdminAuditLogResponse(
    val entries: List<AdminAuditEntry> = emptyList(),
    val nextCursor: String? = null,
)

// ─── Storage cleanup (GET/POST /admin/cleanup-uploadthing) ───────────
// requireAdmin - a destructive, irreversible storage operation the
// route deliberately keeps away from moderators. GET is a dry run that
// only reports; POST deletes exactly the orphan set that same scan
// found eligible. Anything uploaded in the last 24 hours is never
// deleted - the route holds it back (heldForReview*) because every
// upload flow in this app writes its database row in a second step, so
// a brand-new unreferenced file may still be mid-publish.
data class AdminOrphanFile(
    val key: String,
    val name: String?,
    val size: Long = 0,
    val uploadedAt: Long = 0,
    val status: String?,
)

data class AdminStorageScan(
    val success: Boolean = false,
    val totalFilesInUploadThing: Int = 0,
    val totalReferencedInDb: Int = 0,
    val nonUploadedStatusCount: Int = 0,
    val orphanedCount: Int = 0,
    val orphanedSizeMB: Double = 0.0,
    val heldForReviewCount: Int = 0,
    val heldForReviewSizeMB: Double = 0.0,
    // The route caps these at 200 orphans / 50 held-back files so a
    // huge scan doesn't blow up the payload - the counts and sizes
    // above always describe the whole scan regardless of what's listed.
    val sample: List<AdminOrphanFile> = emptyList(),
    val heldForReviewSample: List<AdminOrphanFile> = emptyList(),
)

// `deleted` is what UploadThing actually confirmed removed, which can
// be lower than orphanedCount if a chunk failed partway through.
data class AdminStorageCleanupResult(
    val success: Boolean = false,
    val orphanedCount: Int = 0,
    val orphanedSizeMB: Double = 0.0,
    val heldForReviewCount: Int = 0,
    val deleted: Int = 0,
)

// ─── Charity disbursements (GET/POST /admin/charity-disbursements) ───
// requireAdmin - real-world charity payouts ZRP has made, entered by an
// admin who is vouching for them. Like the audit log this route has no
// web admin page; the records it holds are the same ones the public
// /charity ledger renders through GET /api/transparency/charity.
//
// amount is a String, not a Double: this route returns the Prisma row
// as-is rather than through lib/serialize-decimal's jsonWithDecimals,
// and a Prisma Decimal serialises to a JSON string ("1500.25"). It is
// kept verbatim and only parsed at the point of display.
data class AdminCharityDisbursement(
    val id: String,
    val beneficiaryName: String,
    val cause: String,
    val amount: String,
    val currency: String,
    val disbursedAt: String,
    val note: String?,
    val proofUrl: String?,
    val recordedById: String?,
    val recordedByUsername: String?,
    val createdAt: String?,
)

data class AdminCharityDisbursementsResponse(
    val disbursements: List<AdminCharityDisbursement> = emptyList(),
)

// cause must be one of orphanages/schools/hospitals/climate (the
// route's own CAUSES list) and amount a finite number greater than
// zero - anything else 400s. disbursedAt is sent as yyyy-MM-dd, which
// the route parses with new Date() and rejects if it's invalid or in
// the future. currency/note/proofUrl are sent as plain (possibly
// empty) strings rather than omitted: the route already treats a blank
// currency as "USD" and a blank note/proofUrl as null, and Gson would
// drop a null field entirely.
data class RecordCharityDisbursementRequest(
    val beneficiaryName: String,
    val cause: String,
    val amount: Double,
    val currency: String,
    val disbursedAt: String,
    val note: String,
    val proofUrl: String,
)

// ─── Payment requests (/admin/payments) ──────────────────────────────
// The manual payment queue behind a paid plan: a user files a
// PaymentRequest carrying the plan they paid for and the transaction id
// they paid with, and an admin verifies it - verifying is what actually
// moves that user onto payment.plan. amount is a Prisma Decimal
// server-side and reaches the client as a plain JSON number, the same
// jsonWithDecimals convention as the ads/marketplace/HELP money fields
// above. Every route here is requireAdmin (real ADMIN role only).
data class AdminPaymentUser(
    val id: String,
    val username: String,
    val name: String? = null,
    val email: String? = null,
)

data class AdminPaymentRequest(
    val id: String,
    val plan: String,
    val amount: Double,
    val currency: String,
    val transactionId: String?,
    val status: String,
    val createdAt: String,
    val user: AdminPaymentUser,
)

// The verify route keys off the PaymentRequest id and 400s on anything
// that isn't still "pending" - the queue only ever lists pending rows,
// so that only fires when two admins work the same row at once.
data class VerifyPaymentRequest(val paymentId: String)

// ─── Withdrawals (/admin/withdrawals) ────────────────────────────────
// Creator earnings payouts - NOT /admin/help-withdrawals, which is the
// separate HELP-campaign fund release. Status is the real UPPERCASE
// WithdrawalStatus enum (PENDING/PROCESSING/COMPLETED/FAILED/REJECTED);
// amount is again a Decimal arriving as a plain number. Approving one
// executes a real on-chain USDC transfer to walletAddress and cannot be
// undone; rejecting releases the reserved amount back to the creator's
// balance. Both are requireAdmin.
data class AdminWithdrawalUser(
    val id: String,
    val username: String,
    val name: String? = null,
    val email: String? = null,
)

data class AdminWithdrawal(
    val id: String,
    val amount: Double,
    val currency: String,
    val walletAddress: String,
    val status: String,
    val transactionHash: String?,
    val processedAt: String?,
    val createdAt: String,
    val user: AdminWithdrawalUser,
)

// ─── Upgrade requests (/upgrade-requests) ────────────────────────────
// Deliberately not under /admin: this is the same route a user POSTs
// their own upgrade request to, whose GET (the queue) and PUT (the
// decision) halves are both requireAdmin. Approving writes
// requestedPlan straight onto the requester's User.plan.
data class AdminUpgradeRequestUser(
    val id: String,
    val username: String,
    val name: String? = null,
    val email: String? = null,
    val plan: String? = null,
)

data class AdminUpgradeRequest(
    val id: String,
    val requestedPlan: String,
    val paymentMethod: String?,
    val message: String?,
    val status: String,
    val createdAt: String,
    val user: AdminUpgradeRequestUser,
)

// action is "approve" or "deny" - the route 400s on anything else, and
// on a request that isn't still "pending".
data class UpgradeRequestActionRequest(val action: String)

// ─── ZRP News CMS (/admin/news) ──────────────────────────────────────
// The editorial back office behind ZRP News: the full NewsArticle CRUD
// the website's own /admin/news page drives, plus the approve/reject
// half of the journalist submission workflow (a journalist's article
// arrives here as PENDING_REVIEW and an editor moves it to PUBLISHED or
// REJECTED with a note the journalist sees on their own dashboard).
//
// Both routes are requireStaff (ADMIN *or* MODERATOR), NOT requireAdmin
// - see the SECURITY FIX comment at the top of the real route.ts. That
// is the same bar as reports/posts/appeals, so this screen takes no
// isAdmin flag.
//
// Nothing here is money-carrying: the only numeric field on the model is
// `views`, a plain Prisma Int, so no Decimal/jsonWithDecimals
// string-vs-number question arises. The route returns the article rows
// straight from Prisma (no serializer), so every field below is the raw
// model field.
data class AdminNewsAuthor(
    val id: String,
    val username: String,
    val name: String?,
    val avatarUrl: String?,
    val badgeType: String?,
)

// The GET list/detail responses use `include: { author: {...} }` with no
// `select` on the article itself, so every scalar column of NewsArticle
// comes back - including the four journalist-workflow columns
// (submittedAt/reviewNote/reviewedAt/reviewedById) the website's own page
// type only declares two of.
data class AdminNewsArticle(
    val id: String,
    val title: String,
    val slug: String,
    val excerpt: String?,
    val content: String,
    val coverImage: String?,
    val sourceName: String?,
    val sourceUrl: String?,
    // The real UPPERCASE NewsArticleCategory enum - the same 11 values
    // NewsApi's own NEWS_CATEGORIES already lists.
    val category: String,
    // The real UPPERCASE NewsArticleStatus enum:
    // DRAFT/PENDING_REVIEW/PUBLISHED/REJECTED/ARCHIVED.
    val status: String,
    val authorId: String,
    val views: Int,
    val featured: Boolean,
    val publishedAt: String?,
    val submittedAt: String?,
    val reviewNote: String?,
    val reviewedAt: String?,
    val reviewedById: String?,
    val createdAt: String,
    val updatedAt: String,
    val author: AdminNewsAuthor,
)

data class AdminNewsPagination(
    val page: Int = 1,
    val limit: Int = 20,
    val total: Int = 0,
    val totalPages: Int = 1,
    val hasMore: Boolean = false,
)

data class AdminNewsResponse(
    val success: Boolean = false,
    val articles: List<AdminNewsArticle> = emptyList(),
    val pagination: AdminNewsPagination? = null,
)

/**
 * The create/update body, sent verbatim to POST /admin/news and
 * PUT /admin/news/{id} (which the route aliases to its PATCH handler).
 *
 * Every optional text field here is a NON-NULL String carrying "" for
 * "empty" rather than a nullable one carrying null, and that is
 * load-bearing rather than stylistic: Retrofit's Gson converter is built
 * with plain `GsonConverterFactory.create()` (see ApiClient), which
 * OMITS null fields entirely. On the update half, an omitted field reads
 * as `undefined` server-side and means "leave this column untouched",
 * while an explicit empty value is coerced to NULL by the route's own
 * `typeof x === "string" && x.trim() ? x.trim() : null` branches. So
 * sending null for a cleared excerpt/cover image/source would silently
 * fail to clear it, whereas "" clears it exactly the way the website's
 * own editor (which posts an explicit null) does. The same "" is
 * indistinguishable from null on the create half, which treats both as
 * "not provided".
 *
 * publishedAt follows the same rule: "" means "no publish date", which
 * the route reads as null on update and, on create, lets fall through to
 * its "status is PUBLISHED, so stamp now()" branch - identical to the
 * website posting null. When set it must be a full ISO-8601 instant.
 *
 * `views` is deliberately absent: the website's own editor never sends
 * it either, so the counter is left to the public article page.
 */
data class SaveNewsArticleRequest(
    val title: String,
    val slug: String,
    val excerpt: String,
    val content: String,
    val coverImage: String,
    val sourceName: String,
    val sourceUrl: String,
    val category: String,
    val status: String,
    val authorId: String,
    val featured: Boolean,
    val publishedAt: String,
)

/**
 * The one-field editorial decision on a journalist's PENDING_REVIEW
 * submission - PATCH /admin/news/{id} with nothing but the new status,
 * exactly what the website's own reviewArticle() posts.
 *
 * reviewNote is nullable here on purpose, the mirror image of the rule
 * above: on approve the website sends no reviewNote key at all, so the
 * journalist's existing note is left untouched, and Gson dropping a null
 * reproduces that exactly. On reject it is always sent - as the typed
 * feedback, or as "" when the editor left the box empty, which the route
 * coerces to null just as the website's own `reviewNote || null` does.
 *
 * Moving a PENDING_REVIEW article to PUBLISHED or REJECTED is also what
 * makes the route stamp reviewedAt/reviewedById and write the
 * `news_article.update_status` audit-log entry - server-side, from the
 * session, never from anything this client sends.
 */
data class ReviewNewsArticleRequest(val status: String, val reviewNote: String? = null)

// ─── Plan management (PUT /admin/users/{id}/plan) ────────────────────
// plan must be one of free/pro/business/enterprise - the route 400s on
// anything else (see its own validPlans). ADMIN-only server-side
// (requireAdmin), the same bar as role changes and user deletion.
data class UpdateUserPlanRequest(val plan: String)

// The plan route answers with the three selected columns only, not the
// full admin user row - hence its own response type rather than reusing
// AdminUser, whose non-null fields Gson would leave unset.
data class AdminUserPlanResponse(val id: String, val username: String, val plan: String)

/**
 * The same real ZRP admin backend the website's own /admin pages call -
 * this is a native surface onto the exact same routes, not a parallel
 * moderation system. Every route here is server-side gated by
 * requireStaff (ADMIN or MODERATOR - stats/reports/users-list/posts) or
 * requireAdmin (ADMIN only - role changes, plan changes, user deletion,
 * every support-ticket route, the four financial queues - payments,
 * withdrawals and upgrade requests - and all four internal ops routes:
 * analytics, audit log, storage cleanup and charity disbursements)
 * regardless of what this client sends; AdminRepository's own KDoc
 * covers how that maps to what the UI shows/hides.
 */
interface AdminApi {
    @GET("admin/stats")
    suspend fun getStats(): AdminStats

    @GET("admin/reports")
    suspend fun getReports(@Query("status") status: String, @Query("page") page: Int): AdminReportsResponse

    @PUT("admin/reports/{id}")
    suspend fun updateReport(@Path("id") id: String, @Body request: UpdateReportRequest): AdminReport

    @GET("admin/users")
    suspend fun getUsers(
        @Query("search") search: String,
        @Query("page") page: Int,
        @Query("role") role: String,
        @Query("status") status: String,
    ): AdminUsersResponse

    @POST("admin/users/{id}/ban")
    suspend fun toggleBan(@Path("id") id: String): ToggleBanResponse

    @PUT("admin/users/{id}")
    suspend fun updateUserRole(@Path("id") id: String, @Body request: UpdateUserRoleRequest): AdminUser

    @DELETE("admin/users/{id}")
    suspend fun deleteUser(@Path("id") id: String)

    @GET("admin/posts")
    suspend fun getPosts(@Query("search") search: String, @Query("page") page: Int): AdminPostsResponse

    @DELETE("admin/posts/{id}")
    suspend fun deletePost(@Path("id") id: String)

    @GET("admin/appeals")
    suspend fun getAppeals(@Query("status") status: String, @Query("page") page: Int): AdminAppealsResponse

    // Every mutating route below returns the bare updated row without
    // the relations its list response includes (or just {success:true}),
    // so nothing here parses a response body - the calling ViewModel
    // reloads the page instead, exactly like each of these screens'
    // website counterparts does after a successful action.
    @PUT("admin/appeals/{id}")
    suspend fun resolveAppeal(@Path("id") id: String, @Body request: ResolveAppealRequest)

    @GET("admin/ads")
    suspend fun getAdCampaigns(@Query("status") status: String, @Query("page") page: Int): AdminAdsResponse

    @PUT("admin/ads/{id}")
    suspend fun reviewAdCampaign(@Path("id") id: String, @Body request: ReviewAdRequest)

    @GET("admin/marketplace")
    suspend fun getAdminListings(
        @Query("status") status: String,
        @Query("page") page: Int,
    ): AdminMarketplaceResponse

    @PUT("admin/marketplace/{id}")
    suspend fun reviewListing(@Path("id") id: String, @Body request: ReviewSubmissionRequest)

    @GET("admin/opportunity")
    suspend fun getAdminOpportunityListings(
        @Query("status") status: String,
        @Query("page") page: Int,
    ): AdminOpportunityResponse

    @PUT("admin/opportunity/{id}")
    suspend fun reviewOpportunityListing(@Path("id") id: String, @Body request: ReviewSubmissionRequest)

    @GET("admin/help")
    suspend fun getAdminHelpCampaigns(
        @Query("status") status: String,
        @Query("page") page: Int,
    ): AdminHelpResponse

    @PUT("admin/help/{id}")
    suspend fun reviewHelpCampaign(@Path("id") id: String, @Body request: ReviewSubmissionRequest)

    // status/search are nullable because "all" on this route means
    // omitting the parameter entirely (the route only filters on a
    // value that's a real JournalistStatus) - Retrofit drops a null
    // @Query rather than sending an empty one.
    @GET("admin/journalists")
    suspend fun getJournalistProfiles(
        @Query("status") status: String?,
        @Query("search") search: String?,
        @Query("page") page: Int,
    ): AdminJournalistsResponse

    @PATCH("admin/journalists/{id}")
    suspend fun updateJournalistStatus(
        @Path("id") userId: String,
        @Body request: JournalistActionRequest,
    )

    @POST("admin/journalists")
    suspend fun grantJournalistStatus(@Body request: GrantJournalistRequest)

    // This route's search parameter is `q` (not `search`, as everywhere
    // else in the admin API) and its status filter is
    // all/verified/unverified - matching the real route verbatim.
    @GET("admin/music/artists")
    suspend fun getMusicArtists(
        @Query("status") status: String,
        @Query("q") q: String?,
        @Query("page") page: Int,
    ): AdminMusicArtistsResponse

    @POST("admin/music/artists/{id}/verify")
    suspend fun setMusicArtistVerified(@Path("id") id: String, @Body request: VerifyArtistRequest)

    @DELETE("admin/music/artists/{id}")
    suspend fun deleteMusicArtist(@Path("id") id: String)

    // An empty status/priority/category is sent as an empty query value
    // and read as falsy server-side (`if (status) where.status = ...`),
    // i.e. "no filter" - exactly what the website's own admin support
    // page sends from its own empty <select> options.
    @GET("admin/support/tickets")
    suspend fun getSupportTickets(
        @Query("status") status: String,
        @Query("priority") priority: String,
        @Query("category") category: String,
        @Query("page") page: Int,
    ): AdminSupportTicketsResponse

    @GET("admin/support/tickets/stats")
    suspend fun getSupportTicketStats(): AdminSupportStats

    @GET("admin/support/tickets/{id}")
    suspend fun getSupportTicket(@Path("id") id: String): AdminSupportTicketDetail

    // The PUT/resolve responses come back without the replies include,
    // so nothing here consumes them - the detail screen re-reads the
    // ticket after every write instead of patching a partial row in.
    @PUT("admin/support/tickets/{id}")
    suspend fun updateSupportTicket(@Path("id") id: String, @Body request: UpdateSupportTicketRequest)

    @DELETE("admin/support/tickets/{id}")
    suspend fun deleteSupportTicket(@Path("id") id: String)

    @POST("admin/support/tickets/{id}/reply")
    suspend fun replyToSupportTicket(
        @Path("id") id: String,
        @Body request: AdminTicketReplyRequest,
    ): AdminTicketReply

    @POST("admin/support/tickets/{id}/resolve")
    suspend fun resolveSupportTicket(@Path("id") id: String, @Body request: ResolveTicketRequest)

    // ─── Internal ops tooling (every route below is requireAdmin) ────
    @GET("admin/analytics")
    suspend fun getAnalytics(): AdminAnalyticsResponse

    // Every filter here is nullable because this route reads an absent
    // parameter as "no filter" (`searchParams.get(...) || undefined`),
    // and Retrofit drops a null @Query instead of sending an empty one
    // - an empty string would be a filter for the empty string. cursor
    // is likewise null on the first page.
    @GET("admin/audit-log")
    suspend fun getAuditLog(
        @Query("action") action: String?,
        @Query("targetType") targetType: String?,
        @Query("targetId") targetId: String?,
        @Query("cursor") cursor: String?,
    ): AdminAuditLogResponse

    @GET("admin/cleanup-uploadthing")
    suspend fun scanStorage(): AdminStorageScan

    // No request body - the route re-runs its own scan and deletes what
    // that finds, so there is nothing for the client to send (and
    // nothing it could send to widen the deletion set).
    @POST("admin/cleanup-uploadthing")
    suspend fun cleanUpStorage(): AdminStorageCleanupResult

    @GET("admin/charity-disbursements")
    suspend fun getCharityDisbursements(): AdminCharityDisbursementsResponse

    // The 201 response is the created row without anything the list
    // doesn't already carry, so nothing here parses it - the screen
    // reloads the ledger instead, same as every other write above.
    @POST("admin/charity-disbursements")
    suspend fun recordCharityDisbursement(@Body request: RecordCharityDisbursementRequest)

    // The four financial queues below answer with a bare JSON array
    // rather than the {rows,total,page,totalPages} envelope the rest of
    // the admin API uses - the routes take no page parameter at all and
    // return the whole queue, so their screens have no pager either.
    @GET("admin/payments")
    suspend fun getPendingPayments(): List<AdminPaymentRequest>

    @POST("admin/payments/verify")
    suspend fun verifyPayment(@Body request: VerifyPaymentRequest)

    // status defaults to PENDING server-side; the screen always sends
    // one explicitly so the filter chips and the queue stay in step.
    @GET("admin/withdrawals")
    suspend fun getWithdrawals(@Query("status") status: String): List<AdminWithdrawal>

    // Both take no body - the withdrawal id in the path is the whole
    // request, same as the ban toggle above.
    @POST("admin/withdrawals/{id}/approve")
    suspend fun approveWithdrawal(@Path("id") id: String)

    @POST("admin/withdrawals/{id}/reject")
    suspend fun rejectWithdrawal(@Path("id") id: String)

    // Not "admin/upgrade-requests" - this route really does live at the
    // API root (see AdminUpgradeRequest's own note).
    @GET("upgrade-requests")
    suspend fun getUpgradeRequests(@Query("status") status: String): List<AdminUpgradeRequest>

    @PUT("upgrade-requests/{id}")
    suspend fun reviewUpgradeRequest(
        @Path("id") id: String,
        @Body request: UpgradeRequestActionRequest,
    )

    @PUT("admin/users/{id}/plan")
    suspend fun updateUserPlan(
        @Path("id") id: String,
        @Body request: UpdateUserPlanRequest,
    ): AdminUserPlanResponse

    // ─── ZRP News CMS ────────────────────────────────────────────────
    // An empty status/category/search is sent as an empty query value:
    // the route only applies status/category when the value is a real
    // NewsArticleStatus/NewsArticleCategory and reads search through
    // `?.trim() || ""`, so "" is "no filter" for all three - exactly
    // what the website's own empty <select> options and empty search box
    // send. limit is sent explicitly at the website's own 20.
    @GET("admin/news")
    suspend fun getNewsArticles(
        @Query("status") status: String,
        @Query("category") category: String,
        @Query("search") search: String,
        @Query("page") page: Int,
        @Query("limit") limit: Int,
    ): AdminNewsResponse

    // Create/update/review/delete all answer with {success, article} (or
    // {success, message}) rather than a bare row, but nothing here
    // consumes that: the list screen reloads the current page after
    // every write, exactly like the website's own page does.
    @POST("admin/news")
    suspend fun createNewsArticle(@Body request: SaveNewsArticleRequest)

    // PUT, not PATCH - the website's own editor sends PUT and the route
    // aliases `export { PATCH as PUT }` for it (see the BUG FIX note in
    // the real route). Both verbs hit the identical handler.
    @PUT("admin/news/{id}")
    suspend fun updateNewsArticle(@Path("id") id: String, @Body request: SaveNewsArticleRequest)

    @PATCH("admin/news/{id}")
    suspend fun reviewNewsArticle(@Path("id") id: String, @Body request: ReviewNewsArticleRequest)

    @DELETE("admin/news/{id}")
    suspend fun deleteNewsArticle(@Path("id") id: String)
}
