package one.zrp.social.mobile.data

import one.zrp.social.mobile.network.AdminAdsResponse
import one.zrp.social.mobile.network.AdminAnalyticsResponse
import one.zrp.social.mobile.network.AdminAppealsResponse
import one.zrp.social.mobile.network.AdminAuditLogResponse
import one.zrp.social.mobile.network.AdminCharityDisbursementsResponse
import one.zrp.social.mobile.network.AdminHelpResponse
import one.zrp.social.mobile.network.AdminJournalistsResponse
import one.zrp.social.mobile.network.AdminMarketplaceResponse
import one.zrp.social.mobile.network.AdminMusicArtistsResponse
import one.zrp.social.mobile.network.AdminNewsResponse
import one.zrp.social.mobile.network.AdminOpportunityResponse
import one.zrp.social.mobile.network.AdminPaymentRequest
import one.zrp.social.mobile.network.AdminPostsResponse
import one.zrp.social.mobile.network.AdminReport
import one.zrp.social.mobile.network.AdminReportsResponse
import one.zrp.social.mobile.network.AdminStats
import one.zrp.social.mobile.network.AdminStorageCleanupResult
import one.zrp.social.mobile.network.AdminStorageScan
import one.zrp.social.mobile.network.AdminSupportStats
import one.zrp.social.mobile.network.AdminSupportTicketDetail
import one.zrp.social.mobile.network.AdminSupportTicketsResponse
import one.zrp.social.mobile.network.AdminTicketReply
import one.zrp.social.mobile.network.AdminTicketReplyRequest
import one.zrp.social.mobile.network.AdminUpgradeRequest
import one.zrp.social.mobile.network.AdminUser
import one.zrp.social.mobile.network.AdminUserPlanResponse
import one.zrp.social.mobile.network.AdminUsersResponse
import one.zrp.social.mobile.network.AdminWithdrawal
import one.zrp.social.mobile.network.ApiClient
import one.zrp.social.mobile.network.GrantJournalistRequest
import one.zrp.social.mobile.network.JournalistActionRequest
import one.zrp.social.mobile.network.ResolveAppealRequest
import one.zrp.social.mobile.network.ResolveTicketRequest
import one.zrp.social.mobile.network.RecordCharityDisbursementRequest
import one.zrp.social.mobile.network.ReviewAdRequest
import one.zrp.social.mobile.network.ReviewNewsArticleRequest
import one.zrp.social.mobile.network.ReviewSubmissionRequest
import one.zrp.social.mobile.network.SaveNewsArticleRequest
import one.zrp.social.mobile.network.ToggleBanResponse
import one.zrp.social.mobile.network.UpdateReportRequest
import one.zrp.social.mobile.network.UpdateSupportTicketRequest
import one.zrp.social.mobile.network.UpdateUserPlanRequest
import one.zrp.social.mobile.network.UpdateUserRoleRequest
import one.zrp.social.mobile.network.UpgradeRequestActionRequest
import one.zrp.social.mobile.network.VerifyArtistRequest
import one.zrp.social.mobile.network.VerifyPaymentRequest
import one.zrp.social.mobile.network.zrpErrorMessage
import retrofit2.HttpException

