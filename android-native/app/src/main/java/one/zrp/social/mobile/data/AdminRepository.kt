package one.zrp.social.mobile.data

import android.content.ContentResolver
import android.net.Uri
import one.zrp.social.mobile.network.AdminAdsResponse
import one.zrp.social.mobile.network.AdminAppealsResponse
import one.zrp.social.mobile.network.AdminHelpResponse
import one.zrp.social.mobile.network.AdminJournalistsResponse
import one.zrp.social.mobile.network.AdminMarketplaceResponse
import one.zrp.social.mobile.network.AdminMusicArtistsResponse
import one.zrp.social.mobile.network.AdminNewsCycleResult
import one.zrp.social.mobile.network.AdminNewsFeedsResponse
import one.zrp.social.mobile.network.AdminNewsNetworkStatusResponse
import one.zrp.social.mobile.network.AdminNewsProvisionResponse
import one.zrp.social.mobile.network.AdminNewsPublicationsResponse
import one.zrp.social.mobile.network.AdminNewsResponse
import one.zrp.social.mobile.network.AdminNewsSeedResponse
import one.zrp.social.mobile.network.AdminNewsSourceVerifyResponse
import one.zrp.social.mobile.network.AdminNewsSourcesResponse
import one.zrp.social.mobile.network.AdminNewsStoriesResponse
import one.zrp.social.mobile.network.AdminOpportunityResponse
import one.zrp.social.mobile.network.AdminPaymentRequest
import one.zrp.social.mobile.network.AdminPostsResponse
import one.zrp.social.mobile.network.AdminReport
import one.zrp.social.mobile.network.AdminReportsResponse
import one.zrp.social.mobile.network.AdminStats
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
import one.zrp.social.mobile.network.NewsStoryActionRequest
import one.zrp.social.mobile.network.ProvisionNewsFeedsRequest
import one.zrp.social.mobile.network.RemoveNewsPublicationRequest
import one.zrp.social.mobile.network.ResolveAppealRequest
import one.zrp.social.mobile.network.ResolveTicketRequest
import one.zrp.social.mobile.network.ReviewAdRequest
import one.zrp.social.mobile.network.ReviewNewsArticleRequest
import one.zrp.social.mobile.network.ReviewSubmissionRequest
import one.zrp.social.mobile.network.SaveNewsArticleRequest
import one.zrp.social.mobile.network.ToggleBanResponse
import one.zrp.social.mobile.network.UpdateNewsAutomationRequest
import one.zrp.social.mobile.network.UpdateNewsFeedRequest
import one.zrp.social.mobile.network.UpdateNewsSourceRequest
import one.zrp.social.mobile.network.UpdateReportRequest
import one.zrp.social.mobile.network.UpdateSupportTicketRequest
import one.zrp.social.mobile.network.UpdateUserPlanRequest
import one.zrp.social.mobile.network.UpdateUserRoleRequest
import one.zrp.social.mobile.network.UpgradeRequestActionRequest
import one.zrp.social.mobile.network.VerifyArtistRequest
import one.zrp.social.mobile.network.VerifyPaymentRequest
import one.zrp.social.mobile.network.buildNamedFileMultipart
import one.zrp.social.mobile.network.zrpErrorMessage
import retrofit2.HttpException

