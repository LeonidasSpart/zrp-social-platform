package one.zrp.social.mobile.data

import one.zrp.social.mobile.network.AdminAdsResponse
import one.zrp.social.mobile.network.AdminAppealsResponse
import one.zrp.social.mobile.network.AdminHelpResponse
import one.zrp.social.mobile.network.AdminJournalistsResponse
import one.zrp.social.mobile.network.AdminMarketplaceResponse
import one.zrp.social.mobile.network.AdminMusicArtistsResponse
import one.zrp.social.mobile.network.AdminOpportunityResponse
import one.zrp.social.mobile.network.AdminPostsResponse
import one.zrp.social.mobile.network.AdminReport
import one.zrp.social.mobile.network.AdminReportsResponse
import one.zrp.social.mobile.network.AdminStats
import one.zrp.social.mobile.network.AdminUser
import one.zrp.social.mobile.network.AdminUsersResponse
import one.zrp.social.mobile.network.ApiClient
import one.zrp.social.mobile.network.GrantJournalistRequest
import one.zrp.social.mobile.network.JournalistActionRequest
import one.zrp.social.mobile.network.ResolveAppealRequest
import one.zrp.social.mobile.network.ReviewAdRequest
import one.zrp.social.mobile.network.ReviewSubmissionRequest
import one.zrp.social.mobile.network.ToggleBanResponse
import one.zrp.social.mobile.network.UpdateReportRequest
import one.zrp.social.mobile.network.UpdateUserRoleRequest
import one.zrp.social.mobile.network.VerifyArtistRequest
import one.zrp.social.mobile.network.zrpErrorMessage
import retrofit2.HttpException

/**
 * The native surface onto the exact same /api/admin routes the
 * website's own /admin pages call - see AdminApi's own KDoc. Every
 * write here can still 401/403 server-side regardless of what the
 * calling screen shows (requireStaff for stats/reports/users-list/
 * posts, requireAdmin for role changes and user deletion) - the
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
}
