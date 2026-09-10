package one.zrp.social.mobile.data

import android.content.Context

/**
 * Detects the one Google Sign-In failure mode GoogleAuth.kt's own
 * exhaustive try/catch cannot see: the app's process itself being
 * killed while Android's account picker has focus (aggressive OEM
 * background-process management - MIUI and similar, already called out
 * in AndroidManifest.xml's own comment on this flow) rather than merely
 * the Activity being recreated, which MainActivity's configChanges and
 * AuthViewModel's viewModelScope already cover. A killed process takes
 * its entire ViewModelStore with it - the in-flight coroutine and every
 * catch block around it - so nothing ever runs to explain what
 * happened: the user picks an account and the app just comes back to a
 * fresh, idle login screen with no error and no spinner, which reads as
 * "this is broken" rather than "that got interrupted, try again".
 *
 * A plain boolean survives that because it is written to disk
 * (commit(), not apply()) immediately before the credential request
 * itself launches, and is only ever cleared by that same request
 * actually finishing - success, failure, or cancellation - inside the
 * same process. So it can still be set on a later cold start only if
 * the process died before the request could finish, which is exactly
 * the condition worth surfacing.
 */
class GoogleSignInAttemptMarker(context: Context) {
    private val prefs = context.applicationContext.getSharedPreferences(PREFS_NAME, Context.MODE_PRIVATE)

    fun markStarted() {
        // commit(), not apply() - this must be on disk before the
        // Credential Manager call below can hand off to the account
        // picker and the process becomes killable, not merely queued
        // for an async write that itself might never land in time.
        prefs.edit().putLong(KEY_STARTED_AT, System.currentTimeMillis()).commit()
    }

    fun clear() {
        prefs.edit().remove(KEY_STARTED_AT).apply()
    }

    // Read-and-clear: a stale mark is consumed at most once, and only
    // reported as a real interruption if it is recent enough to
    // plausibly be the attempt the caller is asking about right now,
    // not a mark left over from days ago (e.g. after an app update that
    // happened to land mid-flow).
    fun consumeInterruptedAttempt(): Boolean {
        val startedAt = prefs.getLong(KEY_STARTED_AT, 0L)
        if (startedAt == 0L) return false
        clear()
        return (System.currentTimeMillis() - startedAt) < STALE_THRESHOLD_MS
    }

    companion object {
        private const val PREFS_NAME = "zrp_google_signin_marker"
        private const val KEY_STARTED_AT = "started_at"
        private const val STALE_THRESHOLD_MS = 5 * 60 * 1000L
    }
}
