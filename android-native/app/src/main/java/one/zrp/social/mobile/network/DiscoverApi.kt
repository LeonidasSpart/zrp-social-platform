package one.zrp.social.mobile.network

import retrofit2.http.Body
import retrofit2.http.GET
import retrofit2.http.POST
import retrofit2.http.Query

data class DiscoverAuthor(
    val id: String,
    val username: String,
    val name: String?,
    val avatarUrl: String?,
    val badgeType: String?,
)

/** `url` is null only for a locked, unpurchased premium item (see [DiscoverPremiumPost]). */
data class DiscoverMedia(val url: String?, val type: String)

data class DiscoverStats(
    val likes: Int = 0,
    val comments: Int = 0,
    val reposts: Int = 0,
    val saves: Int = 0,
    val views: Int = 0,
)

data class DiscoverViewerState(
    val liked: Boolean = false,
    val saved: Boolean = false,
    val reposted: Boolean = false,
    val followsAuthor: Boolean = false,
)

/**
 * Present only when premium-gated content redacted this item (same
 * shape applyPremiumGating attaches everywhere else on web - see
 * src/lib/premium-content.ts). Android has never built a crypto/money
 * purchase flow for any feature (Tips, plan upgrades, HELP
 * contributions, and now this - see native-payment-policy.ts and
 * CreatorScreen.kt's own KDoc on the same restriction), so a locked
 * item here is shown as a real, honest preview with no purchase
 * button, rather than a dead-end "Unlock" CTA.
 */
data class DiscoverPremiumPost(
    val id: String,
    val price: Double,
    val currency: String,
    val previewContent: String,
    val locked: Boolean,
)

/**
 * One GET /api/discover item - src/lib/discover/types.ts's own
 * DiscoverFeedItem. `reason` is the real, honest ranking reason
 * (DiscoverRankingService.getDiscoverReason) shown by the "Why am I
 * seeing this?" affordance - never a fabricated personalization claim.
 * `audio` is modeled on web for a future feature but always null today,
 * so it isn't ported here at all (nothing to do with a value that can
 * only ever be null).
 */
data class DiscoverItem(
    val id: String,
    val author: DiscoverAuthor,
    val media: DiscoverMedia,
    val caption: String,
    val stats: DiscoverStats,
    val viewerState: DiscoverViewerState,
    val commentsEnabled: Boolean,
    val createdAt: String,
    // "recent" | "popular"
    val reason: String,
    val premiumPost: DiscoverPremiumPost? = null,
)

data class DiscoverPage(val items: List<DiscoverItem>, val nextCursor: String?)

/**
 * DiscoverEventType (prisma/schema.prisma) - the same watch-event
 * family src/lib/discover-watch-client.ts's DiscoverWatchEventType
 * enumerates, used verbatim as the wire value (Retrofit/Gson serializes
 * a Kotlin enum by its `name`, which matches these exactly).
 */
enum class DiscoverEventType { IMPRESSION, START, PROGRESS_25, PROGRESS_50, PROGRESS_75, COMPLETE, SKIP }

data class DiscoverEventRequest(
    val postId: String,
    val eventType: DiscoverEventType,
    val watchedMs: Int? = null,
)

/**
 * `recorded: false` is not an error (e.g. deduped, or the post no
 * longer qualifies) - it just means nothing new was written. See
 * POST /api/discover/events's own KDoc.
 */
data class DiscoverEventResponse(val recorded: Boolean)

data class DiscoverNotInterestedRequest(val postId: String)
data class DiscoverNotInterestedResponse(val dismissed: Boolean)

/**
 * ZRP Discover - a server-ranked, TikTok-style vertical video feed
 * (src/app/discover/page.tsx), distinct from the Search screen's own
 * "Discover" pre-search state (suggested users/trending hashtags via
 * SearchApi) - a different backend concern entirely, despite the
 * shared name. `limit` is left unset by every current caller (server
 * defaults to 20, capped at 50 - src/lib/discover/feed.ts).
 */
interface DiscoverApi {
    @GET("discover")
    suspend fun getFeed(@Query("cursor") cursor: String?, @Query("limit") limit: Int? = null): DiscoverPage

    @POST("discover/events")
    suspend fun recordEvent(@Body request: DiscoverEventRequest): DiscoverEventResponse

    @POST("discover/not-interested")
    suspend fun markNotInterested(@Body request: DiscoverNotInterestedRequest): DiscoverNotInterestedResponse
}
