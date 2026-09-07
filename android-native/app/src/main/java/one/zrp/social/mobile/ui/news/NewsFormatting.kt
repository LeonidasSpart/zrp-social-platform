package one.zrp.social.mobile.ui.news

import androidx.compose.runtime.Composable
import androidx.compose.ui.res.stringResource
import one.zrp.social.mobile.R
import java.text.SimpleDateFormat
import java.util.Locale
import java.util.TimeZone

/** Ported from NewsPage.tsx's own CATEGORY_KEYS. */
@Composable
fun newsCategoryLabel(category: String): String = when (category) {
    "WORLD" -> stringResource(R.string.news_category_world)
    "EUROPE" -> stringResource(R.string.news_category_europe)
    "SWITZERLAND" -> stringResource(R.string.news_category_switzerland)
    "POLITICS" -> stringResource(R.string.news_category_politics)
    "BUSINESS" -> stringResource(R.string.news_category_business)
    "TECHNOLOGY" -> stringResource(R.string.news_category_technology)
    "CRYPTO" -> stringResource(R.string.news_category_crypto)
    "SCIENCE" -> stringResource(R.string.news_category_science)
    "SPORTS" -> stringResource(R.string.news_category_sports)
    "CULTURE" -> stringResource(R.string.news_category_culture)
    "COMMUNITY" -> stringResource(R.string.news_category_community)
    else -> category
}

private val isoFormat = ThreadLocal.withInitial {
    SimpleDateFormat("yyyy-MM-dd'T'HH:mm:ss.SSS'Z'", Locale.US).apply {
        timeZone = TimeZone.getTimeZone("UTC")
    }
}

/** Matches NewsPage.tsx's own `Intl.DateTimeFormat(undefined, {year, month: "short", day})` - locale-aware, short month. */
fun formatNewsListDate(iso: String?): String {
    if (iso == null) return ""
    val date = try { isoFormat.get()!!.parse(iso) } catch (_: Exception) { null } ?: return ""
    return SimpleDateFormat("MMM d, yyyy", Locale.getDefault()).format(date)
}

/**
 * Matches news/[slug]/page.tsx's own hardcoded
 * `toLocaleDateString("en-GB", {day, month: "long", year})` +
 * `toLocaleTimeString("en-GB", {hour, minute})` - unlocalized on
 * purpose, same as that page's own choice to hardcode en-GB regardless
 * of the viewer's language.
 */
fun formatNewsDetailDateTime(iso: String?): String {
    if (iso == null) return ""
    val date = try { isoFormat.get()!!.parse(iso) } catch (_: Exception) { null } ?: return ""
    val datePart = SimpleDateFormat("d MMMM yyyy", Locale.UK).format(date)
    val timePart = SimpleDateFormat("HH:mm", Locale.UK).format(date)
    return "$datePart at $timePart"
}
