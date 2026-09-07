package one.zrp.social.mobile.network

import retrofit2.http.Body
import retrofit2.http.DELETE
import retrofit2.http.GET
import retrofit2.http.PUT
import retrofit2.http.Path
import retrofit2.http.POST
import retrofit2.http.Query

// The same 11 real opportunity types as src/lib/opportunity.ts's own
// OPPORTUNITY_TYPES - kept as plain strings matching the wire values
// verbatim, same convention as MARKETPLACE_CATEGORIES.
val OPPORTUNITY_TYPES = listOf(
    "JOB", "REMOTE", "INTERNSHIP", "SCHOLARSHIP", "MENTORSHIP", "FREELANCE",
    "PARTNERSHIP", "SPONSORSHIP", "HACKATHON", "TRAINING", "COLLABORATION",
)

data class OpportunityPoster(
    val id: String,
    val username: String,
    val name: String? = null,
    val avatarUrl: String? = null,
    val badgeType: String? = null,
)

data class OpportunityApplicationCount(val applications: Int = 0)

data class OpportunitySummary(
    val id: String,
    val type: String,
    val title: String,
    val description: String,
    val organizationName: String? = null,
    val skills: List<String> = emptyList(),
    val location: String? = null,
    val remote: Boolean = false,
    val isPaid: Boolean = true,
    val compensationInfo: String? = null,
    val externalUrl: String? = null,
    val deadline: String? = null,
    // Only present on GET /opportunity/my-listings (a poster's own
    // dashboard, where a listing can be PENDING_REVIEW/REJECTED/etc,
    // not just ACTIVE) - the public browse response never includes a
    // non-ACTIVE listing at all, so this stays null there.
    val status: String? = null,
    val rejectionReason: String? = null,
    val views: Int = 0,
    val createdAt: String,
    val poster: OpportunityPoster? = null,
    val _count: OpportunityApplicationCount = OpportunityApplicationCount(),
)

data class OpportunityListingsPage(
    val listings: List<OpportunitySummary>,
    val nextCursor: String?,
)

// GET /opportunity/{id} returns the raw Prisma row (posterId included
// directly, not just the poster relation) plus alreadyApplied, computed
// server-side from the caller's own session.
data class OpportunityDetail(
    val id: String,
    val type: String,
    val title: String,
    val description: String,
    val organizationName: String? = null,
    val skills: List<String> = emptyList(),
    val location: String? = null,
    val remote: Boolean = false,
    val isPaid: Boolean = true,
    val compensationInfo: String? = null,
    val externalUrl: String? = null,
    val deadline: String? = null,
    val status: String? = null,
    val rejectionReason: String? = null,
    val views: Int = 0,
    val createdAt: String,
    val posterId: String,
    val poster: OpportunityPoster? = null,
    val alreadyApplied: Boolean = false,
    val _count: OpportunityApplicationCount = OpportunityApplicationCount(),
)

data class OpportunityDetailResponse(val listing: OpportunityDetail)

data class ToggleSaveResponse(val success: Boolean, val saved: Boolean)

data class OpportunityWriteRequest(
    val type: String,
    val title: String,
    val description: String,
    val organizationName: String?,
    val skills: List<String>,
    val location: String?,
    val remote: Boolean,
    val isPaid: Boolean,
    val compensationInfo: String?,
    val externalUrl: String?,
    val deadline: String?,
    // Only sent on an update, to close/reopen a live listing - omitted
    // (null) on create.
    val status: String? = null,
)

data class OpportunityWriteResponse(val listing: OpportunitySummary)

data class ApplyRequest(val coverNote: String?, val resumeUrl: String?)

data class OpportunityApplication(
    val id: String,
    val listingId: String,
    val applicantId: String,
    val coverNote: String? = null,
    val resumeUrl: String? = null,
    val status: String,
    val createdAt: String,
    // Only present on GET /opportunity/{id}/applications (poster
    // reviewing applicants for one listing).
    val applicant: OpportunityPoster? = null,
    // Only present on GET /opportunity/my-applications (an applicant's
    // own submissions across every listing).
    val listing: OpportunityApplicationListingRef? = null,
)

data class OpportunityApplicationListingRef(
    val id: String,
    val type: String,
    val title: String,
    val organizationName: String?,
    val status: String,
)

data class ApplyResponse(val application: OpportunityApplication)

data class OpportunityApplicationsPage(
    val applications: List<OpportunityApplication>,
    val nextCursor: String?,
)

data class UpdateApplicationStatusRequest(val status: String)

data class UpdateApplicationStatusResponse(val application: OpportunityApplication)

/**
 * ZRP OPPORTUNITY - the same real GET/POST /opportunity, GET/PUT/DELETE
 * /opportunity/{id}, POST/DELETE /opportunity/{id}/save, POST
 * /opportunity/{id}/apply, GET /opportunity/{id}/applications, GET
 * /opportunity/my-listings, GET /opportunity/my-applications, and PUT
 * /opportunity/applications/{id} routes the website's OPPORTUNITY pages use.
 */
interface OpportunityApi {
    @GET("opportunity")
    suspend fun getListings(
        @Query("cursor") cursor: String? = null,
        @Query("limit") limit: Int = 20,
        @Query("type") type: String? = null,
        @Query("remote") remote: String? = null,
        @Query("q") search: String? = null,
    ): OpportunityListingsPage

    @GET("opportunity/{id}")
    suspend fun getListing(@Path("id") id: String): OpportunityDetailResponse

    @POST("opportunity")
    suspend fun createListing(@Body request: OpportunityWriteRequest): OpportunityWriteResponse

    @PUT("opportunity/{id}")
    suspend fun updateListing(@Path("id") id: String, @Body request: OpportunityWriteRequest): OpportunityWriteResponse

    @DELETE("opportunity/{id}")
    suspend fun deleteListing(@Path("id") id: String)

    @POST("opportunity/{id}/save")
    suspend fun saveListing(@Path("id") id: String): ToggleSaveResponse

    @DELETE("opportunity/{id}/save")
    suspend fun unsaveListing(@Path("id") id: String): ToggleSaveResponse

    @POST("opportunity/{id}/apply")
    suspend fun apply(@Path("id") id: String, @Body request: ApplyRequest): ApplyResponse

    @GET("opportunity/{id}/applications")
    suspend fun getApplicants(
        @Path("id") id: String,
        @Query("cursor") cursor: String? = null,
        @Query("limit") limit: Int = 20,
    ): OpportunityApplicationsPage

    @GET("opportunity/my-listings")
    suspend fun getMyListings(
        @Query("cursor") cursor: String? = null,
        @Query("limit") limit: Int = 20,
    ): OpportunityListingsPage

    @GET("opportunity/my-applications")
    suspend fun getMyApplications(
        @Query("cursor") cursor: String? = null,
        @Query("limit") limit: Int = 20,
    ): OpportunityApplicationsPage

    @PUT("opportunity/applications/{id}")
    suspend fun updateApplicationStatus(
        @Path("id") id: String,
        @Body request: UpdateApplicationStatusRequest,
    ): UpdateApplicationStatusResponse
}
