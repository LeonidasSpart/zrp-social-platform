package one.zrp.social.mobile.data

import one.zrp.social.mobile.network.ApiClient
import one.zrp.social.mobile.network.CreateTicketRequest
import one.zrp.social.mobile.network.SupportReply
import one.zrp.social.mobile.network.SupportReplyRequest
import one.zrp.social.mobile.network.SupportTicketDetail
import one.zrp.social.mobile.network.SupportTicketSummary
import one.zrp.social.mobile.network.zrpErrorMessage
import retrofit2.HttpException

/**
 * ZRP Support - see SupportApi's own KDoc for the full real contract.
 */
class SupportRepository {
    suspend fun getTickets(): Result<List<SupportTicketSummary>> = runCatching {
        ApiClient.supportApi.getTickets()
    }

    suspend fun createTicket(subject: String, category: String, message: String): Result<SupportTicketDetail> {
        return try {
            Result.success(ApiClient.supportApi.createTicket(CreateTicketRequest(subject, category, message)))
        } catch (e: HttpException) {
            Result.failure(Exception(e.zrpErrorMessage() ?: "Failed to submit your ticket."))
        } catch (e: Exception) {
            Result.failure(Exception("Couldn't reach ZRP. Check your connection and try again."))
        }
    }

    suspend fun getTicket(id: String): Result<SupportTicketDetail> = runCatching {
        ApiClient.supportApi.getTicket(id)
    }

    suspend fun deleteTicket(id: String): Result<Unit> {
        return try {
            ApiClient.supportApi.deleteTicket(id)
            Result.success(Unit)
        } catch (e: HttpException) {
            Result.failure(Exception(e.zrpErrorMessage() ?: "Failed to delete the ticket."))
        } catch (e: Exception) {
            Result.failure(Exception("Couldn't reach ZRP. Check your connection and try again."))
        }
    }

    suspend fun replyToTicket(id: String, message: String): Result<SupportReply> {
        return try {
            Result.success(ApiClient.supportApi.replyToTicket(id, SupportReplyRequest(message)))
        } catch (e: HttpException) {
            Result.failure(Exception(e.zrpErrorMessage() ?: "Failed to send your reply."))
        } catch (e: Exception) {
            Result.failure(Exception("Couldn't reach ZRP. Check your connection and try again."))
        }
    }
}
