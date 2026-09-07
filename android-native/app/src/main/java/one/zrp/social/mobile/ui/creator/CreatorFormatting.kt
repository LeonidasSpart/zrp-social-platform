package one.zrp.social.mobile.ui.creator

import java.text.DateFormat
import java.text.SimpleDateFormat
import java.util.Locale
import java.util.TimeZone

/**
 * Every money figure on dashboard/page.tsx is a plain literal
 * `$${value.toFixed(2)}` - not a locale-aware Intl.NumberFormat call
 * (unlike Aid's own formatCampaignAmount) - so this matches that exact
 * literal formatting rather than reusing AidFormatting's locale-aware
 * currency formatter, which would render real amounts differently from
 * the website for the same data.
 */
fun formatCreatorUsd(amount: Double): String = "$" + String.format(Locale.US, "%.2f", amount)

private val isoFormat = ThreadLocal.withInitial {
    SimpleDateFormat("yyyy-MM-dd'T'HH:mm:ss.SSS'Z'", Locale.US).apply {
        timeZone = TimeZone.getTimeZone("UTC")
    }
}

/**
 * Matches the recent-tips table's own `new Date(tip.createdAt).toLocaleDateString()`
 * - no explicit locale/options passed there, so it renders in the
 * viewer's own device locale, unlike RelativeTime.kt's
 * formatAbsoluteDateEnglish (which mirrors a *different* real web call
 * that hardcodes "en-US").
 */
fun formatCreatorDate(iso: String): String {
    val date = try {
        isoFormat.get()!!.parse(iso)
    } catch (_: Exception) {
        null
    } ?: return ""
    return DateFormat.getDateInstance(DateFormat.SHORT, Locale.getDefault()).format(date)
}
