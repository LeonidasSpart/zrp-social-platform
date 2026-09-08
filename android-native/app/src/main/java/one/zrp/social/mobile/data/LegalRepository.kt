package one.zrp.social.mobile.data

import androidx.appcompat.app.AppCompatDelegate
import one.zrp.social.mobile.network.ApiClient
import one.zrp.social.mobile.network.LegalContentResponse
import one.zrp.social.mobile.network.zrpErrorMessage
import one.zrp.social.mobile.ui.settings.SUPPORTED_LANGUAGES
import retrofit2.HttpException
import java.util.Locale

/**
 * ZRP Terms of Service / Privacy Policy / Community Guidelines / Help
 * Center / Contact - real content, read live from GET /api/legal/{page}
 * (see LegalApi's own KDoc for the full contract). Rendered as a real
 * native Compose screen (LegalScreen) - no embedded browser view.
 */
class LegalRepository {
    suspend fun getContent(page: String): Result<LegalContentResponse> {
        return try {
            Result.success(ApiClient.legalApi.getLegalContent(page = page, lang = currentLanguageCode()))
        } catch (e: HttpException) {
            Result.failure(Exception(e.zrpErrorMessage() ?: "Couldn't load this page."))
        } catch (e: Exception) {
            Result.failure(Exception("Couldn't reach ZRP. Check your connection and try again."))
        }
    }

    companion object {
        /**
         * The app's current per-app language (LanguageSettingsScreen sets
         * this via AppCompatDelegate.setApplicationLocales - the same
         * per-app language API every other native screen's own strings
         * already render through). Falls back to the device locale, then
         * "en", if no per-app override was ever set - matching
         * LanguageContext.tsx's own detectBrowserLanguage() -> "en"
         * fallback on web. Only ever returns one of the 11 real
         * SUPPORTED_LANGUAGES codes the API actually accepts; anything
         * else (an unsupported device locale) also falls back to "en".
         */
        fun currentLanguageCode(): String {
            val supportedCodes = SUPPORTED_LANGUAGES.map { it.code }
            val appLocaleTag = AppCompatDelegate.getApplicationLocales()
                .toLanguageTags()
                .substringBefore(",")
                .substringBefore("-")
            if (appLocaleTag.isNotBlank() && supportedCodes.contains(appLocaleTag)) return appLocaleTag

            val deviceLanguage = Locale.getDefault().language
            return if (supportedCodes.contains(deviceLanguage)) deviceLanguage else "en"
        }
    }
}
