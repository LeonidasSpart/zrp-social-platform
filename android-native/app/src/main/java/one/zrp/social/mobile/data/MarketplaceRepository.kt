package one.zrp.social.mobile.data

import one.zrp.social.mobile.network.ApiClient
import one.zrp.social.mobile.network.CreateReportRequest
import one.zrp.social.mobile.network.ListingDetail
import one.zrp.social.mobile.network.ListingRow
import one.zrp.social.mobile.network.ListingSummary
import one.zrp.social.mobile.network.ListingWriteRequest
import one.zrp.social.mobile.network.ListingsPage

/**
 * ZRP Market Plus - the same real /listings routes the website's
 * marketplace pages use: real browsing, search, listing detail,
 * favoriting, and (phase 2) creating/editing/deleting a listing.
 */
class MarketplaceRepository {
    suspend fun getOwnUserId(): Result<String?> = runCatching {
        ApiClient.authApi.getSession().user?.id
    }

    suspend fun getListings(
        cursor: String? = null,
        category: String? = null,
        search: String? = null,
        sort: String? = null,
    ): Result<ListingsPage> = runCatching {
        ApiClient.marketplaceApi.getListings(
            cursor = cursor,
            category = category,
            search = search?.trim()?.takeIf { it.isNotEmpty() },
            sort = sort,
        )
    }

    suspend fun getListing(id: String): Result<ListingDetail> = runCatching {
        ApiClient.marketplaceApi.getListing(id)
    }

    suspend fun toggleFavorite(id: String): Result<Boolean> = runCatching {
        ApiClient.marketplaceApi.toggleFavorite(id).favorited
    }

    suspend fun getMyListings(): Result<List<ListingSummary>> = runCatching {
        ApiClient.marketplaceApi.getMyListings().listings
    }

    suspend fun getFavoriteListings(): Result<List<ListingSummary>> = runCatching {
        ApiClient.marketplaceApi.getFavoriteListings().listings
    }

    suspend fun reportListing(listingId: String, reason: String, details: String?): Result<Unit> = runCatching {
        ApiClient.reportsApi.createReport(CreateReportRequest(listingId = listingId, reason = reason, details = details))
    }

    suspend fun createListing(
        category: String,
        title: String,
        description: String,
        priceOnRequest: Boolean,
        price: Double?,
        currency: String,
        location: String?,
        imageUrls: List<String>,
        videoUrl: String?,
    ): Result<ListingRow> = runCatching {
        ApiClient.marketplaceApi.createListing(
            ListingWriteRequest(
                category = category,
                title = title,
                description = description,
                priceOnRequest = priceOnRequest,
                price = price,
                currency = currency,
                location = location,
                imageUrls = imageUrls,
                videoUrl = videoUrl,
            ),
        ).listing
    }

    suspend fun updateListing(
        id: String,
        category: String,
        title: String,
        description: String,
        priceOnRequest: Boolean,
        price: Double?,
        currency: String,
        location: String?,
        imageUrls: List<String>,
        videoUrl: String?,
    ): Result<ListingRow> = runCatching {
        ApiClient.marketplaceApi.updateListing(
            id,
            ListingWriteRequest(
                category = category,
                title = title,
                description = description,
                priceOnRequest = priceOnRequest,
                price = price,
                currency = currency,
                location = location,
                imageUrls = imageUrls,
                videoUrl = videoUrl,
            ),
        ).listing
    }

    suspend fun deleteListing(id: String): Result<Unit> = runCatching {
        ApiClient.marketplaceApi.deleteListing(id)
    }
}
