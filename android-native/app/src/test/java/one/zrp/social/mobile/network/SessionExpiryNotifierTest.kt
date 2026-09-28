package one.zrp.social.mobile.network

import org.junit.Assert.assertFalse
import org.junit.Assert.assertTrue
import org.junit.Test

/**
 * Regression coverage for the "no global 401 handler" gap: before this,
 * only two specific mutations (profile update, onboarding-complete)
 * reacted to a dead session at all (the narrower ACCOUNT_NOT_FOUND
 * code path) - every other one of the ~220 protected routes just left
 * a 401 unhandled. shouldTreatAsSessionExpired is what ApiClient's
 * response interceptor uses to decide whether a given 401 should force
 * a logout, and it must NOT fire for an ordinary wrong-password login
 * attempt or a rejected OAuth token exchange, since those also 401 but
 * have nothing to do with an existing session dying.
 */
class SessionExpiryNotifierTest {

    @Test
    fun `a 401 on a protected route while signed in is a session expiry`() {
        assertTrue(shouldTreatAsSessionExpired("/api/posts", 401, hadSessionToken = true))
    }

    @Test
    fun `a 401 with no session token attached is not a session expiry`() {
        // Nothing to expire - this request was never authenticated in
        // the first place.
        assertFalse(shouldTreatAsSessionExpired("/api/posts", 401, hadSessionToken = false))
    }

    @Test
    fun `a wrong-password login 401 is never treated as a session expiry`() {
        assertFalse(shouldTreatAsSessionExpired("/api/mobile/auth/login", 401, hadSessionToken = true))
    }

    @Test
    fun `a rejected Google sign-in token 401 is never treated as a session expiry`() {
        assertFalse(shouldTreatAsSessionExpired("/api/mobile/auth/google", 401, hadSessionToken = true))
    }

    @Test
    fun `a non-401 response is never a session expiry regardless of the path`() {
        assertFalse(shouldTreatAsSessionExpired("/api/posts", 403, hadSessionToken = true))
        assertFalse(shouldTreatAsSessionExpired("/api/posts", 200, hadSessionToken = true))
    }
}
