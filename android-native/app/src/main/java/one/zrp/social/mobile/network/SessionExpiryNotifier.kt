package one.zrp.social.mobile.network

import kotlinx.coroutines.flow.MutableSharedFlow
import kotlinx.coroutines.flow.SharedFlow
import kotlinx.coroutines.flow.asSharedFlow

/**
 * Decides whether a 401 response means "the signed-in session died"
 * (a banned/deleted account, an expired/invalidated token - the same
 * real condition src/lib/auth-guards.ts's requireAuthenticatedUser()
 * returns 401 for on every one of the ~220 protected routes) rather
 * than something that legitimately 401s while nobody is signed in yet.
 *
 * [hadSessionToken] is what separates the two: a 401 with no session
 * cookie attached at all means the request was never authenticated in
 * the first place (nothing to expire), so it's left alone. The
 * mobile/auth endpoints are excluded outright because they 401 for
 * ordinary reasons that have nothing to do with an existing session -
 * POST mobile/auth/login itself returns 401 for a plain wrong password
 * (src/app/api/mobile/auth/login/route.ts's own CredentialsAuthError),
 * and the Google/Apple token-exchange endpoints 401 the same way for a
 * rejected OAuth token - none of those should ever force-logout an
 * already-signed-in session (there isn't one yet) or clobber the login
 * screen's own in-progress error state.
 */
internal fun shouldTreatAsSessionExpired(path: String, statusCode: Int, hadSessionToken: Boolean): Boolean {
    if (statusCode != 401 || !hadSessionToken) return false
    return !path.startsWith("/api/mobile/auth/")
}

/**
 * Fired by ApiClient's response interceptor the moment ANY authenticated
 * request 401s, and collected by AuthViewModel to drive the same
 * logoutWithSessionExpired() flow already used for the narrower
 * ACCOUNT_NOT_FOUND case (profile update/onboarding-complete - see
 * OnboardingRepository's own KDoc). Before this, every other one of the
 * ~220 protected routes silently 401ing (a ban taking effect mid-
 * session, a token invalidated server-side, a deleted account) left the
 * signed-in gate never finding out - the affected screen would just show
 * its own generic "couldn't load" error forever, with no way back to a
 * real login. A SharedFlow (not a plain callback) so it survives being
 * emitted from any interceptor thread before a collector has necessarily
 * attached yet, without replaying stale events to a collector that
 * attaches much later.
 */
object SessionExpiryNotifier {
    private val _events = MutableSharedFlow<Unit>(extraBufferCapacity = 1)
    val events: SharedFlow<Unit> = _events.asSharedFlow()

    fun notifySessionExpired() {
        _events.tryEmit(Unit)
    }
}
