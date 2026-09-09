package one.zrp.social.mobile.network

import retrofit2.http.Body
import retrofit2.http.DELETE
import retrofit2.http.GET
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

/**
 * The same real ZRP admin backend the website's own /admin pages call -
 * this is a native surface onto the exact same routes, not a parallel
 * moderation system. Every route here is server-side gated by
 * requireStaff (ADMIN or MODERATOR - stats/reports/users-list/posts) or
 * requireAdmin (ADMIN only - role changes, user deletion, and every
 * support-ticket route) regardless of what this client sends;
 * AdminRepository's own KDoc covers how that maps to what the UI
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
}
