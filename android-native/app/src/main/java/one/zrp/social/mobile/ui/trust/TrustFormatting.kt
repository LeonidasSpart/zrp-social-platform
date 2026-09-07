package one.zrp.social.mobile.ui.trust

import androidx.compose.runtime.Composable
import androidx.compose.ui.res.stringResource
import java.text.SimpleDateFormat
import java.util.Locale
import java.util.TimeZone
import one.zrp.social.mobile.R
import one.zrp.social.mobile.network.TrustSignal

private val isoFormat = ThreadLocal.withInitial {
    SimpleDateFormat("yyyy-MM-dd'T'HH:mm:ss.SSS'Z'", Locale.US).apply {
        timeZone = TimeZone.getTimeZone("UTC")
    }
}

private val monthYearFormat = ThreadLocal.withInitial {
    SimpleDateFormat("MMMM yyyy", Locale.US)
}

/**
 * Matches the page's own
 * `new Date(...).toLocaleDateString("en-US", {month:"long", year:"numeric"})`
 * exactly - that call hardcodes "en-US" regardless of the viewer's own
 * language, so this stays unlocalized on purpose, same reasoning as
 * RelativeTime.kt's formatAbsoluteDateEnglish for a different real
 * en-US-hardcoded call elsewhere in the app.
 */
fun formatTrustJoinDate(iso: String): String {
    val date = try {
        isoFormat.get()!!.parse(iso)
    } catch (_: Exception) {
        null
    } ?: return ""
    return monthYearFormat.get()!!.format(date)
}

@Composable
fun trustAccountAgeText(accountAgeMonths: Int): String {
    val years = accountAgeMonths / 12
    return if (accountAgeMonths >= 12) {
        stringResource(if (years == 1) R.string.trust_years_singular else R.string.trust_years_plural, years)
    } else {
        stringResource(if (accountAgeMonths == 1) R.string.trust_months_singular else R.string.trust_months_plural, accountAgeMonths)
    }
}

/**
 * Mirrors SIGNAL_LABEL_KEYS + the special "account-age" handling in
 * src/app/trust/[username]/page.tsx exactly: every real signal key the
 * API can return has a translated title/description pair here, with
 * "account-age" alone getting the established/not-yet-established
 * variant the website computes from accountAgeMonths rather than a
 * fixed pair. A key with no mapping (would mean the server started
 * returning a signal this screen doesn't know about yet) falls back to
 * the raw, untranslated text the API itself sent - matching the
 * website's own fallback (`signal.title`/`signal.description`) rather
 * than crashing or hiding the signal.
 */
@Composable
fun trustSignalTitleAndDescription(signal: TrustSignal, accountAgeMonths: Int): Pair<String, String> {
    if (signal.key == "account-age") {
        val established = accountAgeMonths >= 12
        val title = stringResource(if (established) R.string.trust_signal_account_age_title_established else R.string.trust_signal_account_age_title_history)
        val description = if (established) {
            stringResource(R.string.trust_signal_account_age_desc_established)
        } else {
            stringResource(
                if (accountAgeMonths == 1) R.string.trust_signal_account_age_desc_history_singular else R.string.trust_signal_account_age_desc_history_plural,
                accountAgeMonths,
            )
        }
        return title to description
    }

    val titleRes = when (signal.key) {
        "email" -> R.string.trust_signal_email_title
        "avatar" -> R.string.trust_signal_avatar_title
        "cover" -> R.string.trust_signal_cover_title
        "name" -> R.string.trust_signal_name_title
        "bio" -> R.string.trust_signal_bio_title
        "location" -> R.string.trust_signal_location_title
        "website" -> R.string.trust_signal_website_title
        "community" -> R.string.trust_signal_community_title
        "followers" -> R.string.trust_signal_followers_title
        "verified" -> R.string.trust_signal_verified_title
        else -> null
    }
    val descRes = when (signal.key) {
        "email" -> R.string.trust_signal_email_desc
        "avatar" -> R.string.trust_signal_avatar_desc
        "cover" -> R.string.trust_signal_cover_desc
        "name" -> R.string.trust_signal_name_desc
        "bio" -> R.string.trust_signal_bio_desc
        "location" -> R.string.trust_signal_location_desc
        "website" -> R.string.trust_signal_website_desc
        "community" -> R.string.trust_signal_community_desc
        "followers" -> R.string.trust_signal_followers_desc
        "verified" -> R.string.trust_signal_verified_desc
        else -> null
    }

    return if (titleRes != null && descRes != null) {
        stringResource(titleRes) to stringResource(descRes)
    } else {
        signal.title to signal.description
    }
}

@Composable
fun trustCategoryLabel(category: String): String = when (category) {
    "SECURITY" -> stringResource(R.string.trust_category_security)
    "PROFILE" -> stringResource(R.string.trust_category_profile)
    "HISTORY" -> stringResource(R.string.trust_category_history)
    "COMMUNITY" -> stringResource(R.string.trust_category_community)
    else -> stringResource(R.string.trust_category_zrp)
}

@Composable
fun trustLevelLabel(level: String): String = when (level) {
    "EXCELLENT" -> stringResource(R.string.trust_level_excellent)
    "HIGH" -> stringResource(R.string.trust_level_high)
    "GOOD" -> stringResource(R.string.trust_level_good)
    "MODERATE" -> stringResource(R.string.trust_level_moderate)
    else -> stringResource(R.string.trust_level_low)
}

@Composable
fun trustLevelDescription(level: String): String = when (level) {
    "EXCELLENT" -> stringResource(R.string.trust_level_desc_excellent)
    "HIGH" -> stringResource(R.string.trust_level_desc_high)
    "GOOD" -> stringResource(R.string.trust_level_desc_good)
    "MODERATE" -> stringResource(R.string.trust_level_desc_moderate)
    else -> stringResource(R.string.trust_level_desc_low)
}
