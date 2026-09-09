package one.zrp.social.mobile.data

import one.zrp.social.mobile.network.AdminPostsResponse
import one.zrp.social.mobile.network.AdminReport
import one.zrp.social.mobile.network.AdminReportsResponse
import one.zrp.social.mobile.network.AdminStats
import one.zrp.social.mobile.network.AdminSupportStats
import one.zrp.social.mobile.network.AdminSupportTicketDetail
import one.zrp.social.mobile.network.AdminSupportTicketsResponse
import one.zrp.social.mobile.network.AdminTicketReply
import one.zrp.social.mobile.network.AdminTicketReplyRequest
import one.zrp.social.mobile.network.AdminUser
import one.zrp.social.mobile.network.AdminUsersResponse
import one.zrp.social.mobile.network.ApiClient
import one.zrp.social.mobile.network.ResolveTicketRequest
import one.zrp.social.mobile.network.ToggleBanResponse
import one.zrp.social.mobile.network.UpdateReportRequest
import one.zrp.social.mobile.network.UpdateSupportTicketRequest
import one.zrp.social.mobile.network.UpdateUserRoleRequest
import one.zrp.social.mobile.network.zrpErrorMessage
import retrofit2.HttpException

/**
 * The native surface onto the exact same /api/admin routes the
 * website's own /admin pages call - see AdminApi's own KDoc. Every
 * write here can still 401/403 server-side regardless of what the
 * calling screen shows (requireStaff for stats/reports/users-list/
 * posts, requireAdmin for role changes, user deletion and every
 * support-ticket call below) - the Settings entry point and in-screen
 * role gating exist only to keep a MODERATOR (or lower) from being
 * shown controls the server would reject anyway, never as the actual
 * authorization boundary.
 */
class AdminRepository {
    suspend fun getStats(): Result<AdminStats> = runCatching {
        ApiClient.adminApi.getStats()
    }

    suspend fun getReports(status: String, page: Int): Result<AdminReportsResponse> = runCatching {
        ApiClient.adminApi.getReports(status, page)
    }

    suspend fun updateReport(id: String, status: String, actionType: String?, actionNote: String?): Result<AdminReport> {
        return try {
            Result.success(ApiClient.adminApi.updateReport(id, UpdateReportRequest(status, actionType, actionNote)))
        } catch (e: HttpException) {
            Result.failure(Exception(e.zrpErrorMessage() ?: "Failed to update the report."))
        } catch (e: Exception) {
            Result.failure(Exception("Couldn't reach ZRP. Check your connection and try again."))
        }
    }

    suspend fun getUsers(search: String, page: Int, role: String, status: String): Result<AdminUsersResponse> = runCatching {
        ApiClient.adminApi.getUsers(search, page, role, status)
    }

    suspend fun toggleBan(userId: String): Result<ToggleBanResponse> {
        return try {
            Result.success(ApiClient.adminApi.toggleBan(userId))
        } catch (e: HttpException) {
            Result.failure(Exception(e.zrpErrorMessage() ?: "Failed to update this user's status."))
        } catch (e: Exception) {
            Result.failure(Exception("Couldn't reach ZRP. Check your connection and try again."))
        }
    }

    suspend fun updateUserRole(userId: String, role: String): Result<AdminUser> {
        return try {
            Result.success(ApiClient.adminApi.updateUserRole(userId, UpdateUserRoleRequest(role)))
        } catch (e: HttpException) {
            Result.failure(Exception(e.zrpErrorMessage() ?: "Failed to update this user's role."))
        } catch (e: Exception) {
            Result.failure(Exception("Couldn't reach ZRP. Check your connection and try again."))
        }
    }

    suspend fun deleteUser(userId: String): Result<Unit> {
        return try {
            ApiClient.adminApi.deleteUser(userId)
            Result.success(Unit)
        } catch (e: HttpException) {
            Result.failure(Exception(e.zrpErrorMessage() ?: "Failed to delete this user."))
        } catch (e: Exception) {
            Result.failure(Exception("Couldn't reach ZRP. Check your connection and try again."))
        }
    }

    suspend fun getPosts(search: String, page: Int): Result<AdminPostsResponse> = runCatching {
        ApiClient.adminApi.getPosts(search, page)
    }

    suspend fun deletePost(postId: String): Result<Unit> {
        return try {
            ApiClient.adminApi.deletePost(postId)
            Result.success(Unit)
        } catch (e: HttpException) {
            Result.failure(Exception(e.zrpErrorMessage() ?: "Failed to delete this post."))
        } catch (e: Exception) {
            Result.failure(Exception("Couldn't reach ZRP. Check your connection and try again."))
        }
    }

    // ─── Support tickets (ADMIN only, server-side) ───────────────────
    suspend fun getSupportTickets(
        status: String,
        priority: String,
        category: String,
        page: Int,
    ): Result<AdminSupportTicketsResponse> = runCatching {
        ApiClient.adminApi.getSupportTickets(status, priority, category, page)
    }

    suspend fun getSupportTicketStats(): Result<AdminSupportStats> = runCatching {
        ApiClient.adminApi.getSupportTicketStats()
    }

    suspend fun getSupportTicket(id: String): Result<AdminSupportTicketDetail> = runCatching {
        ApiClient.adminApi.getSupportTicket(id)
    }

    // assignedTo is passed straight through: an empty string unassigns
    // (the route's own '' branch), anything else has to be a real user
    // id or the route 400s with "Assigned admin not found".
    suspend fun updateSupportTicket(
        id: String,
        status: String,
        priority: String,
        assignedTo: String,
    ): Result<Unit> {
        return try {
            ApiClient.adminApi.updateSupportTicket(id, UpdateSupportTicketRequest(status, priority, assignedTo))
            Result.success(Unit)
        } catch (e: HttpException) {
            Result.failure(Exception(e.zrpErrorMessage() ?: "Failed to update this ticket."))
        } catch (e: Exception) {
            Result.failure(Exception("Couldn't reach ZRP. Check your connection and try again."))
        }
    }

    suspend fun deleteSupportTicket(id: String): Result<Unit> {
        return try {
            ApiClient.adminApi.deleteSupportTicket(id)
            Result.success(Unit)
        } catch (e: HttpException) {
            Result.failure(Exception(e.zrpErrorMessage() ?: "Failed to delete this ticket."))
        } catch (e: Exception) {
            Result.failure(Exception("Couldn't reach ZRP. Check your connection and try again."))
        }
    }

    suspend fun replyToSupportTicket(id: String, message: String, isInternal: Boolean): Result<AdminTicketReply> {
        return try {
            Result.success(ApiClient.adminApi.replyToSupportTicket(id, AdminTicketReplyRequest(message, isInternal)))
        } catch (e: HttpException) {
            Result.failure(Exception(e.zrpErrorMessage() ?: "Failed to send your reply."))
        } catch (e: Exception) {
            Result.failure(Exception("Couldn't reach ZRP. Check your connection and try again."))
        }
    }

    suspend fun resolveSupportTicket(id: String, resolution: String): Result<Unit> {
        return try {
            ApiClient.adminApi.resolveSupportTicket(id, ResolveTicketRequest(resolution))
            Result.success(Unit)
        } catch (e: HttpException) {
            Result.failure(Exception(e.zrpErrorMessage() ?: "Failed to resolve this ticket."))
        } catch (e: Exception) {
            Result.failure(Exception("Couldn't reach ZRP. Check your connection and try again."))
        }
    }
}
