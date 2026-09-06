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
