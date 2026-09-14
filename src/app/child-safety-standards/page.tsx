"use client";

import Link from "next/link";
import Image from "next/image";
import { useLanguage } from "@/contexts/LanguageContext";

const LAST_UPDATED = "September 15, 2026";

export default function ChildSafetyStandardsPage() {
  const { t } = useLanguage();

  return (
    <div className="min-h-screen bg-white dark:bg-zrp-deepBlack font-inter">
      <section className="relative overflow-hidden bg-gradient-to-br from-zrp-darkRed to-zrp-deepBlack py-16 sm:py-20 px-4">
        <div className="absolute inset-0 pointer-events-none">
          <div className="absolute -top-24 -right-24 w-72 h-72 bg-zrp-red/20 rounded-full blur-3xl" />
          <div className="absolute -bottom-32 -left-24 w-80 h-80 bg-black/30 rounded-full blur-3xl" />
        </div>

        <div className="relative max-w-3xl mx-auto">
          <Link
            href="/"
            className="inline-flex items-center gap-2 text-white/80 hover:text-white transition font-inter text-sm mb-10"
          >
            ← {t("help.backToZrp")}
          </Link>

          <div className="flex flex-col sm:flex-row items-start sm:items-center gap-5">
            <div className="flex-shrink-0">
              <Image
                src="/logo.png"
                alt="ZRP Social"
                width={72}
                height={72}
                className="w-[72px] h-[72px] object-contain"
              />
            </div>

            <div>
              <h1 className="text-4xl sm:text-5xl font-extrabold font-orbitron text-white leading-tight">
                {t("childSafety.title")}
              </h1>
            </div>
          </div>

          <p className="mt-6 max-w-2xl text-white/80 text-[15px] sm:text-base leading-7">
            {t("childSafety.intro")}
          </p>

          <span className="inline-block mt-6 px-3 py-1 rounded-full bg-white/10 text-white/70 text-xs">
            {t("childSafety.lastUpdatedLabel")} {LAST_UPDATED}
          </span>
        </div>
      </section>

      <section className="max-w-3xl mx-auto px-4 py-12 sm:py-16 space-y-10 text-gray-800 dark:text-gray-200">
        <div>
          <h2 className="text-2xl font-bold font-orbitron mb-3 text-zrp-red">
            {t("childSafety.section1.title")}
          </h2>
          <p className="leading-7 text-[15px]">
            {t("childSafety.section1.body")}
          </p>
        </div>

        <div>
          <h2 className="text-2xl font-bold font-orbitron mb-3 text-zrp-red">
            {t("childSafety.section2.title")}
          </h2>
          <p className="leading-7 text-[15px]">
            {t("childSafety.section2.body")}
          </p>
        </div>

        <div>
          <h2 className="text-2xl font-bold font-orbitron mb-3 text-zrp-red">
            {t("childSafety.section3.title")}
          </h2>
          <p className="leading-7 text-[15px]">
            {t("childSafety.section3.body")}
          </p>
        </div>

        <div>
          <h2 className="text-2xl font-bold font-orbitron mb-3 text-zrp-red">
            {t("childSafety.section4.title")}
          </h2>
          <p className="leading-7 text-[15px]">
            {t("childSafety.section4.body")}
          </p>
        </div>

        <div>
          <h2 className="text-2xl font-bold font-orbitron mb-3 text-zrp-red">
            {t("childSafety.section5.title")}
          </h2>
          <p className="leading-7 text-[15px]">
            {t("childSafety.section5.emailPrefix")}{" "}
            <a
              href="mailto:contact@zrp.one"
              className="text-zrp-red underline"
            >
              contact@zrp.one
            </a>
            {t("childSafety.section5.emailSuffix")}
          </p>
        </div>

        <div>
          <h2 className="text-2xl font-bold font-orbitron mb-3 text-zrp-red">
            {t("childSafety.section6.title")}
          </h2>
          <p className="leading-7 text-[15px]">
            {t("childSafety.section6.prefix")}{" "}
            <Link href="/community-code" className="text-zrp-red underline">
              {t("childSafety.section6.communityCodeLabel")}
            </Link>{" "}
            {t("childSafety.section6.middle")}{" "}
            <Link href="/terms" className="text-zrp-red underline">
              {t("childSafety.section6.termsLabel")}
            </Link>
            {t("childSafety.section6.suffix")}
          </p>
        </div>
      </section>
    </div>
  );
}
