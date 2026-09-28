package one.zrp.social.mobile

import org.junit.Assert.assertFalse
import org.junit.Assert.assertTrue
import org.junit.Test

/**
 * Regression coverage for the App-Link-verification-vs-web-only-links
 * bug: once release App Link verification went live (assetlinks.json
 * published, real release signing configured), the manifest's
 * `<intent-filter android:autoVerify="true">` for `zrp.one` has no path
 * restriction, so tapping a password-reset or email-verification link
 * opened this app directly instead of a browser - and since
 * ZrpNavHost's `deepLinks` never registered those two paths, the token
 * was silently dropped with no error shown. See MainActivity's own KDoc
 * on [isWebOnlyDeepLinkPath] / redirectToBrowserIfWebOnlyDeepLink for
 * the full explanation and why Custom Tabs (not a plain ACTION_VIEW
 * Intent, which would just loop back into this same verified App Link)
 * is the fix.
 */
class DeepLinkRoutingTest {

    @Test
    fun `reset-password link with a token is web-only`() {
        assertTrue(isWebOnlyDeepLinkPath(host = "zrp.one", path = "/reset-password/abc123"))
    }

    @Test
    fun `verify-email link is web-only`() {
        assertTrue(isWebOnlyDeepLinkPath(host = "zrp.one", path = "/verify-email"))
    }

    @Test
    fun `bare reset-password path with no token is not matched`() {
        // Matches the web route's own shape - /reset-password/[token] always
        // has a segment after it; a bare /reset-password has nothing to
        // hand to the browser and isn't a real link this app would ever
        // actually receive.
        assertFalse(isWebOnlyDeepLinkPath(host = "zrp.one", path = "/reset-password"))
        assertFalse(isWebOnlyDeepLinkPath(host = "zrp.one", path = "/reset-password/"))
    }

    @Test
    fun `ordinary native routes are never redirected to the browser`() {
        assertFalse(isWebOnlyDeepLinkPath(host = "zrp.one", path = "/"))
        assertFalse(isWebOnlyDeepLinkPath(host = "zrp.one", path = "/profile/someone"))
        assertFalse(isWebOnlyDeepLinkPath(host = "zrp.one", path = "/post/123"))
        assertFalse(isWebOnlyDeepLinkPath(host = "zrp.one", path = "/messages"))
        assertFalse(isWebOnlyDeepLinkPath(host = "zrp.one", path = "/hashtag/zrp"))
    }

    @Test
    fun `a different host is never redirected, even with a matching path`() {
        assertFalse(isWebOnlyDeepLinkPath(host = "evil.example", path = "/reset-password/abc123"))
        assertFalse(isWebOnlyDeepLinkPath(host = null, path = "/verify-email"))
    }

    @Test
    fun `a null path never matches`() {
        assertFalse(isWebOnlyDeepLinkPath(host = "zrp.one", path = null))
    }

    @Test
    fun `path is case-sensitive and does not fuzzy-match a similar-looking route`() {
        assertFalse(isWebOnlyDeepLinkPath(host = "zrp.one", path = "/Verify-Email"))
        assertFalse(isWebOnlyDeepLinkPath(host = "zrp.one", path = "/verify-emails"))
        assertFalse(isWebOnlyDeepLinkPath(host = "zrp.one", path = "/not-reset-password/abc"))
    }
}
