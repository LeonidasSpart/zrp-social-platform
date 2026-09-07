package one.zrp.social.mobile.ui.opportunity

import androidx.compose.material.icons.Icons
import androidx.compose.material.icons.filled.Business
import androidx.compose.material.icons.filled.Campaign
import androidx.compose.material.icons.filled.EmojiEvents
import androidx.compose.material.icons.filled.Groups
import androidx.compose.material.icons.filled.Handshake
import androidx.compose.material.icons.filled.Hub
import androidx.compose.material.icons.filled.Laptop
import androidx.compose.material.icons.filled.MenuBook
import androidx.compose.material.icons.filled.School
import androidx.compose.material.icons.filled.Work
import androidx.compose.material.icons.filled.WorkspacePremium
import androidx.compose.runtime.Composable
import androidx.compose.ui.graphics.Color
import androidx.compose.ui.graphics.vector.ImageVector
import androidx.compose.ui.res.stringResource
import one.zrp.social.mobile.R
import one.zrp.social.mobile.network.OPPORTUNITY_TYPES
import java.text.DateFormat
import java.text.SimpleDateFormat
import java.util.Locale
import java.util.TimeZone

private val opportunityIsoFormat = ThreadLocal.withInitial {
    SimpleDateFormat("yyyy-MM-dd'T'HH:mm:ss.SSS'Z'", Locale.US).apply {
        timeZone = TimeZone.getTimeZone("UTC")
    }
}

/**
 * Matches OpportunityListingPage.tsx's own
 * `new Date(listing.deadline).toLocaleDateString(locale)` - follows the
 * app's current per-app language selection via Locale.getDefault(),
 * same as formatListingPrice does for Marketplace.
 */
fun formatOpportunityDeadline(iso: String): String {
    val date = try {
        opportunityIsoFormat.get()!!.parse(iso)
    } catch (_: Exception) {
        null
    } ?: return ""
    return DateFormat.getDateInstance(DateFormat.MEDIUM, Locale.getDefault()).format(date)
}

/** Ported from src/lib/opportunity.ts's own TYPE_META - same 11 icons, same order. */
fun opportunityTypeIcon(type: String): ImageVector = when (type) {
    "JOB" -> Icons.Filled.Work
    "REMOTE" -> Icons.Filled.Laptop
    "INTERNSHIP" -> Icons.Filled.School
    "SCHOLARSHIP" -> Icons.Filled.WorkspacePremium
    "MENTORSHIP" -> Icons.Filled.Groups
    "FREELANCE" -> Icons.Filled.Handshake
    "PARTNERSHIP" -> Icons.Filled.Business
    "SPONSORSHIP" -> Icons.Filled.Campaign
    "HACKATHON" -> Icons.Filled.EmojiEvents
    "TRAINING" -> Icons.Filled.MenuBook
    else -> Icons.Filled.Hub
}

@Composable
fun opportunityTypeLabel(type: String): String = when (type) {
    "JOB" -> stringResource(R.string.opportunity_type_job)
    "REMOTE" -> stringResource(R.string.opportunity_type_remote)
    "INTERNSHIP" -> stringResource(R.string.opportunity_type_internship)
    "SCHOLARSHIP" -> stringResource(R.string.opportunity_type_scholarship)
    "MENTORSHIP" -> stringResource(R.string.opportunity_type_mentorship)
    "FREELANCE" -> stringResource(R.string.opportunity_type_freelance)
    "PARTNERSHIP" -> stringResource(R.string.opportunity_type_partnership)
    "SPONSORSHIP" -> stringResource(R.string.opportunity_type_sponsorship)
    "HACKATHON" -> stringResource(R.string.opportunity_type_hackathon)
    "TRAINING" -> stringResource(R.string.opportunity_type_training)
    else -> stringResource(R.string.opportunity_type_collaboration)
}

/** Every real type in source order, for a type-chip row. */
val allOpportunityTypes: List<String> get() = OPPORTUNITY_TYPES

/** Ported from src/lib/opportunity.ts's own STATUS_LABEL_KEYS. */
@Composable
fun opportunityStatusLabel(status: String): String = when (status) {
    "PENDING_REVIEW" -> stringResource(R.string.opportunity_status_pending_review)
    "ACTIVE" -> stringResource(R.string.opportunity_status_active)
    "REJECTED" -> stringResource(R.string.opportunity_status_rejected)
    "EXPIRED" -> stringResource(R.string.opportunity_status_expired)
    "CLOSED" -> stringResource(R.string.opportunity_status_closed)
    "REMOVED" -> stringResource(R.string.opportunity_status_removed)
    else -> status
}

/** Ported from src/lib/opportunity.ts's own STATUS_STYLES text colors. */
fun opportunityStatusColor(status: String): Color = when (status) {
    "PENDING_REVIEW" -> Color(0xFFA16207)
    "ACTIVE" -> Color(0xFF15803D)
    "REJECTED", "REMOVED" -> Color(0xFFB91C1C)
    "EXPIRED" -> Color(0xFF4B5563)
    "CLOSED" -> Color(0xFF1D4ED8)
    else -> Color(0xFF6B7280)
}

/** Ported from src/lib/opportunity.ts's own APPLICATION_STATUS_LABEL_KEYS. */
@Composable
fun applicationStatusLabel(status: String): String = when (status) {
    "PENDING" -> stringResource(R.string.opportunity_app_status_pending)
    "REVIEWED" -> stringResource(R.string.opportunity_app_status_reviewed)
    "ACCEPTED" -> stringResource(R.string.opportunity_app_status_accepted)
    "REJECTED" -> stringResource(R.string.opportunity_app_status_rejected)
    "WITHDRAWN" -> stringResource(R.string.opportunity_app_status_withdrawn)
    else -> status
}

/** Ported from src/lib/opportunity.ts's own APPLICATION_STATUS_STYLES text colors. */
fun applicationStatusColor(status: String): Color = when (status) {
    "PENDING" -> Color(0xFFA16207)
    "REVIEWED" -> Color(0xFF1D4ED8)
    "ACCEPTED" -> Color(0xFF15803D)
    "REJECTED" -> Color(0xFFB91C1C)
    else -> Color(0xFF6B7280)
}
