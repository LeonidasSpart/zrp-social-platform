package one.zrp.social.mobile.data

import one.zrp.social.mobile.network.ApiClient
import one.zrp.social.mobile.network.ApplyRequest
import one.zrp.social.mobile.network.CreateReportRequest
import one.zrp.social.mobile.network.OpportunityApplication
import one.zrp.social.mobile.network.OpportunityApplicationsPage
import one.zrp.social.mobile.network.OpportunityDetail
import one.zrp.social.mobile.network.OpportunityListingsPage
import one.zrp.social.mobile.network.OpportunitySummary
import one.zrp.social.mobile.network.OpportunityWriteRequest
import one.zrp.social.mobile.network.UpdateApplicationStatusRequest

/**
 * ZRP OPPORTUNITY - the same real /opportunity routes the website's
 * OPPORTUNITY pages use: browse/search/apply/save for job seekers, plus
 * create/edit/delete/applicants management for posters.
 */
class OpportunityRepository {
    suspend fun getOwnUserId(): Result<String?> = runCatching {
        ApiClient.authApi.getSession().user?.id
    }

    suspend fun getListings(
        cursor: String? = null,
        type: String? = null,
        remoteOnly: Boolean = false,
        search: String? = null,
    ): Result<OpportunityListingsPage> = runCatching {
        ApiClient.opportunityApi.getListings(
            cursor = cursor,
            type = type,
            remote = if (remoteOnly) "true" else null,
            search = search?.trim()?.takeIf { it.isNotEmpty() },
        )
    }

    suspend fun getListing(id: String): Result<OpportunityDetail> = runCatching {
        ApiClient.opportunityApi.getListing(id).listing
    }

    suspend fun createListing(
        type: String,
        title: String,
        description: String,
        organizationName: String?,
        skills: List<String>,
        location: String?,
        remote: Boolean,
        isPaid: Boolean,
        compensationInfo: String?,
        externalUrl: String?,
        deadline: String?,
    ): Result<OpportunitySummary> = runCatching {
        ApiClient.opportunityApi.createListing(
            OpportunityWriteRequest(
                type = type,
                title = title,
                description = description,
                organizationName = organizationName,
                skills = skills,
                location = location,
                remote = remote,
                isPaid = isPaid,
                compensationInfo = compensationInfo,
                externalUrl = externalUrl,
                deadline = deadline,
            ),
        ).listing
    }

    suspend fun updateListing(
        id: String,
        type: String,
        title: String,
        description: String,
        organizationName: String?,
        skills: List<String>,
        location: String?,
        remote: Boolean,
        isPaid: Boolean,
        compensationInfo: String?,
        externalUrl: String?,
        deadline: String?,
        status: String? = null,
    ): Result<OpportunitySummary> = runCatching {
        ApiClient.opportunityApi.updateListing(
            id,
            OpportunityWriteRequest(
                type = type,
                title = title,
                description = description,
                organizationName = organizationName,
                skills = skills,
                location = location,
                remote = remote,
                isPaid = isPaid,
                compensationInfo = compensationInfo,
                externalUrl = externalUrl,
                deadline = deadline,
                status = status,
            ),
        ).listing
    }

    suspend fun deleteListing(id: String): Result<Unit> = runCatching {
        ApiClient.opportunityApi.deleteListing(id)
    }

    suspend fun setSaved(id: String, saved: Boolean): Result<Boolean> = runCatching {
        if (saved) {
            ApiClient.opportunityApi.saveListing(id).saved
        } else {
            ApiClient.opportunityApi.unsaveListing(id).saved
        }
    }

    suspend fun apply(id: String, coverNote: String?, resumeUrl: String?): Result<OpportunityApplication> = runCatching {
        ApiClient.opportunityApi.apply(id, ApplyRequest(coverNote = coverNote, resumeUrl = resumeUrl)).application
    }

    suspend fun getApplicants(listingId: String, cursor: String? = null): Result<OpportunityApplicationsPage> = runCatching {
        ApiClient.opportunityApi.getApplicants(listingId, cursor)
    }

    suspend fun getMyListings(cursor: String? = null): Result<OpportunityListingsPage> = runCatching {
        ApiClient.opportunityApi.getMyListings(cursor)
    }

    suspend fun getMyApplications(cursor: String? = null): Result<OpportunityApplicationsPage> = runCatching {
        ApiClient.opportunityApi.getMyApplications(cursor)
    }

    suspend fun updateApplicationStatus(applicationId: String, status: String): Result<OpportunityApplication> = runCatching {
        ApiClient.opportunityApi.updateApplicationStatus(applicationId, UpdateApplicationStatusRequest(status)).application
    }

    suspend fun reportOpportunity(opportunityId: String, reason: String, details: String?): Result<Unit> = runCatching {
        ApiClient.reportsApi.createReport(CreateReportRequest(opportunityId = opportunityId, reason = reason, details = details))
    }
}
