package one.zrp.social.mobile.network

import retrofit2.http.Body
import retrofit2.http.GET
import retrofit2.http.PUT
import retrofit2.http.Path
import retrofit2.http.POST
import retrofit2.http.Query

// The same 5 real categories and 4 real need types as src/lib/help.ts's
// own HELP_CATEGORIES/HELP_NEED_TYPES - kept as plain strings matching
// the wire values verbatim, same convention as MARKETPLACE_CATEGORIES
// and OPPORTUNITY_TYPES.
val HELP_CATEGORIES = listOf("WAR", "DISASTER", "POVERTY", "EMERGENCY", "OTHER")
val HELP_NEED_TYPES = listOf("MONEY", "SUPPLIES", "SKILLS", "VOLUNTEERS")

data class HelpOrganizer(
    val id: String,
    val username: String,
    val name: String? = null,
    val avatarUrl: String? = null,
    val badgeType: String? = null,
)

data class HelpCampaignCount(val contributions: Int = 0, val offers: Int = 0)

data class HelpCampaignSummary(
    val id: String,
    val category: String,
    val needTypes: List<String> = emptyList(),
    val title: String,
    val description: String,
    val location: String? = null,
    val goalAmount: Double? = null,
    val currency: String,
    val raisedAmount: Double = 0.0,
    val imageUrls: List<String> = emptyList(),
    // Only present on GET /help/my-campaigns (an organizer's own
    // dashboard, where a campaign can be PENDING_REVIEW/REJECTED/etc,
    // not just ACTIVE) - the public browse response never includes a
    // non-ACTIVE campaign at all, so this stays null there.
    val status: String? = null,
    val rejectionReason: String? = null,
    val views: Int = 0,
    val createdAt: String,
    val organizer: HelpOrganizer? = null,
)

data class HelpCampaignsPage(val campaigns: List<HelpCampaignSummary>, val nextCursor: String?)

// GET /help/{id} returns the raw Prisma row (organizerId included
// directly) plus proofUrls, not present on the lean browse response.
data class HelpCampaignDetail(
    val id: String,
    val category: String,
    val needTypes: List<String> = emptyList(),
    val title: String,
    val description: String,
    val location: String? = null,
    val goalAmount: Double? = null,
    val currency: String,
    val raisedAmount: Double = 0.0,
    val imageUrls: List<String> = emptyList(),
    val proofUrls: List<String> = emptyList(),
    val status: String? = null,
    val rejectionReason: String? = null,
    val views: Int = 0,
    val createdAt: String,
    val organizerId: String,
    val organizer: HelpOrganizer? = null,
)

data class HelpCampaignDetailResponse(val campaign: HelpCampaignDetail)

data class CreateCampaignRequest(
    val category: String,
    val needTypes: List<String>,
    val title: String,
    val description: String,
    val location: String?,
    val goalAmount: Double?,
    val imageUrls: List<String>,
    val proofUrls: List<String>,
)

data class HelpCampaignWriteResponse(val campaign: HelpCampaignSummary)

data class HelpOfferRequest(val needType: String, val message: String)

data class HelpOfferer(
    val id: String,
    val username: String,
    val name: String? = null,
    val avatarUrl: String? = null,
    val badgeType: String? = null,
)

data class HelpOffer(
    val id: String,
    val campaignId: String,
    val offererId: String,
    val needType: String,
    val message: String,
    val status: String,
    val createdAt: String,
    val offerer: HelpOfferer? = null,
)

data class HelpOfferResponse(val offer: HelpOffer)

data class HelpOffersResponse(val offers: List<HelpOffer> = emptyList())

data class UpdateOfferStatusRequest(val status: String)

data class HelpWithdrawRequest(val amount: Double)

data class HelpWithdrawal(
    val id: String,
    val campaignId: String,
    val amount: Double,
    val status: String,
    val walletAddress: String,
    val createdAt: String,
)

data class HelpWithdrawResponse(val withdrawal: HelpWithdrawal, val message: String)

data class HelpMyCampaign(
    val id: String,
    val category: String,
    val needTypes: List<String> = emptyList(),
    val title: String,
    val description: String,
    val location: String? = null,
    val goalAmount: Double? = null,
    val currency: String,
    val raisedAmount: Double = 0.0,
    val imageUrls: List<String> = emptyList(),
    val status: String,
    val rejectionReason: String? = null,
    val views: Int = 0,
    val createdAt: String,
    val balance: Double = 0.0,
    val totalWithdrawn: Double = 0.0,
    val _count: HelpCampaignCount = HelpCampaignCount(),
)

data class HelpMyCampaignsPage(val campaigns: List<HelpMyCampaign>, val nextCursor: String?)

/**
 * ZRP Aid - the same real GET/POST /help, GET /help/{id}, POST
 * /help/{id}/offer, GET /help/{id}/offer, PUT /help/offers/{id}, POST
 * /help/{id}/withdraw, and GET /help/my-campaigns routes the website's
 * /aid pages use. Deliberately excludes /help/{id}/contribute - see
 * AidRepository's own note on why the money-contribution flow isn't
 * built natively.
 */
interface AidApi {
    @GET("help")
    suspend fun getCampaigns(
        @Query("cursor") cursor: String? = null,
        @Query("limit") limit: Int = 20,
        @Query("category") category: String? = null,
        @Query("needType") needType: String? = null,
    ): HelpCampaignsPage

    @POST("help")
    suspend fun createCampaign(@Body request: CreateCampaignRequest): HelpCampaignWriteResponse

    @GET("help/{id}")
    suspend fun getCampaign(@Path("id") id: String): HelpCampaignDetailResponse

    @POST("help/{id}/offer")
    suspend fun submitOffer(@Path("id") id: String, @Body request: HelpOfferRequest): HelpOfferResponse

    @GET("help/{id}/offer")
    suspend fun getOffers(@Path("id") id: String): HelpOffersResponse

    @PUT("help/offers/{id}")
    suspend fun updateOfferStatus(@Path("id") id: String, @Body request: UpdateOfferStatusRequest): HelpOfferResponse

    @POST("help/{id}/withdraw")
    suspend fun requestWithdrawal(@Path("id") id: String, @Body request: HelpWithdrawRequest): HelpWithdrawResponse

    @GET("help/my-campaigns")
    suspend fun getMyCampaigns(
        @Query("cursor") cursor: String? = null,
        @Query("limit") limit: Int = 20,
    ): HelpMyCampaignsPage
}
