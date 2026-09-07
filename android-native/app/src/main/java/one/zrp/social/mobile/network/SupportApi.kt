package one.zrp.social.mobile.network

import retrofit2.http.Body
import retrofit2.http.DELETE
import retrofit2.http.GET
import retrofit2.http.POST
import retrofit2.http.Path

// The same 11 real categories src/app/support/page.tsx's own <select>
// and src/app/api/support/tickets/route.ts's own validCategories list
// use, kept as plain strings matching the wire values verbatim.
val SUPPORT_CATEGORIES = listOf(
    "GENERAL", "ACCOUNT", "PRIVACY", "CONTENT", "MODERATION", "PAYMENT",
    "MONETISATION", "BUG", "FEATURE_REQUEST", "SECURITY", "OTHER",
)

data class SupportTicketUser(
    val username: String,
    val email: String? = null,
    val avatarUrl: String? = null,
    val plan: String? = null,
)

data class SupportTicketAdmin(val username: String, val avatarUrl: String? = null)

data class SupportReplyUser(val username: String, val avatarUrl: String? = null, val role: String? = null)

data class SupportReply(
    val id: String,
    val message: String,
    val createdAt: String,
    val isInternal: Boolean = false,
    val user: SupportReplyUser,
)

data class SupportReplyCount(val replies: Int = 0)

// GET /api/support/tickets returns a plain array of the caller's own
// tickets with just the latest reply/count for the list row - matching
// MyTicketsPage's own Ticket interface exactly.
data class SupportTicketSummary(
    val id: String,
    val subject: String,
    val category: String,
    val status: String,
    val priority: String,
    val createdAt: String,
    val _count: SupportReplyCount = SupportReplyCount(),
)

// Shared by both POST /support/tickets's own creation response (no
// assignedAdmin/replies - see its own include clause) and
// GET /support/tickets/{id}'s full detail (both) - assignedAdmin and
// replies are simply absent/empty on the creation response, matching
// their nullable/default here.
data class SupportTicketDetail(
    val id: String,
    val subject: String,
    val message: String,
    val category: String,
    val status: String,
    val priority: String,
    val createdAt: String,
    val userId: String,
    val user: SupportTicketUser,
    val assignedAdmin: SupportTicketAdmin? = null,
    val replies: List<SupportReply> = emptyList(),
)

data class CreateTicketRequest(val subject: String, val category: String, val message: String)

data class SupportReplyRequest(val message: String)

data class DeleteTicketResponse(val success: Boolean)

/**
 * ZRP Support - the same real /api/support/tickets routes the
 * website's own /support, /support/tickets and /support/tickets/{id}
 * pages use: submit a ticket, list/view the caller's own tickets, and
 * reply to one (ownership enforced server-side; admin ticket
 * management - assignment, internal notes, status changes - is
 * out of scope here the same way every other admin tool is).
 *
 * Deletion is only allowed by the owner while the ticket is RESOLVED
 * or CLOSED (the server itself rejects it otherwise, matching
 * MyTicketsPage's own isDeletable check); replying is blocked by the
 * server once a ticket is RESOLVED or CLOSED too, matching
 * TicketDetailPage's own conditional reply form.
 */
interface SupportApi {
    @GET("support/tickets")
    suspend fun getTickets(): List<SupportTicketSummary>

    @POST("support/tickets")
    suspend fun createTicket(@Body request: CreateTicketRequest): SupportTicketDetail

    @GET("support/tickets/{id}")
    suspend fun getTicket(@Path("id") id: String): SupportTicketDetail

    @DELETE("support/tickets/{id}")
    suspend fun deleteTicket(@Path("id") id: String): DeleteTicketResponse

    @POST("support/tickets/{id}/reply")
    suspend fun replyToTicket(@Path("id") id: String, @Body request: SupportReplyRequest): SupportReply
}