/**
 * The native surface onto the exact same /api/admin routes the
 * website's own /admin pages call - see AdminApi's own KDoc. Every
 * write here can still 401/403 server-side regardless of what the
 * calling screen shows (requireStaff for stats/reports/users-list/
 * posts, requireAdmin for role changes, plan changes, user deletion,
 * every support-ticket call and every financial call below) - the
 * Settings entry point and in-screen role gating exist only to keep a
 * MODERATOR (or lower) from being shown controls the server would
 * reject anyway, never as the actual authorization boundary.
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

    // ─── News Network (reads staff-wide, every write ADMIN-only) ─────
    // The five reads the console opens with are requireStaff; every
    // write below is requireAdmin server-side (see AdminApi's own note),
    // so a MODERATOR who somehow reached this screen would still be
    // refused by the route on any action.
    suspend fun getNewsNetworkStatus(): Result<AdminNewsNetworkStatusResponse> = runCatching {
        ApiClient.adminApi.getNewsNetworkStatus()
    }

    suspend fun getNewsNetworkFeeds(): Result<AdminNewsFeedsResponse> = runCatching {
        ApiClient.adminApi.getNewsNetworkFeeds()
    }

    suspend fun getNewsNetworkSources(): Result<AdminNewsSourcesResponse> = runCatching {
        ApiClient.adminApi.getNewsNetworkSources()
    }

    suspend fun getNewsNetworkStories(limit: Int): Result<AdminNewsStoriesResponse> = runCatching {
        ApiClient.adminApi.getNewsNetworkStories(limit)
    }

    suspend fun getNewsNetworkPublications(limit: Int): Result<AdminNewsPublicationsResponse> = runCatching {
        ApiClient.adminApi.getNewsNetworkPublications(limit)
    }

    suspend fun setNewsAutomationPaused(paused: Boolean): Result<Unit> {
        return try {
            ApiClient.adminApi.updateNewsAutomation(UpdateNewsAutomationRequest(paused))
            Result.success(Unit)
        } catch (e: HttpException) {
            Result.failure(Exception(e.zrpErrorMessage() ?: "Failed to update the automation setting."))
        } catch (e: Exception) {
            Result.failure(Exception("Couldn't reach ZRP. Check your connection and try again."))
        }
    }

    // 429s once four manual cycles have been run in an hour, and that
    // message ("Too many requests...") is exactly what the admin needs
    // to see - hence zrpErrorMessage ahead of the fallback, as
    // everywhere else. A 200 can still carry ran=false with a reason
    // (paused, or another cycle holds the lock), which is a real result
    // the caller reports rather than an error.
    suspend fun runNewsNetworkCycle(): Result<AdminNewsCycleResult> {
        return try {
            Result.success(ApiClient.adminApi.runNewsNetworkCycle().result)
        } catch (e: HttpException) {
            Result.failure(Exception(e.zrpErrorMessage() ?: "The cycle failed to run."))
        } catch (e: Exception) {
            Result.failure(Exception("Couldn't reach ZRP. Check your connection and try again."))
        }
    }

    // scope is "pilot" or "all". Both create every feed DISABLED, and
    // re-running is safe: existing feeds are refreshed without losing an
    // admin's enable/disable or cadence choices.
    suspend fun provisionNewsFeeds(scope: String): Result<AdminNewsProvisionResponse> {
        return try {
            Result.success(ApiClient.adminApi.provisionNewsFeeds(ProvisionNewsFeedsRequest(scope)))
        } catch (e: HttpException) {
            Result.failure(Exception(e.zrpErrorMessage() ?: "Failed to provision the editorial feeds."))
        } catch (e: Exception) {
            Result.failure(Exception("Couldn't reach ZRP. Check your connection and try again."))
        }
    }

    suspend fun setNewsFeedEnabled(feedId: String, enabled: Boolean): Result<Unit> {
        return try {
            ApiClient.adminApi.updateNewsFeed(feedId, UpdateNewsFeedRequest(enabled))
            Result.success(Unit)
        } catch (e: HttpException) {
            Result.failure(Exception(e.zrpErrorMessage() ?: "Failed to update this feed."))
        } catch (e: Exception) {
            Result.failure(Exception("Couldn't reach ZRP. Check your connection and try again."))
        }
    }

    // field is "avatarFile" or "coverFile" - the route decides which
    // image it is from which form field arrives, so this is passed
    // through rather than inferred anywhere else.
    suspend fun uploadNewsFeedImage(
        feedId: String,
        contentResolver: ContentResolver,
        uri: Uri,
        field: String,
    ): Result<Unit> {
        return try {
            ApiClient.adminApi.uploadNewsFeedImage(feedId, buildNamedFileMultipart(contentResolver, uri, field))
            Result.success(Unit)
        } catch (e: HttpException) {
            // The route's own validation messages (wrong type, over 5MB)
            // are the useful ones here.
            Result.failure(Exception(e.zrpErrorMessage() ?: "That upload failed."))
        } catch (e: Exception) {
            Result.failure(Exception("Couldn't reach ZRP. Check your connection and try again."))
        }
    }

    suspend fun seedNewsSources(): Result<AdminNewsSeedResponse> {
        return try {
            Result.success(ApiClient.adminApi.seedNewsSources())
        } catch (e: HttpException) {
            Result.failure(Exception(e.zrpErrorMessage() ?: "Failed to install the starter sources."))
        } catch (e: Exception) {
            Result.failure(Exception("Couldn't reach ZRP. Check your connection and try again."))
        }
    }

    suspend fun setNewsSourceEnabled(sourceId: String, enabled: Boolean): Result<Unit> {
        return try {
            ApiClient.adminApi.updateNewsSource(sourceId, UpdateNewsSourceRequest(enabled = enabled))
            Result.success(Unit)
        } catch (e: HttpException) {
            Result.failure(Exception(e.zrpErrorMessage() ?: "Failed to update this source."))
        } catch (e: Exception) {
            Result.failure(Exception("Couldn't reach ZRP. Check your connection and try again."))
        }
    }

    suspend fun clearNewsSourceBackoff(sourceId: String): Result<Unit> {
        return try {
            ApiClient.adminApi.updateNewsSource(sourceId, UpdateNewsSourceRequest(clearBackoff = true))
            Result.success(Unit)
        } catch (e: HttpException) {
            Result.failure(Exception(e.zrpErrorMessage() ?: "Failed to clear the backoff."))
        } catch (e: Exception) {
            Result.failure(Exception("Couldn't reach ZRP. Check your connection and try again."))
        }
    }

    // A failed verification comes back as a 200 with ok=false, so this
    // succeeds with the report and lets the caller present it - only a
    // transport/auth failure is a Result.failure here.
    suspend fun verifyNewsSource(sourceId: String): Result<AdminNewsSourceVerifyResponse> {
        return try {
            Result.success(ApiClient.adminApi.verifyNewsSource(sourceId))
        } catch (e: HttpException) {
            Result.failure(Exception(e.zrpErrorMessage() ?: "Verification failed."))
        } catch (e: Exception) {
            Result.failure(Exception("Couldn't reach ZRP. Check your connection and try again."))
        }
    }

    suspend fun rejectNewsStory(storyId: String, reason: String): Result<Unit> {
        return try {
            ApiClient.adminApi.updateNewsStory(storyId, NewsStoryActionRequest(action = "reject", reason = reason))
            Result.success(Unit)
        } catch (e: HttpException) {
            Result.failure(Exception(e.zrpErrorMessage() ?: "Failed to reject this story."))
        } catch (e: Exception) {
            Result.failure(Exception("Couldn't reach ZRP. Check your connection and try again."))
        }
    }

    // The note is appended visibly to every live post for the story
    // rather than the original being rewritten, so this changes what
    // readers already saw - never fired without a confirmation.
    suspend fun correctNewsStory(storyId: String, note: String): Result<Unit> {
        return try {
            ApiClient.adminApi.updateNewsStory(storyId, NewsStoryActionRequest(action = "correct", note = note))
            Result.success(Unit)
        } catch (e: HttpException) {
            Result.failure(Exception(e.zrpErrorMessage() ?: "Failed to publish the correction."))
        } catch (e: Exception) {
            Result.failure(Exception("Couldn't reach ZRP. Check your connection and try again."))
        }
    }

    suspend fun removeNewsPublication(publicationId: String, reason: String): Result<Unit> {
        return try {
            ApiClient.adminApi.removeNewsPublication(publicationId, RemoveNewsPublicationRequest(reason))
            Result.success(Unit)
        } catch (e: HttpException) {
            Result.failure(Exception(e.zrpErrorMessage() ?: "Failed to remove this post."))
        } catch (e: Exception) {
            Result.failure(Exception("Couldn't reach ZRP. Check your connection and try again."))
        }
    }
}
