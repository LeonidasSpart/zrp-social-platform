package one.zrp.social.mobile.util

import android.text.format.DateUtils
import java.text.SimpleDateFormat
import java.util.Locale
import java.util.TimeZone

/**
 * Turns a post's ISO-8601 createdAt (as returned by every /api/posts*
 * route, e.g. "2026-01-01T12:00:00.000Z") into a short relative label
 * ("3m", "2h", "5d") using the platform's own DateUtils rather than
 * java.time, which needs API 26+ or core library desugaring this app
 * doesn't otherwise need - minSdk here is 24.
 */
private val isoFormat = ThreadLocal.withInitial {
    SimpleDateFormat("yyyy-MM-dd'T'HH:mm:ss.SSS'Z'", Locale.US).apply {
        timeZone = TimeZone.getTimeZone("UTC")
    }
}

fun formatRelativeTime(iso: String): String {
    val millis = try {
        isoFormat.get()!!.parse(iso)?.time
    } catch (_: Exception) {
        null
    } ?: return ""

    return DateUtils.getRelativeTimeSpanString(
        millis,
        System.currentTimeMillis(),
        DateUtils.MINUTE_IN_MILLIS,
        DateUtils.FORMAT_ABBREV_RELATIVE,
    ).toString()
}
