package one.zrp.social.mobile.ui.settings

/**
 * The same 11 official ZRP languages as src/lib/translations.ts's
 * SUPPORTED_LANGUAGES - same codes, same native-script labels (a
 * language's own name is never itself translated, on web or here).
 */
data class SupportedLanguage(val code: String, val label: String)

val SUPPORTED_LANGUAGES = listOf(
    SupportedLanguage("en", "English"),
    SupportedLanguage("fr", "Français"),
    SupportedLanguage("de", "Deutsch"),
    SupportedLanguage("it", "Italiano"),
    SupportedLanguage("sq", "Shqip"),
    SupportedLanguage("es", "Español"),
    SupportedLanguage("ru", "Русский"),
    SupportedLanguage("ar", "العربية"),
    SupportedLanguage("zh", "中文"),
    SupportedLanguage("tr", "Türkçe"),
    SupportedLanguage("id", "Bahasa Indonesia"),
)
