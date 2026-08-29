"use client";

import Link from "next/link";
import { ArrowLeft } from "lucide-react";
import { useLanguage } from "@/contexts/LanguageContext";

export default function ArticleEditorHeader({ mode }: { mode: "create" | "edit" }) {
  const { t } = useLanguage();

  return (
    <>
      <Link
        href="/journalist"
        className="mb-4 inline-flex items-center gap-2 text-sm text-gray-500 transition hover:text-zrp-red dark:text-gray-400"
      >
        <ArrowLeft className="h-4 w-4" />
        {t("journalist.editor.backToDashboard")}
      </Link>

      <h1 className="mb-6 text-3xl font-bold text-gray-900 dark:text-white">
        {mode === "create" ? t("journalist.editor.newTitle") : t("journalist.editor.editTitle")}
      </h1>
    </>
  );
}
