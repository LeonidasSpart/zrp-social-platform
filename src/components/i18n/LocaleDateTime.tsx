"use client";

import { useLanguage } from "@/contexts/LanguageContext";
import { getDateLocale } from "@/lib/dateLocale";

/**
 * A locale-aware "<date> at <time>" client island for otherwise-server-
 * rendered pages (mirrors src/components/i18n/T.tsx's pattern) - found
 * via a real bug: src/app/news/[slug]/page.tsx (a server component)
 * hardcoded both the "en-GB" locale AND the literal English word "at"
 * between the date and time, so every article's byline showed an
 * English-formatted timestamp regardless of the reader's selected
 * language.
 */
export default function LocaleDateTime({
  iso,
  dateOptions,
  timeOptions,
}: {
  iso: string;
  dateOptions: Intl.DateTimeFormatOptions;
  timeOptions: Intl.DateTimeFormatOptions;
}) {
  const { t, language } = useLanguage();
  const date = new Date(iso);
  const locale = getDateLocale(language);
  const formattedDate = date.toLocaleDateString(locale, dateOptions);
  const formattedTime = date.toLocaleTimeString(locale, timeOptions);
  return <>{t("news.publishedAtFormat", { date: formattedDate, time: formattedTime })}</>;
}
