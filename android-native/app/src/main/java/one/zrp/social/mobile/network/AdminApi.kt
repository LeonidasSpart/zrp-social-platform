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

/**
 * The same real ZRP admin backend the website's own /admin pages call -
 * this is a native surface onto the exact same routes, not a parallel
 * moderation system. Every route here is server-side gated by
 * requireStaff (ADMIN or MODERATOR - stats/reports/users-list/posts) or
 * requireAdmin (ADMIN only - role changes, user deletion) regardless of
 * what this client sends; AdminRepository's own KDoc covers how that
 * maps to what the UI shows/hides.
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
}
