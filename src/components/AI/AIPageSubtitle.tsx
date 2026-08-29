"use client";

import { useLanguage } from "@/contexts/LanguageContext";

export default function AIPageSubtitle() {
  const { t } = useLanguage();

  return (
    <>
      <p className="text-gray-500 dark:text-gray-400 mt-1">{t("ai.page.subtitle")}</p>
      <p className="text-xs text-gray-400 dark:text-gray-500 mt-1">{t("ai.page.poweredBy")}</p>
    </>
  );
}
