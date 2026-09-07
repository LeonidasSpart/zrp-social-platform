package one.zrp.social.mobile.ui.marketplace

import androidx.compose.material.icons.Icons
import androidx.compose.material.icons.filled.Diamond
import androidx.compose.material.icons.filled.DirectionsBoat
import androidx.compose.material.icons.filled.DirectionsCar
import androidx.compose.material.icons.filled.Flight
import androidx.compose.material.icons.filled.Home
import androidx.compose.material.icons.filled.Hotel
import androidx.compose.material.icons.filled.Watch
import androidx.compose.runtime.Composable
import androidx.compose.ui.graphics.Color
import androidx.compose.ui.graphics.vector.ImageVector
import androidx.compose.ui.res.stringResource
import one.zrp.social.mobile.R
import one.zrp.social.mobile.network.MARKETPLACE_CATEGORIES
import java.text.NumberFormat
import java.util.Currency
import java.util.Locale

/** Ported from src/lib/marketplace.ts's own CATEGORY_META - same 7 icons, same category order. */
fun categoryIcon(category: String): ImageVector = when (category) {
    "LUXURY_CARS" -> Icons.Filled.DirectionsCar
    "YACHTS_BOATS" -> Icons.Filled.DirectionsBoat
    "PRIVATE_AIRCRAFT" -> Icons.Filled.Flight
    "LUXURY_HOTELS_RESORTS" -> Icons.Filled.Hotel
    "LUXURY_REAL_ESTATE" -> Icons.Filled.Home
    "WATCHES_JEWELRY" -> Icons.Filled.Watch
    else -> Icons.Filled.Diamond
}

@Composable
fun categoryLabel(category: String): String = when (category) {
    "LUXURY_CARS" -> stringResource(R.string.marketplace_category_luxury_cars)
    "YACHTS_BOATS" -> stringResource(R.string.marketplace_category_yachts_boats)
    "PRIVATE_AIRCRAFT" -> stringResource(R.string.marketplace_category_private_aircraft)
    "LUXURY_HOTELS_RESORTS" -> stringResource(R.string.marketplace_category_luxury_hotels_resorts)
    "LUXURY_REAL_ESTATE" -> stringResource(R.string.marketplace_category_luxury_real_estate)
    "WATCHES_JEWELRY" -> stringResource(R.string.marketplace_category_watches_jewelry)
    else -> stringResource(R.string.marketplace_category_other_luxury)
}

/** Every real category in source order, for a category-chip row. */
val allMarketplaceCategories: List<String> get() = MARKETPLACE_CATEGORIES

/** Ported from src/lib/marketplace.ts's own STATUS_LABEL_KEYS - the 7 real ListingStatus values a seller's own /listings/mine can return. */
@Composable
fun listingStatusLabel(status: String): String = when (status) {
    "DRAFT" -> stringResource(R.string.marketplace_status_draft)
    "PENDING_REVIEW" -> stringResource(R.string.marketplace_status_pending_review)
    "ACTIVE" -> stringResource(R.string.marketplace_status_active)
    "REJECTED" -> stringResource(R.string.marketplace_status_rejected)
    "SOLD" -> stringResource(R.string.marketplace_status_sold)
    "EXPIRED" -> stringResource(R.string.marketplace_status_expired)
    "REMOVED" -> stringResource(R.string.marketplace_status_removed)
    else -> status
}

/** Ported from src/lib/marketplace.ts's own STATUS_STYLES text colors. */
fun listingStatusColor(status: String): Color = when (status) {
    "DRAFT", "EXPIRED" -> Color(0xFF6B7280)
    "PENDING_REVIEW" -> Color(0xFFA16207)
    "ACTIVE" -> Color(0xFF15803D)
    "REJECTED", "REMOVED" -> Color(0xFFB91C1C)
    "SOLD" -> Color(0xFF1D4ED8)
    else -> Color(0xFF6B7280)
}

/**
 * Ported from src/lib/marketplace.ts's own formatListingPrice() -
 * follows the app's current per-app locale (AppCompatDelegate, see
 * LanguageSettingsScreen) exactly like the website follows its own
 * LanguageContext, so both format the same currency the same way for
 * the same selected language.
 */
@Composable
fun formatListingPrice(price: Double?, currency: String, priceOnRequest: Boolean): String {
    if (priceOnRequest || price == null) return stringResource(R.string.marketplace_price_on_request)
    return runCatching {
        val format = NumberFormat.getCurrencyInstance(Locale.getDefault())
        format.currency = Currency.getInstance(currency.ifBlank { "USD" })
        format.maximumFractionDigits = 0
        format.format(price)
    }.getOrElse { "$currency ${price.toInt()}" }
}
