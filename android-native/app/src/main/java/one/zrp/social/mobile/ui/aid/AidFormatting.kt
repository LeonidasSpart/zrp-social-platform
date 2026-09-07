package one.zrp.social.mobile.ui.aid

import androidx.compose.material.icons.Icons
import androidx.compose.material.icons.filled.AttachMoney
import androidx.compose.material.icons.filled.Build
import androidx.compose.material.icons.filled.Circle
import androidx.compose.material.icons.filled.Emergency
import androidx.compose.material.icons.filled.Groups
import androidx.compose.material.icons.filled.Inventory2
import androidx.compose.material.icons.filled.MilitaryTech
import androidx.compose.material.icons.filled.Paid
import androidx.compose.material.icons.filled.Thunderstorm
import androidx.compose.runtime.Composable
import androidx.compose.ui.graphics.Color
import androidx.compose.ui.graphics.vector.ImageVector
import androidx.compose.ui.res.stringResource
import one.zrp.social.mobile.R
import one.zrp.social.mobile.network.HELP_CATEGORIES
import one.zrp.social.mobile.network.HELP_NEED_TYPES
import java.text.NumberFormat
import java.util.Currency
import java.util.Locale

/** Ported from src/lib/help.ts's own CATEGORY_META - same 5 icons, same category order. */
fun campaignCategoryIcon(category: String): ImageVector = when (category) {
    "WAR" -> Icons.Filled.MilitaryTech
    "DISASTER" -> Icons.Filled.Thunderstorm
    "POVERTY" -> Icons.Filled.Paid
    "EMERGENCY" -> Icons.Filled.Emergency
    else -> Icons.Filled.Circle
}

@Composable
fun campaignCategoryLabel(category: String): String = when (category) {
    "WAR" -> stringResource(R.string.aid_category_war)
    "DISASTER" -> stringResource(R.string.aid_category_disaster)
    "POVERTY" -> stringResource(R.string.aid_category_poverty)
    "EMERGENCY" -> stringResource(R.string.aid_category_emergency)
    else -> stringResource(R.string.aid_category_other)
}

val allAidCategories: List<String> get() = HELP_CATEGORIES

/** Ported from src/lib/help.ts's own NEED_TYPE_META - same 4 icons, same order. */
fun helpNeedTypeIcon(needType: String): ImageVector = when (needType) {
    "MONEY" -> Icons.Filled.AttachMoney
    "SUPPLIES" -> Icons.Filled.Inventory2
    "SKILLS" -> Icons.Filled.Build
    else -> Icons.Filled.Groups
}

@Composable
fun helpNeedTypeLabel(needType: String): String = when (needType) {
    "MONEY" -> stringResource(R.string.aid_need_money)
    "SUPPLIES" -> stringResource(R.string.aid_need_supplies)
    "SKILLS" -> stringResource(R.string.aid_need_skills)
    else -> stringResource(R.string.aid_need_volunteers)
}

val allHelpNeedTypes: List<String> get() = HELP_NEED_TYPES

/** Ported from src/lib/help.ts's own STATUS_LABEL_KEYS. */
@Composable
fun campaignStatusLabel(status: String): String = when (status) {
    "PENDING_REVIEW" -> stringResource(R.string.aid_status_pending_review)
    "ACTIVE" -> stringResource(R.string.aid_status_active)
    "REJECTED" -> stringResource(R.string.aid_status_rejected)
    "COMPLETED" -> stringResource(R.string.aid_status_completed)
    "CLOSED" -> stringResource(R.string.aid_status_closed)
    "REMOVED" -> stringResource(R.string.aid_status_removed)
    else -> status
}

/** Ported from src/lib/help.ts's own STATUS_STYLES text colors. */
fun campaignStatusColor(status: String): Color = when (status) {
    "PENDING_REVIEW" -> Color(0xFFA16207)
    "ACTIVE" -> Color(0xFF15803D)
    "REJECTED", "REMOVED" -> Color(0xFFB91C1C)
    "COMPLETED" -> Color(0xFF1D4ED8)
    else -> Color(0xFF6B7280)
}

/** Ported from src/lib/help.ts's own OFFER_STATUS_LABEL_KEYS. */
@Composable
fun helpOfferStatusLabel(status: String): String = when (status) {
    "PENDING" -> stringResource(R.string.aid_offer_status_pending)
    "ACKNOWLEDGED" -> stringResource(R.string.aid_offer_status_acknowledged)
    "FULFILLED" -> stringResource(R.string.aid_offer_status_fulfilled)
    "DECLINED" -> stringResource(R.string.aid_offer_status_declined)
    else -> status
}

/**
 * Ported from src/lib/help.ts's own formatCampaignAmount() - follows
 * the app's current per-app locale, same as formatListingPrice for
 * Marketplace. "USDC" isn't a real ISO currency code, so it falls back
 * to plain number + code formatting exactly like the web version does
 * when Intl.NumberFormat throws on an unrecognized currency.
 */
fun formatCampaignAmount(amount: Double, currency: String): String {
    return runCatching {
        val format = NumberFormat.getCurrencyInstance(Locale.getDefault())
        format.currency = Currency.getInstance(if (currency == "USDC") "USD" else currency)
        format.maximumFractionDigits = 2
        format.format(amount)
    }.getOrElse {
        val numberFormat = NumberFormat.getNumberInstance(Locale.getDefault())
        "${numberFormat.format(amount)} $currency"
    }
}

fun campaignProgress(raisedAmount: Double, goalAmount: Double?): Float {
    if (goalAmount == null || goalAmount <= 0) return 0f
    return (raisedAmount / goalAmount).toFloat().coerceIn(0f, 1f)
}
