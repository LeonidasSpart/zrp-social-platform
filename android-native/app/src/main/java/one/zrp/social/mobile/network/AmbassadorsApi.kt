package one.zrp.social.mobile.network

import retrofit2.http.Body
import retrofit2.http.GET
import retrofit2.http.PATCH
import retrofit2.http.Path
import retrofit2.http.Query
import retrofit2.http.POST

/**
 * ZRP Global Ambassadors - the real /api/ambassadors/ and
 * /api/admin/ambassadors routes the website's own /ambassadors,
 * /ambassadors/apply, /ambassadors/dashboard and /admin/ambassadors
 * pages use (see src/app/api/ambassadors/**/route.ts and
 * src/app/api/admin/ambassadors/**/route.ts).
 *
 * A user only ever holds a PENDING application until an admin approves
 * it - `status`/`level` here are always read fresh from this API, never
 * cached client-side as a trusted role. `countries` returns the
 * complete, unfiltered dataset (every real country, ambassadors: 0
 * included) rather than a curated subset - the same server-side
 * dataset (src/lib/ambassadors/countries.ts) the web map/explorer/
 * search all read from, so there is no separate hand-maintained
 * country list on this client either.
 */
data class AmbassadorCountry(
    val code: String,
    val name: String,
    val region: String,
    val ambassadors: Int = 0,
    val communities: Int = 0,
    val activeMembers: Int = 0,
)

data class AmbassadorCountriesResponse(
    val countries: List<AmbassadorCountry> = emptyList(),
    val total: Int = 0,
)

data class AmbassadorStatsResponse(
    val totalAmbassadors: Int = 0,
    val countriesRepresented: Int = 0,
)

data class AmbassadorProfile(
    val id: String,
    val status: String, // PENDING | APPROVED | REJECTED | SUSPENDED
    val level: String, // EXPLORER | AMBASSADOR | COMMUNITY_LEADER | GLOBAL_AMBASSADOR
    val countryCode: String,
    val cityRegion: String? = null,
    val languages: List<String> = emptyList(),
    val communityLinks: List<String> = emptyList(),
    val motivation: String,
    val communityDescription: String? = null,
    val audienceSize: Int? = null,
    val invitationCode: String,
    val rejectionReason: String? = null,
    val suspensionReason: String? = null,
    val appliedAt: String,
)

data class AmbassadorMeResponse(val profile: AmbassadorProfile? = null)

data class AmbassadorApplyRequest(
    val countryCode: String,
    val cityRegion: String?,
    val languages: List<String>,
    val communityLinks: List<String>,
    val motivation: String,
    val communityDescription: String?,
    val audienceSize: Int?,
)

data class AmbassadorApplyResponse(
    val success: Boolean = false,
    val profile: AmbassadorProfile? = null,
    val error: String? = null,
)

// Admin review queue - mirrors AdminJournalistProfile's own shape in
// AdminApi.kt. `id` here is the target user's id (PATCH .../{id} body
// below acts on it), matching the real route's own contract.
data class AdminAmbassadorUser(
    val id: String,
    val username: String,
    val name: String? = null,
    val email: String? = null,
    val avatarUrl: String? = null,
    val badgeType: String? = null,
)

data class AdminAmbassadorReviewer(val id: String, val username: String, val name: String? = null)

data class AdminAmbassadorProfile(
    val id: String,
    val status: String,
    val level: String,
    val countryCode: String,
    val countryName: String,
    val cityRegion: String? = null,
    val motivation: String,
    val audienceSize: Int? = null,
    val rejectionReason: String? = null,
    val suspensionReason: String? = null,
    val appliedAt: String,
    val user: AdminAmbassadorUser,
    val reviewedBy: AdminAmbassadorReviewer? = null,
)

data class AdminAmbassadorsPagination(
    val page: Int = 1,
    val limit: Int = 20,
    val total: Int = 0,
    val totalPages: Int = 1,
    val hasMore: Boolean = false,
)

data class AdminAmbassadorsResponse(
    val success: Boolean = false,
    val profiles: List<AdminAmbassadorProfile> = emptyList(),
    val counts: Map<String, Int> = emptyMap(),
    val pagination: AdminAmbassadorsPagination? = null,
    val error: String? = null,
)

data class AmbassadorActionRequest(val action: String, val reason: String? = null)

data class AmbassadorActionResponse(
    val success: Boolean = false,
    val profile: AdminAmbassadorProfile? = null,
    val error: String? = null,
)

interface AmbassadorsApi {
    @GET("ambassadors/countries")
    suspend fun getCountries(@Query("lang") lang: String): AmbassadorCountriesResponse

    @GET("ambassadors/stats")
    suspend fun getStats(): AmbassadorStatsResponse

    @GET("ambassadors/me")
    suspend fun getMyProfile(): AmbassadorMeResponse

    @POST("ambassadors/apply")
    suspend fun apply(@Body request: AmbassadorApplyRequest): AmbassadorApplyResponse

    @GET("admin/ambassadors")
    suspend fun getAdminProfiles(
        @Query("status") status: String?,
        @Query("search") search: String?,
        @Query("page") page: Int,
        @Query("limit") limit: Int,
    ): AdminAmbassadorsResponse

    @PATCH("admin/ambassadors/{id}")
    suspend fun updateAmbassadorStatus(
        @Path("id") userId: String,
        @Body request: AmbassadorActionRequest,
    ): AmbassadorActionResponse
}
