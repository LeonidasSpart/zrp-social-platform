package one.zrp.social.mobile.data

/**
 * Fixed English literals thrown by every Repository's generic-failure
 * catch block, for failures that never carry a real server-provided
 * message (network unreachable, or an unexpected client-side
 * exception). Previously the same literal text was hand-duplicated in
 * ~20 separate files; centralizing it here means there is exactly one
 * string to keep in sync, and lets the Compose layer (which has the
 * Context these Repositories don't - see
 * one.zrp.social.mobile.util.localizedError) recognize it reliably and
 * substitute the real, translated string instead of showing English to
 * every non-English user on any network hiccup.
 */
object ZrpErrors {
    const val NETWORK = "Couldn't reach ZRP. Check your connection and try again."
}
