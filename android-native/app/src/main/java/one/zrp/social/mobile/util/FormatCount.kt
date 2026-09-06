package one.zrp.social.mobile.util

/**
 * Abbreviates a stat count the same way the website's PostCard does
 * (formatCount in src/components/PostCard.tsx) - "1.2K", "3.4M" - so a
 * popular post's like/comment/repost counts read the same on native as
 * they do on the web, instead of a raw unformatted integer. Counts are
 * never negative in practice (server-side aggregates), so this doesn't
 * special-case a sign.
 */
fun formatCount(count: Int): String {
    return when {
        count >= 1_000_000 -> trimTrailingZero(count / 1_000_000.0) + "M"
        count >= 1_000 -> trimTrailingZero(count / 1_000.0) + "K"
        else -> count.toString()
    }
}

private fun trimTrailingZero(value: Double): String {
    val rounded = "%.1f".format(value)
    return if (rounded.endsWith(".0")) rounded.dropLast(2) else rounded
}
