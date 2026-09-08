package one.zrp.social.mobile.util

/**
 * Exact port of src/lib/limits.ts's PLANS table (postLength/
 * imagesPerPost/videoUploadMB only - the fields the composer's upload
 * validation actually needs). getPlanLimits() falls back to "free" for
 * an unrecognized plan string, matching the website's own
 * `PLANS[plan as Plan] || PLANS.free`.
 */
data class PlanLimits(
    val postLength: Int,
    val imagesPerPost: Int,
    val videoUploadMB: Int,
)

private val PLANS = mapOf(
    "free" to PlanLimits(postLength = 280, imagesPerPost = 1, videoUploadMB = 32),
    "pro" to PlanLimits(postLength = 1000, imagesPerPost = 4, videoUploadMB = 100),
    "business" to PlanLimits(postLength = 5000, imagesPerPost = 10, videoUploadMB = 500),
    "enterprise" to PlanLimits(postLength = 999999, imagesPerPost = 999999, videoUploadMB = 2048),
)

fun getPlanLimits(plan: String?): PlanLimits = PLANS[plan] ?: PLANS.getValue("free")

/**
 * Poll builder caps - PostComposer.tsx's own pollMaxOptions/
 * pollQuestionMaxLength/pollOptionMaxLength are driven by an optional
 * remote-config value (`limits.pollOptionsMax` etc., via its own
 * getNumericLimit() helper) native has no access to, each falling back
 * to these exact same defaults when that config is absent. maxOptions
 * is additionally clamped web-side to `Math.min(6, ...)` regardless of
 * config, so 6 is really a hard ceiling on both platforms, not just a
 * fallback - hardcoding it here loses nothing web itself doesn't also
 * enforce. The question/option length caps have no such upper clamp on
 * web, so a remote config raising them there would make native
 * stricter than web in that one case - the same accepted gap
 * PlanLimits itself already has for every value it doesn't fetch live.
 */
object PollLimits {
    const val maxOptions = 6
    const val questionMaxLength = 200
    const val optionMaxLength = 60
}
