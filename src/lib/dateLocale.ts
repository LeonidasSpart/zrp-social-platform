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
};

/** BCP-47 tag for `toLocaleDateString`/`toLocaleTimeString`/`toLocaleString`. */
export function getDateLocale(language: Language): string {
  return DATE_LOCALE_MAP[language] ?? "en-US";
}
