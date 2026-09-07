package one.zrp.social.mobile.network

import retrofit2.http.Body
import retrofit2.http.GET
import retrofit2.http.Path
import retrofit2.http.POST
import retrofit2.http.Query

// The same fixed 7 luxury categories as src/lib/marketplace.ts's own
// LISTING_CATEGORIES - kept as plain strings (matching the real wire
// values verbatim) rather than a Kotlin enum, the same convention
// already used for MusicTrack.status/genre elsewhere in this file.
val MARKETPLACE_CATEGORIES = listOf(
    "LUXURY_CARS",
    "YACHTS_BOATS",
    "PRIVATE_AIRCRAFT",
    "LUXURY_HOTELS_RESORTS",
    "LUXURY_REAL_ESTATE",
    "WATCHES_JEWELRY",
    "OTHER_LUXURY",
)

data class ListingSeller(
    val id: String,
    val username: String,
    val name: String? = null,
    val avatarUrl: String? = null,
    val badgeType: String? = null,
    // Only present on the listing-detail response (GET /listings/{id})
    // - the browse/search/mine/favorites list responses select a
    // leaner seller shape without these.
    val bio: String? = null,
    val createdAt: String? = null,
)

data class ListingFavoriteCount(val favorites: Int = 0)

data class ListingSummary(
    val id: String,
    val category: String,
    val title: String,
    val price: Double?,
    val currency: String,
    val priceOnRequest: Boolean,
    val location: String?,
    val imageUrls: List<String> = emptyList(),
    val videoUrl: String?,
    val views: Int = 0,
    // Only present on GET /listings/mine (a seller's own dashboard,
    // where a listing can be PENDING_REVIEW/REJECTED/EXPIRED, not just
    // ACTIVE) - the public browse/search/favorites responses never
    // include a non-ACTIVE listing at all, so this stays null there.
    val status: String? = null,
    val rejectionReason: String? = null,
    val expiresAt: String? = null,
    val createdAt: String,
    val seller: ListingSeller? = null,
    val _count: ListingFavoriteCount = ListingFavoriteCount(),
)

data class ListingsPage(
    val listings: List<ListingSummary>,
    val nextCursor: String?,
)

data class ListingDetail(
    val id: String,
    val category: String,
    val title: String,
    val description: String,
    val price: Double?,
    val currency: String,
    val priceOnRequest: Boolean,
    val location: String?,
    val imageUrls: List<String> = emptyList(),
    val videoUrl: String?,
    val views: Int = 0,
    val createdAt: String,
    val seller: ListingSeller,
    val favorited: Boolean = false,
    val _count: ListingFavoriteCount = ListingFavoriteCount(),
)

data class ListingFavoritesResponse(val listings: List<ListingSummary> = emptyList())

data class ToggleListingFavoriteResponse(val favorited: Boolean)

/**
 * ZRP Market Plus - the same real GET/POST /listings, GET/PUT/DELETE
 * /listings/{id}, POST /listings/{id}/favorite, GET /listings/mine and
 * GET /listings/favorites routes the website's marketplace pages use.
 * Listing creation/editing (src/app/marketplace/new, /edit/[id]) is a
 * later native phase - this phase covers real browsing, search,
 * listing detail, and favoriting.
 */
interface MarketplaceApi {
    @GET("listings")
    suspend fun getListings(
        @Query("cursor") cursor: String? = null,
        @Query("limit") limit: Int = 20,
        @Query("category") category: String? = null,
        @Query("search") search: String? = null,
        @Query("location") location: String? = null,
        @Query("minPrice") minPrice: Double? = null,
        @Query("maxPrice") maxPrice: Double? = null,
        @Query("sort") sort: String? = null,
    ): ListingsPage

    @GET("listings/{id}")
    suspend fun getListing(@Path("id") id: String): ListingDetail

    @POST("listings/{id}/favorite")
    suspend fun toggleFavorite(@Path("id") id: String): ToggleListingFavoriteResponse

    @GET("listings/mine")
    suspend fun getMyListings(): ListingsPage

    @GET("listings/favorites")
    suspend fun getFavoriteListings(): ListingFavoritesResponse
}
