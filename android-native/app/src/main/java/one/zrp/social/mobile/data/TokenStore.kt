package one.zrp.social.mobile.data

import android.content.Context
import android.content.SharedPreferences
import androidx.security.crypto.EncryptedSharedPreferences
import androidx.security.crypto.MasterKey

/**
 * Encrypted local storage for the mobile session token issued by
 * /api/mobile/auth/login. Backed by an Android Keystore-derived key
 * (MasterKey), not a plain XML SharedPreferences file - the session
 * token is exactly as sensitive as the browser's httpOnly session
 * cookie it stands in for, and deserves the equivalent protection.
 */
class TokenStore(context: Context) {
    private val prefs: SharedPreferences by lazy {
        val masterKey = MasterKey.Builder(context)
            .setKeyScheme(MasterKey.KeyScheme.AES256_GCM)
            .build()

        EncryptedSharedPreferences.create(
            context,
            PREFS_FILE_NAME,
            masterKey,
            EncryptedSharedPreferences.PrefKeyEncryptionScheme.AES256_SIV,
            EncryptedSharedPreferences.PrefValueEncryptionScheme.AES256_GCM,
        )
    }

    fun saveSession(sessionToken: String, cookieName: String) {
        prefs.edit()
            .putString(KEY_SESSION_TOKEN, sessionToken)
            .putString(KEY_COOKIE_NAME, cookieName)
            .apply()
    }

    fun getSessionToken(): String? = prefs.getString(KEY_SESSION_TOKEN, null)

    fun getCookieName(): String = prefs.getString(KEY_COOKIE_NAME, null) ?: DEFAULT_COOKIE_NAME

    fun clearSession() {
        prefs.edit()
            .remove(KEY_SESSION_TOKEN)
            .remove(KEY_COOKIE_NAME)
            .apply()
    }

    companion object {
        private const val PREFS_FILE_NAME = "zrp_secure_session"
        private const val KEY_SESSION_TOKEN = "session_token"
        private const val KEY_COOKIE_NAME = "cookie_name"

        // Matches the server's secure-context default (see
        // secureCookieName() in the login route) - only used as a
        // fallback before any real login response has been stored.
        private const val DEFAULT_COOKIE_NAME = "__Secure-next-auth.session-token"
    }
}
