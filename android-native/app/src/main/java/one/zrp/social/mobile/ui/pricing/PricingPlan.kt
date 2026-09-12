package one.zrp.social.mobile.ui.pricing

import androidx.annotation.StringRes
import one.zrp.social.mobile.R

/**
 * A full, read-only port of src/lib/limits.ts's PLANS table - every
 * field PricingCards.tsx renders on the website's own /pricing page,
 * not just the postLength/imagesPerPost/videoUploadMB subset
 * util/PlanLimits.kt already carries for the composer's own upload
 * validation (a different, narrower concern - this is a separate table
 * on purpose rather than widening that one). priceUsd is the same
 * hardcoded per-plan price PricingCards.tsx itself hardcodes (there is
 * no live pricing endpoint on either platform).
 */
data class PricingPlan(
    val key: String,
    @StringRes val nameRes: Int,
    val priceUsd: String,
    val postLength: Int,
    val imagesPerPost: Int,
    val videoUploadMB: Int,
    val scheduledPostsPerMonth: Int,
    @StringRes val analyticsRes: Int,
    val verifiedBadge: Boolean,
    val customProfileUrl: Boolean,
    val recruitmentProfiles: Boolean,
    val articlePublishing: Boolean,
    val teamManagement: Boolean,
    val apiAccess: Boolean,
    @StringRes val supportRes: Int,
    val charityContributionPercent: Int,
)

val PRICING_PLANS: List<PricingPlan> = listOf(
    PricingPlan(
        key = "free",
        nameRes = R.string.pricing_plan_free,
        priceUsd = "0",
        postLength = 280,
        imagesPerPost = 1,
        videoUploadMB = 32,
        scheduledPostsPerMonth = 5,
        analyticsRes = R.string.pricing_analytics_basic,
        verifiedBadge = false,
        customProfileUrl = false,
        recruitmentProfiles = false,
        articlePublishing = false,
        teamManagement = false,
        apiAccess = false,
        supportRes = R.string.pricing_support_none,
        charityContributionPercent = 35,
    ),
    PricingPlan(
        key = "pro",
        nameRes = R.string.pricing_plan_pro,
        priceUsd = "9.99",
        postLength = 1000,
        imagesPerPost = 4,
        videoUploadMB = 100,
        scheduledPostsPerMonth = 50,
        analyticsRes = R.string.pricing_analytics_advanced,
        verifiedBadge = true,
        customProfileUrl = true,
        recruitmentProfiles = false,
        articlePublishing = false,
        teamManagement = false,
        apiAccess = false,
        supportRes = R.string.pricing_support_standard,
        charityContributionPercent = 35,
    ),
    PricingPlan(
        key = "business",
        nameRes = R.string.pricing_plan_business,
        priceUsd = "49.99",
        postLength = 5000,
        imagesPerPost = 10,
        videoUploadMB = 500,
        scheduledPostsPerMonth = 500,
        analyticsRes = R.string.pricing_analytics_full,
        verifiedBadge = true,
        customProfileUrl = true,
        recruitmentProfiles = true,
        articlePublishing = true,
        teamManagement = true,
        apiAccess = true,
        supportRes = R.string.pricing_support_priority,
        charityContributionPercent = 35,
    ),
    PricingPlan(
        key = "enterprise",
        nameRes = R.string.pricing_plan_enterprise,
        priceUsd = "99.99",
        postLength = 999999,
        imagesPerPost = 999999,
        videoUploadMB = 2048,
        scheduledPostsPerMonth = 999999,
        analyticsRes = R.string.pricing_analytics_custom,
        verifiedBadge = true,
        customProfileUrl = true,
        recruitmentProfiles = true,
        articlePublishing = true,
        teamManagement = true,
        apiAccess = true,
        supportRes = R.string.pricing_support_247,
        charityContributionPercent = 35,
    ),
)
