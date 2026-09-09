package one.zrp.social.mobile.network

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
 * every support-ticket route and all four financial queues: payments,
 * withdrawals and upgrade requests) regardless of what this client
 * sends; AdminRepository's own KDoc covers how that maps to what the UI
 * shows/hides.
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
}
