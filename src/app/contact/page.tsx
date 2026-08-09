"use client";

import Image from "next/image";
import Link from "next/link";
import { useLanguage } from "@/contexts/LanguageContext";

export default function ContactPage() {
  const { t } = useLanguage();

  // Splits "Check our {faq} or {help} for quick answers." into text/link parts,
  // so each language's word order is preserved while the two links stay live.
  const renderMoreHelp = () => {
    const template = t("contact.moreHelpDesc");
    const parts = template.split(/(\{faq\}|\{help\})/g);
    return parts.map((part, i) => {
      if (part === "{faq}") {
        return (
          <Link key={i} href="/faq" className="text-zrp-red hover:underline">
            {t("contact.faqLabel")}
          </Link>
        );
      }
      if (part === "{help}") {
        return (
          <Link key={i} href="/help" className="text-zrp-red hover:underline">
            {t("contact.helpCenterLabel")}
          </Link>
        );
      }
      return <span key={i}>{part}</span>;
    });
  };

  return (
    <div className="max-w-2xl mx-auto px-4 py-12 md:py-20 text-gray-800 dark:text-gray-200">
      {/* ─── Header ─── */}
      <div className="text-center mb-10">
        <div className="flex justify-center mb-6">
          <Image
            src="/logo.png"
            alt="ZRP"
            width={80}
            height={80}
            className="w-20 h-20 object-contain"
          />
        </div>
        <h1 className="text-4xl md:text-5xl font-orbitron font-bold text-zrp-red">
          {t("contact.title")}
        </h1>
        <p className="text-lg text-gray-600 dark:text-gray-400 mt-3">
          {t("contact.subtitle")}
        </p>
      </div>

      {/* ─── Contact options ─── */}
      <div className="space-y-6">
        <div className="bg-gray-50 dark:bg-gray-800/50 border border-gray-200 dark:border-gray-700 rounded-lg p-6">
          <h2 className="font-orbitron text-lg font-semibold text-gray-900 dark:text-white mb-2">
            {t("contact.generalSupport")}
          </h2>
          <p className="text-gray-600 dark:text-gray-400 text-sm mb-3">
            {t("contact.generalSupportDesc")}
          </p>
          <a
            href="mailto:support@zrp.one"
            className="text-zrp-red hover:underline font-medium"
          >
            support@zrp.one
          </a>
        </div>

        <div className="bg-gray-50 dark:bg-gray-800/50 border border-gray-200 dark:border-gray-700 rounded-lg p-6">
          <h2 className="font-orbitron text-lg font-semibold text-gray-900 dark:text-white mb-2">
            {t("contact.reportIssue")}
          </h2>
          <p className="text-gray-600 dark:text-gray-400 text-sm mb-3">
            {t("contact.reportIssueDesc")}
          </p>
          <a
            href="mailto:security@zrp.one"
            className="text-zrp-red hover:underline font-medium"
          >
            security@zrp.one
          </a>
        </div>

        <div className="bg-gray-50 dark:bg-gray-800/50 border border-gray-200 dark:border-gray-700 rounded-lg p-6">
          <h2 className="font-orbitron text-lg font-semibold text-gray-900 dark:text-white mb-2">
            {t("contact.moreHelp")}
          </h2>
          <p className="text-gray-600 dark:text-gray-400 text-sm">
            {renderMoreHelp()}
          </p>
        </div>
      </div>
    </div>
  );
}
