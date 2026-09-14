package one.zrp.social.mobile.data

import android.content.Context

/**
 * Persists the user's manual Light/Dark override, the native counterpart
 * of the website's own `localStorage["theme"]` (see ThemeContext.tsx).
 * Plain SharedPreferences, not EncryptedSharedPreferences - a theme
 * choice is no more sensitive than ComposerDraftStore's cached draft
 * text, unlike TokenStore's session token.
 *
 * No preference stored (`get()` returns null) means "follow the system
 * setting", exactly matching ThemeContext.tsx's own no-saved-preference
 * branch (falls through to `prefers-color-scheme`) rather than defaulting
 * to a fixed mode - until the user picks one explicitly in Settings, the
 * app should track the device's Light/Dark switch live.
 */
class ThemePreferenceStore(context: Context) {
    private val prefs = context.getSharedPreferences(PREFS_NAME, Context.MODE_PRIVATE)

    /** true = dark, false = light, null = no explicit choice yet (follow system). */
    fun get(): Boolean? = when (prefs.getString(KEY_THEME, null)) {
        VALUE_DARK -> true
        VALUE_LIGHT -> false
        else -> null
    }

    fun set(isDark: Boolean) {
        prefs.edit().putString(KEY_THEME, if (isDark) VALUE_DARK else VALUE_LIGHT).apply()
    }

    companion object {
        private const val PREFS_NAME = "zrp_theme_prefs"
        private const val KEY_THEME = "theme_mode"
        private const val VALUE_DARK = "dark"
        private const val VALUE_LIGHT = "light"
    }
}
