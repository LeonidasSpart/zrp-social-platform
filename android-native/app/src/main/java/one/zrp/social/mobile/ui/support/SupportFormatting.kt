package one.zrp.social.mobile.ui.support

import androidx.compose.runtime.Composable
import androidx.compose.ui.graphics.Color
import androidx.compose.ui.res.stringResource
import java.text.DateFormat
import java.text.SimpleDateFormat
import java.util.Locale
import java.util.TimeZone
import one.zrp.social.mobile.R

private val isoFormat = ThreadLocal.withInitial {
    SimpleDateFormat("yyyy-MM-dd'T'HH:mm:ss.SSS'Z'", Locale.US).apply {
        timeZone = TimeZone.getTimeZone("UTC")
    }
}

/** Matches MyTicketsPage's own `new Date(...).toLocaleDateString()` - locale-aware, no explicit locale override. */
fun formatTicketDate(iso: String): String {
    val date = try { isoFormat.get()!!.parse(iso) } catch (_: Exception) { null } ?: return ""
    return DateFormat.getDateInstance(DateFormat.MEDIUM, Locale.getDefault()).format(date)
}

/** Matches TicketDetailPage's own `new Date(...).toLocaleString()` - locale-aware date+time. */
fun formatTicketDateTime(iso: String): String {
    val date = try { isoFormat.get()!!.parse(iso) } catch (_: Exception) { null } ?: return ""
    return DateFormat.getDateTimeInstance(DateFormat.MEDIUM, DateFormat.SHORT, Locale.getDefault()).format(date)
}

/** Ported from support/page.tsx's own <select> options / the route's own validCategories list. */
@Composable
fun supportCategoryLabel(category: String): String = when (category.uppercase()) {
    "GENERAL" -> stringResource(R.string.support_category_general)
    "ACCOUNT" -> stringResource(R.string.support_category_account)
    "PRIVACY" -> stringResource(R.string.support_category_privacy)
    "CONTENT" -> stringResource(R.string.support_category_content)
    "MODERATION" -> stringResource(R.string.support_category_moderation)
    "PAYMENT" -> stringResource(R.string.support_category_payment)
    "MONETISATION" -> stringResource(R.string.support_category_monetisation)
    "BUG" -> stringResource(R.string.support_category_bug)
    "FEATURE_REQUEST" -> stringResource(R.string.support_category_feature_request)
    "SECURITY" -> stringResource(R.string.support_category_security)
    else -> stringResource(R.string.support_category_other)
}

/** Ported from MyTicketsPage's/TicketDetailPage's own statusLabels record. */
@Composable
fun supportStatusLabel(status: String): String = when (status) {
    "OPEN" -> stringResource(R.string.support_tickets_status_open)
    "IN_PROGRESS" -> stringResource(R.string.support_tickets_status_in_progress)
    "AWAITING_REPLY" -> stringResource(R.string.support_tickets_status_awaiting_reply)
    "RESOLVED" -> stringResource(R.string.support_tickets_status_resolved)
    "CLOSED" -> stringResource(R.string.support_tickets_status_closed)
    else -> status
}

/** Ported from MyTicketsPage's/TicketDetailPage's own statusColors record (text color only - native uses a tinted chip instead of the website's border+bg+text triple). */
fun supportStatusColor(status: String): Color = when (status) {
    "OPEN" -> Color(0xFFB91C1C)
    "IN_PROGRESS" -> Color(0xFF1D4ED8)
    "AWAITING_REPLY" -> Color(0xFFA16207)
    "RESOLVED" -> Color(0xFF15803D)
    "CLOSED" -> Color(0xFF6B7280)
    else -> Color(0xFF6B7280)
}

/** Ported from TicketDetailPage's own priorityLabels record. */
@Composable
fun supportPriorityLabel(priority: String): String = when (priority) {
    "LOW" -> stringResource(R.string.support_detail_priority_low)
    "NORMAL" -> stringResource(R.string.support_detail_priority_normal)
    "HIGH" -> stringResource(R.string.support_detail_priority_high)
    "URGENT" -> stringResource(R.string.support_detail_priority_urgent)
    else -> priority
}