/**
 * The native surface onto the exact same /api/admin routes the
 * website's own /admin pages call - see AdminApi's own KDoc. Every
 * write here can still 401/403 server-side regardless of what the
 * calling screen shows (requireStaff for stats/reports/users-list/
 * posts, requireAdmin for role changes, plan changes, user deletion,
 * every support-ticket call, every financial call and all four
 * internal ops calls below) - the Settings entry point and in-screen
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

    suspend fun getAppeals(status: String, page: Int): Result<AdminAppealsResponse> = runCatching {
        ApiClient.adminApi.getAppeals(status, page)
    }

    // The route 409s on an appeal someone else already resolved, and
    // that specific message is worth surfacing verbatim - hence
    // zrpErrorMessage() ahead of the generic fallback, same as every
    // other write here.
    suspend fun resolveAppeal(appealId: String, status: String, resolutionNote: String?): Result<Unit> {
        return try {
            ApiClient.adminApi.resolveAppeal(appealId, ResolveAppealRequest(status, resolutionNote))
            Result.success(Unit)
        } catch (e: HttpException) {
            Result.failure(Exception(e.zrpErrorMessage() ?: "Failed to resolve this appeal."))
        } catch (e: Exception) {
            Result.failure(Exception("Couldn't reach ZRP. Check your connection and try again."))
        }
    }

    suspend fun getAdCampaigns(status: String, page: Int): Result<AdminAdsResponse> = runCatching {
        ApiClient.adminApi.getAdCampaigns(status, page)
    }

    suspend fun reviewAdCampaign(campaignId: String, action: String, rejectionReason: String?): Result<Unit> {
        return try {
            ApiClient.adminApi.reviewAdCampaign(campaignId, ReviewAdRequest(action, rejectionReason))
            Result.success(Unit)
        } catch (e: HttpException) {
            Result.failure(Exception(e.zrpErrorMessage() ?: "Failed to review this campaign."))
        } catch (e: Exception) {
            Result.failure(Exception("Couldn't reach ZRP. Check your connection and try again."))
        }
    }

    suspend fun getAdminListings(status: String, page: Int): Result<AdminMarketplaceResponse> = runCatching {
        ApiClient.adminApi.getAdminListings(status, page)
    }

    suspend fun reviewListing(listingId: String, action: String, rejectionReason: String?): Result<Unit> {
        return try {
            ApiClient.adminApi.reviewListing(listingId, ReviewSubmissionRequest(action, rejectionReason))
            Result.success(Unit)
        } catch (e: HttpException) {
            Result.failure(Exception(e.zrpErrorMessage() ?: "Failed to review this listing."))
        } catch (e: Exception) {
            Result.failure(Exception("Couldn't reach ZRP. Check your connection and try again."))
        }
    }

    suspend fun getAdminOpportunityListings(status: String, page: Int): Result<AdminOpportunityResponse> = runCatching {
        ApiClient.adminApi.getAdminOpportunityListings(status, page)
    }

    suspend fun reviewOpportunityListing(listingId: String, action: String, rejectionReason: String?): Result<Unit> {
        return try {
            ApiClient.adminApi.reviewOpportunityListing(listingId, ReviewSubmissionRequest(action, rejectionReason))
            Result.success(Unit)
        } catch (e: HttpException) {
            Result.failure(Exception(e.zrpErrorMessage() ?: "Failed to review this listing."))
        } catch (e: Exception) {
            Result.failure(Exception("Couldn't reach ZRP. Check your connection and try again."))
        }
    }

    suspend fun getAdminHelpCampaigns(status: String, page: Int): Result<AdminHelpResponse> = runCatching {
        ApiClient.adminApi.getAdminHelpCampaigns(status, page)
    }

    suspend fun reviewHelpCampaign(campaignId: String, action: String, rejectionReason: String?): Result<Unit> {
        return try {
            ApiClient.adminApi.reviewHelpCampaign(campaignId, ReviewSubmissionRequest(action, rejectionReason))
            Result.success(Unit)
        } catch (e: HttpException) {
            Result.failure(Exception(e.zrpErrorMessage() ?: "Failed to review this campaign."))
        } catch (e: Exception) {
            Result.failure(Exception("Couldn't reach ZRP. Check your connection and try again."))
        }
    }

    suspend fun getJournalistProfiles(status: String?, search: String?, page: Int): Result<AdminJournalistsResponse> =
        runCatching { ApiClient.adminApi.getJournalistProfiles(status, search, page) }

    // userId, not the JournalistProfile id - the route keys off the
    // target user (see AdminApi's own note).
    suspend fun updateJournalistStatus(userId: String, action: String, reason: String?): Result<Unit> {
        return try {
            ApiClient.adminApi.updateJournalistStatus(userId, JournalistActionRequest(action, reason))
            Result.success(Unit)
        } catch (e: HttpException) {
            Result.failure(Exception(e.zrpErrorMessage() ?: "Failed to update this journalist."))
        } catch (e: Exception) {
            Result.failure(Exception("Couldn't reach ZRP. Check your connection and try again."))
        }
    }

    suspend fun grantJournalistStatus(username: String): Result<Unit> {
        return try {
            ApiClient.adminApi.grantJournalistStatus(GrantJournalistRequest(username))
            Result.success(Unit)
        } catch (e: HttpException) {
            Result.failure(Exception(e.zrpErrorMessage() ?: "Failed to grant journalist status."))
        } catch (e: Exception) {
            Result.failure(Exception("Couldn't reach ZRP. Check your connection and try again."))
        }
    }

    suspend fun getMusicArtists(status: String, query: String?, page: Int): Result<AdminMusicArtistsResponse> =
        runCatching { ApiClient.adminApi.getMusicArtists(status, query, page) }

    suspend fun setMusicArtistVerified(artistId: String, verified: Boolean): Result<Unit> {
        return try {
            ApiClient.adminApi.setMusicArtistVerified(artistId, VerifyArtistRequest(verified))
            Result.success(Unit)
        } catch (e: HttpException) {
            Result.failure(Exception(e.zrpErrorMessage() ?: "Failed to update this artist."))
        } catch (e: Exception) {
            Result.failure(Exception("Couldn't reach ZRP. Check your connection and try again."))
        }
    }

    suspend fun deleteMusicArtist(artistId: String): Result<Unit> {
        return try {
            ApiClient.adminApi.deleteMusicArtist(artistId)
            Result.success(Unit)
        } catch (e: HttpException) {
            Result.failure(Exception(e.zrpErrorMessage() ?: "Failed to delete this artist."))
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

    // ─── Internal ops tooling (ADMIN only, server-side) ──────────────
    suspend fun getAnalytics(): Result<AdminAnalyticsResponse> = runCatching {
        ApiClient.adminApi.getAnalytics()
    }

    // Every filter is passed straight through: null means "no filter"
    // (see AdminApi's own note), and cursor is null for the first page.
    suspend fun getAuditLog(
        action: String?,
        targetType: String?,
        targetId: String?,
        cursor: String?,
    ): Result<AdminAuditLogResponse> = runCatching {
        ApiClient.adminApi.getAuditLog(action, targetType, targetId, cursor)
    }

    // Both storage calls answer a failure as {success:false, error} with
    // a 500, so zrpErrorMessage() surfaces the route's own wording
    // ("Failed to scan UploadThing storage") rather than a bare status -
    // the same thing the website's own storage page displays.
    suspend fun scanStorage(): Result<AdminStorageScan> {
        return try {
            Result.success(ApiClient.adminApi.scanStorage())
        } catch (e: HttpException) {
            Result.failure(Exception(e.zrpErrorMessage() ?: "Failed to scan UploadThing storage."))
        } catch (e: Exception) {
            Result.failure(Exception("Couldn't reach ZRP. Check your connection and try again."))
        }
    }

    // Irreversible: deletes every orphan the route's own re-run scan
    // finds eligible. The caller is expected to have confirmed the real
    // count/size with the user first - see AdminStorageScreen.
    suspend fun cleanUpStorage(): Result<AdminStorageCleanupResult> {
        return try {
            Result.success(ApiClient.adminApi.cleanUpStorage())
        } catch (e: HttpException) {
            Result.failure(Exception(e.zrpErrorMessage() ?: "Failed to clean up UploadThing storage."))
        } catch (e: Exception) {
            Result.failure(Exception("Couldn't reach ZRP. Check your connection and try again."))
        }
    }

    suspend fun getCharityDisbursements(): Result<AdminCharityDisbursementsResponse> = runCatching {
        ApiClient.adminApi.getCharityDisbursements()
    }

    // The route validates beneficiary/cause/amount/date itself and 400s
    // with a specific message for each, so that message is surfaced
    // verbatim - the form's own checks only exist to stop an obviously
    // incomplete financial record from being sent at all.
    suspend fun recordCharityDisbursement(
        beneficiaryName: String,
        cause: String,
        amount: Double,
        currency: String,
        disbursedAt: String,
        note: String,
        proofUrl: String,
    ): Result<Unit> {
        return try {
            ApiClient.adminApi.recordCharityDisbursement(
                RecordCharityDisbursementRequest(
                    beneficiaryName = beneficiaryName,
                    cause = cause,
                    amount = amount,
                    currency = currency,
                    disbursedAt = disbursedAt,
                    note = note,
                    proofUrl = proofUrl,
                ),
            )
            Result.success(Unit)
        } catch (e: HttpException) {
            Result.failure(Exception(e.zrpErrorMessage() ?: "Failed to record this disbursement."))
        } catch (e: Exception) {
            Result.failure(Exception("Couldn't reach ZRP. Check your connection and try again."))
        }
    }

    // ─── Payments (ADMIN only, server-side) ──────────────────────────
    suspend fun getPendingPayments(): Result<List<AdminPaymentRequest>> = runCatching {
        ApiClient.adminApi.getPendingPayments()
    }

    // 400s on a payment another admin already verified ("Payment
    // already processed") - worth surfacing verbatim, so zrpErrorMessage
    // leads here the same way it does for every other write.
    suspend fun verifyPayment(paymentId: String): Result<Unit> {
        return try {
            ApiClient.adminApi.verifyPayment(VerifyPaymentRequest(paymentId))
            Result.success(Unit)
        } catch (e: HttpException) {
            Result.failure(Exception(e.zrpErrorMessage() ?: "Failed to verify this payment."))
        } catch (e: Exception) {
            Result.failure(Exception("Couldn't reach ZRP. Check your connection and try again."))
        }
    }

    // ─── Withdrawals (ADMIN only, server-side) ───────────────────────
    suspend fun getWithdrawals(status: String): Result<List<AdminWithdrawal>> = runCatching {
        ApiClient.adminApi.getWithdrawals(status)
    }

    // The approve route can fail after it has already claimed the row
    // (the on-chain transfer itself failing), and its message says the
    // amount went back to the creator's balance - exactly the kind of
    // message that has to reach the admin verbatim rather than as a
    // generic failure.
    suspend fun approveWithdrawal(id: String): Result<Unit> {
        return try {
            ApiClient.adminApi.approveWithdrawal(id)
            Result.success(Unit)
        } catch (e: HttpException) {
            Result.failure(Exception(e.zrpErrorMessage() ?: "Failed to approve this withdrawal."))
        } catch (e: Exception) {
            Result.failure(Exception("Couldn't reach ZRP. Check your connection and try again."))
        }
    }

    suspend fun rejectWithdrawal(id: String): Result<Unit> {
        return try {
            ApiClient.adminApi.rejectWithdrawal(id)
            Result.success(Unit)
        } catch (e: HttpException) {
            Result.failure(Exception(e.zrpErrorMessage() ?: "Failed to reject this withdrawal."))
        } catch (e: Exception) {
            Result.failure(Exception("Couldn't reach ZRP. Check your connection and try again."))
        }
    }

    // ─── Upgrade requests (ADMIN only, server-side) ──────────────────
    suspend fun getUpgradeRequests(status: String): Result<List<AdminUpgradeRequest>> = runCatching {
        ApiClient.adminApi.getUpgradeRequests(status)
    }

    // action is "approve" or "deny" - see AdminApi's own note.
    suspend fun reviewUpgradeRequest(id: String, action: String): Result<Unit> {
        return try {
            ApiClient.adminApi.reviewUpgradeRequest(id, UpgradeRequestActionRequest(action))
            Result.success(Unit)
        } catch (e: HttpException) {
            Result.failure(Exception(e.zrpErrorMessage() ?: "Failed to process this request."))
        } catch (e: Exception) {
            Result.failure(Exception("Couldn't reach ZRP. Check your connection and try again."))
        }
    }

    // ─── ZRP News CMS (STAFF, server-side) ───────────────────────────
    // requireStaff, not requireAdmin - a MODERATOR really can run the
    // News desk, same as reports/posts/appeals (see AdminApi's own
    // note), so nothing here is gated client-side either.
    suspend fun getNewsArticles(
        status: String,
        category: String,
        search: String,
        page: Int,
        limit: Int,
    ): Result<AdminNewsResponse> = runCatching {
        ApiClient.adminApi.getNewsArticles(status, category, search, page, limit)
    }

    // The route 409s on a slug another article already owns and 400s on
    // an authorId that isn't a real user - both messages name the exact
    // problem and have to reach the editor verbatim, which is why
    // zrpErrorMessage() leads here as it does for every other write.
    suspend fun createNewsArticle(request: SaveNewsArticleRequest): Result<Unit> {
        return try {
            ApiClient.adminApi.createNewsArticle(request)
            Result.success(Unit)
        } catch (e: HttpException) {
            Result.failure(Exception(e.zrpErrorMessage() ?: "Failed to create this article."))
        } catch (e: Exception) {
            Result.failure(Exception("Couldn't reach ZRP. Check your connection and try again."))
        }
    }

    suspend fun updateNewsArticle(id: String, request: SaveNewsArticleRequest): Result<Unit> {
        return try {
            ApiClient.adminApi.updateNewsArticle(id, request)
            Result.success(Unit)
        } catch (e: HttpException) {
            Result.failure(Exception(e.zrpErrorMessage() ?: "Failed to update this article."))
        } catch (e: Exception) {
            Result.failure(Exception("Couldn't reach ZRP. Check your connection and try again."))
        }
    }

    // status is "PUBLISHED" (approve) or "REJECTED" (send back);
    // reviewNote is left null on approve so the route never touches the
    // stored note - see ReviewNewsArticleRequest's own KDoc.
    suspend fun reviewNewsArticle(id: String, status: String, reviewNote: String?): Result<Unit> {
        return try {
            ApiClient.adminApi.reviewNewsArticle(id, ReviewNewsArticleRequest(status, reviewNote))
            Result.success(Unit)
        } catch (e: HttpException) {
            Result.failure(Exception(e.zrpErrorMessage() ?: "Failed to review this article."))
        } catch (e: Exception) {
            Result.failure(Exception("Couldn't reach ZRP. Check your connection and try again."))
        }
    }

    suspend fun deleteNewsArticle(id: String): Result<Unit> {
        return try {
            ApiClient.adminApi.deleteNewsArticle(id)
            Result.success(Unit)
        } catch (e: HttpException) {
            Result.failure(Exception(e.zrpErrorMessage() ?: "Failed to delete this article."))
        } catch (e: Exception) {
            Result.failure(Exception("Couldn't reach ZRP. Check your connection and try again."))
        }
    }

    // ─── Plan management (ADMIN only, server-side) ───────────────────
    suspend fun updateUserPlan(userId: String, plan: String): Result<AdminUserPlanResponse> {
        return try {
            Result.success(ApiClient.adminApi.updateUserPlan(userId, UpdateUserPlanRequest(plan)))
        } catch (e: HttpException) {
            Result.failure(Exception(e.zrpErrorMessage() ?: "Failed to update this user's plan."))
        } catch (e: Exception) {
            Result.failure(Exception("Couldn't reach ZRP. Check your connection and try again."))
        }
    }
}
