package one.zrp.social.mobile.ui.pricing

import org.junit.Assert.assertEquals
import org.junit.Assert.assertFalse
import org.junit.Assert.assertTrue
import org.junit.Test

/**
 * PRICING_PLANS is a field-for-field port of src/lib/limits.ts's real
 * PLANS table (the same one src/components/PricingCards.tsx renders on
 * the website's own /pricing page) - these values are pinned here so a
 * drift between the two tables (a limit changed on web but not ported,
 * or vice versa) fails a build instead of silently reaching users as
 * two different apps quoting different limits for the same plan.
 */
class PricingPlanTest {

    @Test
    fun `exactly the four real plans, in the same order the website lists them`() {
        assertEquals(listOf("free", "pro", "business", "enterprise"), PRICING_PLANS.map { it.key })
    }

    @Test
    fun `free plan matches PLANS_free from src_lib_limits_ts`() {
        val free = PRICING_PLANS.first { it.key == "free" }
        assertEquals("0", free.priceUsd)
        assertEquals(280, free.postLength)
        assertEquals(1, free.imagesPerPost)
        assertEquals(32, free.videoUploadMB)
        assertEquals(5, free.scheduledPostsPerMonth)
        assertFalse(free.verifiedBadge)
        assertFalse(free.customProfileUrl)
        assertFalse(free.recruitmentProfiles)
        assertFalse(free.articlePublishing)
        assertFalse(free.teamManagement)
        assertFalse(free.apiAccess)
        assertEquals(35, free.charityContributionPercent)
    }

    @Test
    fun `pro plan matches PLANS_pro from src_lib_limits_ts`() {
        val pro = PRICING_PLANS.first { it.key == "pro" }
        assertEquals("9.99", pro.priceUsd)
        assertEquals(1000, pro.postLength)
        assertEquals(4, pro.imagesPerPost)
        assertEquals(100, pro.videoUploadMB)
        assertEquals(50, pro.scheduledPostsPerMonth)
        assertTrue(pro.verifiedBadge)
        assertTrue(pro.customProfileUrl)
        assertFalse(pro.recruitmentProfiles)
        assertFalse(pro.articlePublishing)
        assertFalse(pro.teamManagement)
        assertFalse(pro.apiAccess)
    }

    @Test
    fun `business plan matches PLANS_business from src_lib_limits_ts`() {
        val business = PRICING_PLANS.first { it.key == "business" }
        assertEquals("49.99", business.priceUsd)
        assertEquals(5000, business.postLength)
        assertEquals(10, business.imagesPerPost)
        assertEquals(500, business.videoUploadMB)
        assertEquals(500, business.scheduledPostsPerMonth)
        assertTrue(business.verifiedBadge)
        assertTrue(business.customProfileUrl)
        assertTrue(business.recruitmentProfiles)
        assertTrue(business.articlePublishing)
        assertTrue(business.teamManagement)
        assertTrue(business.apiAccess)
    }

    @Test
    fun `enterprise plan matches PLANS_enterprise from src_lib_limits_ts`() {
        val enterprise = PRICING_PLANS.first { it.key == "enterprise" }
        assertEquals("99.99", enterprise.priceUsd)
        // 999999 is the real "unlimited" sentinel src_lib_limits_ts itself
        // uses for these three fields - not a native-only invention.
        assertEquals(999999, enterprise.postLength)
        assertEquals(999999, enterprise.imagesPerPost)
        assertEquals(999999, enterprise.scheduledPostsPerMonth)
        // videoUploadMB never gets the unlimited treatment on web either
        // (PricingCards.tsx's own feature list has no ternary for it) -
        // enterprise's real cap is a literal 2048, not 999999.
        assertEquals(2048, enterprise.videoUploadMB)
        assertTrue(enterprise.verifiedBadge)
        assertTrue(enterprise.customProfileUrl)
        assertTrue(enterprise.recruitmentProfiles)
        assertTrue(enterprise.articlePublishing)
        assertTrue(enterprise.teamManagement)
        assertTrue(enterprise.apiAccess)
    }

    @Test
    fun `every plan contributes the same real 35 percent to charity`() {
        // charityContribution is a flat rate across every tier in
        // src_lib_limits_ts's own PLANS table, not a per-plan variable -
        // this pins that fact so a future edit can't accidentally make
        // charity a paid-tier perk.
        PRICING_PLANS.forEach { plan ->
            assertEquals("plan ${plan.key}", 35, plan.charityContributionPercent)
        }
    }

    @Test
    fun `feature gates never regress going up a tier`() {
        // free -> pro -> business -> enterprise: once a boolean feature
        // turns on for a lower tier, every higher tier must keep it on.
        // Catches a copy-paste slip that would quietly take a feature
        // away from a paying plan.
        val ordered = PRICING_PLANS
        for (i in 1 until ordered.size) {
            val prev = ordered[i - 1]
            val curr = ordered[i]
            assertTrue("${curr.key} lost verifiedBadge vs ${prev.key}", curr.verifiedBadge || !prev.verifiedBadge)
            assertTrue("${curr.key} lost customProfileUrl vs ${prev.key}", curr.customProfileUrl || !prev.customProfileUrl)
            assertTrue("${curr.key} lost recruitmentProfiles vs ${prev.key}", curr.recruitmentProfiles || !prev.recruitmentProfiles)
            assertTrue("${curr.key} lost articlePublishing vs ${prev.key}", curr.articlePublishing || !prev.articlePublishing)
            assertTrue("${curr.key} lost teamManagement vs ${prev.key}", curr.teamManagement || !prev.teamManagement)
            assertTrue("${curr.key} lost apiAccess vs ${prev.key}", curr.apiAccess || !prev.apiAccess)
        }
    }
}
