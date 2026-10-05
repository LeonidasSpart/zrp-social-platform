import type { Language } from "@/lib/translations";

/**
 * Maps ZRP's own language codes to a real BCP-47 locale tag for
 * `Date.prototype.toLocaleDateString`/`toLocaleTimeString`/`toLocaleString`.
 *
 * Found via a real bug report: a profile's "Joined <month> <year>" date
 * kept rendering in English ("Joined July 2026") under every non-Latin
 * locale, because most call sites hand-rolled their own `localeMap`
 * inline and most of those only ever listed en/fr/de/it (a handful
 * listed the full original 11) - so es/ru/ar/zh/tr/id/sq, and every one
 * of the four newer languages (pt/ja/ko/hi), silently fell back to the
 * "en-US" default at every single one of those call sites. This is the
 * single source of truth now - see getDateLocale below.
 */
const DATE_LOCALE_MAP: Record<Language, string> = {
  en: "en-US",
  fr: "fr-FR",
  de: "de-DE",
  it: "it-IT",
  sq: "sq-AL",
  es: "es-ES",
  ru: "ru-RU",
  ar: "ar-SA",
  zh: "zh-CN",
  tr: "tr-TR",
  id: "id-ID",
  pt: "pt-PT",
  ja: "ja-JP",
  ko: "ko-KR",
  hi: "hi-IN",
  nl: "nl-NL",
  pl: "pl-PL",
  ro: "ro-RO",
  cs: "cs-CZ",
  hu: "hu-HU",
  sv: "sv-SE",
  da: "da-DK",
  hr: "hr-HR",
  bg: "bg-BG",
  el: "el-GR",
  // Norwegian ships as the "no" macrolanguage code (matching every other
  // ZRP language being a bare top-level code), but "no-NO" itself has
  // inconsistent ICU/CLDR month-name coverage across runtimes - "nb-NO"
  // (Bokmål, the variant ZRP actually translates) formats dates reliably
  // everywhere and is the standard fallback for a bare "no" tag.
  no: "nb-NO",
  // Serbian ships Latin script only (see SUPPORTED_LANGUAGES) - "sr-Latn-RS"
  // keeps date formatting (month/weekday names) in Latin script too,
  // rather than "sr-RS" defaulting to Cyrillic and contradicting the
  // rest of the UI.
  sr: "sr-Latn-RS",
  bs: "bs-BA",
  mk: "mk-MK",
  uk: "uk-UA",
  fi: "fi-FI",
  sk: "sk-SK",
  sl: "sl-SI",
  lt: "lt-LT",
  et: "et-EE",
  ga: "ga-IE",
  lv: "lv-LV",
  mt: "mt-MT",
  rm: "rm-CH",
  bn: "bn-BD",
  ur: "ur-PK",
  vi: "vi-VN",
  mr: "mr-IN",
  te: "te-IN",
  // ICU defaults bare "fa-IR" to the Persian/Jalali calendar (years like
  // ۱۴۰۵), not Gregorian - every other ZRP locale renders Gregorian
  // dates, so this would be the one locale silently showing a different
  // era. The "-u-ca-gregory" extension forces Gregorian while keeping
  // real Persian month/weekday names and digit shapes.
  fa: "fa-IR-u-ca-gregory",
  sw: "sw-KE",
  // Same issue as fa-IR above: bare "th-TH" defaults to the Thai Buddhist
  // calendar (year 2569 instead of 2026) in ICU.
  th: "th-TH-u-ca-gregory",
  // ZRP's code is the ISO 639-1 "tl" (Tagalog), matching SUPPORTED_LANGUAGES'
  // "Filipino" label, but the standard BCP-47 tag Intl implementations
  // recognize for that locale is "fil", not "tl" - same bare-code-vs-real-tag
  // gap "no" already has above.
  tl: "fil-PH",
  am: "am-ET",
};

/** BCP-47 tag for `toLocaleDateString`/`toLocaleTimeString`/`toLocaleString`. */
export function getDateLocale(language: Language): string {
  return DATE_LOCALE_MAP[language] ?? "en-US";
}
