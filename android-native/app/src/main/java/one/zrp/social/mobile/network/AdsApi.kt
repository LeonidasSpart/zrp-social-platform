package one.zrp.social.mobile.network

import retrofit2.http.Body
import retrofit2.http.GET
import retrofit2.http.POST

// A trimmed-down Post shape, not the full Post above - GET /api/ads/serve
// (src/app/api/ads/serve/route.ts) selects only these fields, and this
// slot deliberately reuses none of PostCard's engagement machinery (see
// AdCard.tsx's own comment), so there's no need for _count/liked/etc.
data class AdPost(
    val id: String,
    val content: String,
    val imageUrl: String? = null,
    val imageUrls: List<String>? = null,
    val mediaType: String? = null,
    val author: PostAuthor,
)

data class ServedAd(
    val campaignId: String,
    val targetUrl: String?,
    val post: AdPost,
)

data class ServeAdResponse(val ad: ServedAd?)

data class AdActionRequest(val campaignId: String)

data class AdActionResponse(val logged: Boolean, val redirectUrl: String? = null)

/**
 * The one real, view-only slice of web's Ads feature that belongs in a
 * consumer mobile app: in-feed sponsored-post serving and impression/
 * click tracking (src/components/AdCard.tsx + GET /api/ads/serve, POST
 * /api/ads/impression, POST /api/ads/click). Advertiser campaign
 * creation/management (src/app/ads, src/app/ads/new - a spend-
 * commitment flow) stays out of scope under the same standing policy
 * that blocks tips/premium-post purchases/plan upgrades natively, even
 * though it's not itself a literal payment-gateway charge yet; admin ad
 * moderation (src/app/admin/ads) is a staff-only surface, not a
 * consumer gap either. Both work for a logged-out viewer on web, but
 * native only ever calls these while signed in - there's no logged-out
 * surface in this app to serve an ad into.
 */
interface AdsApi {
    @GET("ads/serve")
    suspend fun serveAd(): ServeAdResponse

    @POST("ads/impression")
    suspend fun logImpression(@Body request: AdActionRequest): AdActionResponse

    @POST("ads/click")
    suspend fun logClick(@Body request: AdActionRequest): AdActionResponse
}
