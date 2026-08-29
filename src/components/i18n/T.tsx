"use client";

import { useLanguage } from "@/contexts/LanguageContext";
import type { TranslationKey } from "@/lib/translations";

export default function T({
  k,
  params,
}: {
  k: TranslationKey;
  params?: Record<string, string | number>;
}) {
  const { t } = useLanguage();
  return <>{t(k, params)}</>;
}
