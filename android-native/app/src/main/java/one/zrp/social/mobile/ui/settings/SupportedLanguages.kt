package one.zrp.social.mobile.ui.settings

/**
 * The same 39 official ZRP languages as src/lib/translations.ts's
 * SUPPORTED_LANGUAGES - same codes, same native-script labels (a
 * language's own name is never itself translated, on web or here).
 * "pt" is European/International Portuguese (the same variant web/iOS
 * ship) - Android has no separate pt-PT vs pt-BR resource split here
 * since ZRP only ever ships the one Portuguese translation. "sr"
 * (Serbian) ships in Latin script only, matching its "Srpski" label -
 * ZRP does not ship a separate Cyrillic Serbian variant.
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
    SupportedLanguage("pt", "Português"),
    SupportedLanguage("ja", "日本語"),
    SupportedLanguage("ko", "한국어"),
    SupportedLanguage("hi", "हिन्दी"),
    SupportedLanguage("nl", "Nederlands"),
    SupportedLanguage("pl", "Polski"),
    SupportedLanguage("ro", "Română"),
    SupportedLanguage("cs", "Čeština"),
    SupportedLanguage("hu", "Magyar"),
    SupportedLanguage("sv", "Svenska"),
    SupportedLanguage("da", "Dansk"),
    SupportedLanguage("hr", "Hrvatski"),
    SupportedLanguage("bg", "Български"),
    SupportedLanguage("el", "Ελληνικά"),
    SupportedLanguage("no", "Norsk"),
    SupportedLanguage("sr", "Srpski"),
    SupportedLanguage("bs", "Bosanski"),
    SupportedLanguage("mk", "Македонски"),
    SupportedLanguage("uk", "Українська"),
    SupportedLanguage("fi", "Suomi"),
    SupportedLanguage("sk", "Slovenčina"),
    SupportedLanguage("sl", "Slovenščina"),
    SupportedLanguage("lt", "Lietuvių"),
    SupportedLanguage("et", "Eesti"),
    SupportedLanguage("ga", "Gaeilge"),
    SupportedLanguage("lv", "Latviešu"),
    SupportedLanguage("mt", "Malti"),
    SupportedLanguage("rm", "Rumantsch"),
    SupportedLanguage("bn", "বাংলা"),
    SupportedLanguage("ur", "اردو"),
    SupportedLanguage("vi", "Tiếng Việt"),
    SupportedLanguage("mr", "मराठी"),
    SupportedLanguage("te", "తెలుగు"),
    SupportedLanguage("fa", "فارسی"),
    SupportedLanguage("sw", "Kiswahili"),
    SupportedLanguage("th", "ไทย"),
    SupportedLanguage("tl", "Filipino"),
    SupportedLanguage("am", "አማርኛ"),
)
