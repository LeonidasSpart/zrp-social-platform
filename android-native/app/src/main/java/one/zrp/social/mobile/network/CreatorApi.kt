package one.zrp.social.mobile.network

import retrofit2.http.Body
import retrofit2.http.GET
import retrofit2.http.PATCH
import retrofit2.http.POST

// Every money field here is a Prisma Decimal(18, 6) server-side, but
// src/lib/serialize-decimal.ts's jsonWithDecimals converts every one
// of them to a plain JSON number before the response is sent - the
// precision-safe Decimal math stays entirely server-side, the wire
// shape has always been (and stays) a plain number.

data class CreatorProfileUser(
    val id: String,
    val username: String,
    val name: String?,
    val avatarUrl: String?,
    val plan: String,
)

data class CreatorProfile(
    val id: String,
    val userId: String,
    val tipsEnabled: Boolean,
    val tipsMessage: String?,
    val premiumPostsEnabled: Boolean,
    val totalTips: Double,
    val totalPremiumRevenue: Double,
    val totalEarnings: Double,
    val totalWithdrawn: Double,
    val balance: Double,
    val user: CreatorProfileUser? = null,
)

// GET /api/creator/profile: profile is null and isEligible is false
// for a free/pro account (Business/Enterprise-only, matching
// src/lib/limits.ts's own charityContribution/creator gating tier) -
// that's the real, non-error "not eligible yet" case, distinct from
// an actual network/auth failure. The route auto-creates the profile
// row on first real fetch for an eligible account that doesn't have
// one yet, so this same call both checks eligibility and provisions
// the profile - no separate "enable monetisation" call needed.
data class CreatorProfileResponse(
    val profile: CreatorProfile?,
    val isEligible: Boolean,
    val message: String? = null,
)

data class UpdateCreatorProfileRequest(
    val tipsEnabled: Boolean? = null,
    val tipsMessage: String? = null,
    val premiumPostsEnabled: Boolean? = null,
)

data class UpdateCreatorProfileResponse(val profile: CreatorProfile)

data class CreatorTipSender(val id: String, val username: String, val name: String?, val avatarUrl: String?)

data class CreatorTip(
    val id: String,
    val amount: Double,
    val message: String?,
    val createdAt: String,
    val sender: CreatorTipSender,
)

data class CreatorPremiumPostRef(val id: String, val content: String, val createdAt: String)

data class CreatorPremiumPost(
    val id: String,
    val price: Double,
    val totalPurchases: Int,
    val createdAt: String,
    val post: CreatorPremiumPostRef,
)

data class CreatorPurchaseUser(val id: String, val username: String, val name: String?, val avatarUrl: String?)
data class CreatorPurchasePostRef(val postId: String)

data class CreatorPurchase(
    val id: String,
    val amount: Double,
    val createdAt: String,
    val user: CreatorPurchaseUser,
    val premiumPost: CreatorPurchasePostRef,
)

data class CreatorDashboardStats(
    val totalEarnings: Double,
    val balance: Double,
    val totalTips: Double,
    val totalPremiumRevenue: Double,
    val totalWithdrawn: Double,
    val totalPurchases: Int,
)

data class CreatorDashboardResponse(
    val profile: CreatorProfile,
    val recentTips: List<CreatorTip>,
    val premiumPosts: List<CreatorPremiumPost>,
    val recentPurchases: List<CreatorPurchase>,
    val stats: CreatorDashboardStats,
)

data class CreatorTopPostCounts(val likes: Int, val comments: Int, val reposts: Int)

data class CreatorTopPost(
    val id: String,
    val content: String,
    val imageUrl: String?,
    val createdAt: String,
    val views: Int,
    val _count: CreatorTopPostCounts,
    val score: Int,
)

data class CreatorEngagementDay(val date: String, val likes: Int, val comments: Int, val reposts: Int, val total: Int)

data class CreatorContentTotals(val views: Int, val likes: Int, val comments: Int, val reposts: Int, val postCount: Int)

data class CreatorContentSection(
    val topPosts: List<CreatorTopPost>,
    val engagementTrend: List<CreatorEngagementDay>,
    val totals: CreatorContentTotals,
)

data class CreatorAudienceDay(val date: String, val newFollowers: Int, val totalFollowers: Int)

data class CreatorAudienceSection(
    val totalFollowers: Int,
    val newFollowersInWindow: Int,
    val trend: List<CreatorAudienceDay>,
)

data class CreatorStudioResponse(val content: CreatorContentSection, val audience: CreatorAudienceSection)

data class CreatorWithdrawRequest(val amount: Double, val walletAddress: String)

data class CreatorWithdrawal(val id: String, val amount: Double, val walletAddress: String, val status: String)

data class CreatorWithdrawResponse(val withdrawal: CreatorWithdrawal, val message: String)

/**
 * ZRP Creator Studio - the real /api/creator/* routes the website's
 * own /creator/dashboard page uses: eligibility + profile
 * (Business/Enterprise plan gated, matching src/lib/limits.ts),
 * earnings dashboard, 30-day content/audience analytics (the same
 * real data src/app/api/creator/studio/route.ts computes), and
 * requesting a payout of already-earned balance.
 *
 * Deliberately does NOT wrap POST /creator/tip (sending a tip) or
 * POST /creator/premium-purchase (buying a premium post). Per
 * src/lib/native-payment-policy.ts's own documented reasoning (Apple
 * 3.1.1 / Google Play Payments), this codebase has never built a
 * crypto money-payment flow into the native Android app - not Tips,
 * not Premium purchase, not the plan-upgrade flow, not Aid
 * contributions, and now not tip-sending or premium-post purchasing
 * here either (see AidRepository's own KDoc for the same reasoning
 * applied to /help/{id}/contribute). Both of those server routes
 * independently enforce this via rejectNativePayment() regardless of
 * what any client sends, so this is belt-and-suspenders, not the only
 * guard.
 *
 * Requesting a withdrawal (a creator cashing out earnings the
 * platform already credited them) is NOT payment-restricted - it's a
 * payout, not a purchase, exactly like Aid's own withdrawal request -
 * so it's fully wrapped here. Likewise, creating a premium post
 * (POST /api/creator/premium-post - a creator pricing their own post)
 * is not itself a payment and isn't native-payment-gated server-side
 * either, but it has no reachable trigger anywhere on the website's
 * own UI today (confirmed by search - the dashboard only ever lists
 * premium posts, never creates one), so it isn't wrapped here: there
 * is no real feature on web to bring parity to yet.
 */
interface CreatorApi {
    @GET("creator/profile")
    suspend fun getProfile(): CreatorProfileResponse

    @PATCH("creator/profile")
    suspend fun updateProfile(@Body request: UpdateCreatorProfileRequest): UpdateCreatorProfileResponse

    @GET("creator/dashboard")
    suspend fun getDashboard(): CreatorDashboardResponse

    @GET("creator/studio")
    suspend fun getStudio(): CreatorStudioResponse

    @POST("creator/withdraw")
    suspend fun withdraw(@Body request: CreatorWithdrawRequest): CreatorWithdrawResponse
}
