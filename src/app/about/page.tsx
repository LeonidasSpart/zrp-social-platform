"use client";

import Image from "next/image";
import Link from "next/link";
import { useLanguage } from "@/contexts/LanguageContext";

export default function AboutPage() {
  const { t } = useLanguage();

  return (
    <div className="max-w-4xl mx-auto px-4 py-12 md:py-20 text-gray-800 dark:text-gray-200">
      {/* ─── Header ─── */}
      <div className="text-center mb-12">
        <div className="flex justify-center mb-6">
          <Image
            src="/logo.png"
            alt="ZRP"
            width={80}
            height={80}
            className="w-20 h-20 object-contain"
          />
        </div>
        <h1 className="text-4xl md:text-5xl font-orbitron font-bold text-zrp-red dark:text-zrp-red">
          {t("about.title")}
        </h1>
        <p className="text-lg md:text-xl text-gray-600 dark:text-gray-400 mt-3 max-w-2xl mx-auto">
          {t("about.subtitle")}
        </p>
      </div>

      {/* ─── Story ─── */}
      <div className="max-w-none space-y-6 text-base md:text-lg leading-relaxed text-gray-800 dark:text-gray-200">
        <p>
          <span className="font-semibold text-zrp-red dark:text-zrp-red">ZRP Social</span> {t("about.p1")}
          <strong className="text-gray-900 dark:text-white"> {t("about.p1Bold")}</strong>
        </p>

        <p>{t("about.p2")}</p>

        <p>{t("about.p3")}</p>

        <p>
          {t("about.p4")} <strong className="text-gray-900 dark:text-white">{t("about.p4Bold")}</strong>{" "}
          {t("about.p5")}
        </p>

        <p>
          {t("about.p5Em")} <em className="text-gray-900 dark:text-white font-medium">"{t("about.p5EmQuote")}"</em>{" "}
          {t("about.p5Rest")}
        </p>

        <p>{t("about.p6")}</p>

        <p className="text-lg font-semibold text-center text-zrp-red dark:text-zrp-red py-4">
          {t("about.tagline")}
        </p>
      </div>

      {/* ─── Values ─── */}
      <div className="grid grid-cols-1 md:grid-cols-3 gap-6 mt-12 pt-8 border-t border-gray-200 dark:border-gray-700">
        <div className="text-center">
          <div className="text-4xl mb-3">🗣️</div>
          <h3 className="font-orbitron text-lg font-semibold text-gray-900 dark:text-white">{t("about.value1Title")}</h3>
          <p className="text-sm text-gray-600 dark:text-gray-400">
            {t("about.value1Desc")}
          </p>
        </div>
        <div className="text-center">
          <div className="text-4xl mb-3">🛡️</div>
          <h3 className="font-orbitron text-lg font-semibold text-gray-900 dark:text-white">{t("about.value2Title")}</h3>
          <p className="text-sm text-gray-600 dark:text-gray-400">
            {t("about.value2Desc")}
          </p>
        </div>
        <div className="text-center">
          <div className="text-4xl mb-3">❤️</div>
          <h3 className="font-orbitron text-lg font-semibold text-gray-900 dark:text-white">{t("about.value3Title")}</h3>
          <p className="text-sm text-gray-600 dark:text-gray-400">
            {t("about.value3Desc")}
          </p>
        </div>
      </div>

      {/* ─── Call to Action ─── */}
      <div className="text-center mt-12 pt-8 border-t border-gray-200 dark:border-gray-700">
        <p className="text-gray-600 dark:text-gray-400 mb-4">
          {t("about.ctaText")}
        </p>
        <Link
          href="/signup"
          className="inline-block bg-zrp-red text-white px-8 py-3 rounded-lg font-semibold hover:bg-zrp-darkRed transition"
        >
          {t("about.ctaButton")}
        </Link>
      </div>
    </div>
  );
}
