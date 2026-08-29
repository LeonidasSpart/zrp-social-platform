"use client";

import Link from "next/link";
import { useLanguage } from "@/contexts/LanguageContext";

export default function CareersPage() {
  const { t } = useLanguage();

  const VALUES = [
    { icon: "🗽", title: t("careers.value1Title"), description: t("careers.value1Desc") },
    { icon: "🔒", title: t("careers.value2Title"), description: t("careers.value2Desc") },
    { icon: "🧡", title: t("careers.value3Title"), description: t("careers.value3Desc") },
  ];

  const WHAT_WE_LOOK_FOR = [
    t("careers.lookFor1"),
    t("careers.lookFor2"),
    t("careers.lookFor3"),
    t("careers.lookFor4"),
  ];

  return (
    <div className="min-h-screen bg-white dark:bg-zrp-deepBlack font-inter">
      <main>
        {/* Hero — dark red to black gradient, matching Charity page */}
        <section className="relative bg-gradient-to-br from-zrp-darkRed to-zrp-deepBlack py-20 px-4">
          <div className="max-w-4xl mx-auto text-center">
            <span className="inline-block bg-white/10 backdrop-blur-sm px-3 py-1 rounded-full text-sm font-medium text-white/90 mb-6">
              {t("careers.badge")}
            </span>
            <h1 className="text-4xl sm:text-5xl font-extrabold font-orbitron text-white leading-tight">
              {t("careers.heroTitle1")} <br />
              <span className="text-white/90">{t("careers.heroTitle2")}</span>
            </h1>
            <p className="mt-6 text-xl text-white/90 max-w-2xl mx-auto font-inter">
              {t("careers.heroSubtitle")}
            </p>
            <div className="mt-8 flex flex-wrap justify-center gap-4">
              <a
                href="mailto:careers@zrp.one"
                className="px-6 py-3 bg-white text-zrp-darkRed font-semibold rounded-full shadow-lg hover:bg-gray-200 transition font-inter"
              >
                {t("careers.getInTouch")}
              </a>
              <Link
                href="/about"
                className="px-6 py-3 bg-transparent border-2 border-white text-white font-semibold rounded-full shadow-lg hover:bg-white/10 transition font-inter"
              >
                {t("careers.learnAboutZrp")}
              </Link>
            </div>
          </div>
        </section>

        {/* Values */}
        <section className="py-16 px-4 max-w-6xl mx-auto">
          <h2 className="text-3xl font-bold text-center text-zrp-charcoal dark:text-white font-orbitron mb-12">
            {t("careers.valuesHeading")}
          </h2>
          <div className="grid md:grid-cols-3 gap-8">
            {VALUES.map((value) => (
              <div
                key={value.title}
                className="text-center p-6 bg-zrp-silver/20 dark:bg-zrp-charcoal/50 rounded-xl shadow-sm border border-zrp-silver/30 dark:border-zrp-charcoal"
              >
                <div className="text-4xl mb-4">{value.icon}</div>
                <h3 className="text-xl font-semibold text-zrp-charcoal dark:text-white font-orbitron">
                  {value.title}
                </h3>
                <p className="mt-2 text-zrp-charcoal/80 dark:text-white/70 font-inter">
                  {value.description}
                </p>
              </div>
            ))}
          </div>
        </section>

        {/* Open Positions — honest current state */}
        <section className="bg-zrp-silver/10 dark:bg-zrp-charcoal/30 py-16 px-4">
          <div className="max-w-3xl mx-auto text-center">
            <h2 className="text-3xl font-bold text-zrp-charcoal dark:text-white font-orbitron mb-4">
              {t("careers.openPositionsHeading")}
            </h2>
            <div className="mt-8 p-8 bg-white dark:bg-zrp-deepBlack rounded-xl shadow-sm border border-zrp-silver/30 dark:border-zrp-charcoal">
              <div className="text-4xl mb-4">🌱</div>
              <h3 className="text-xl font-semibold text-zrp-charcoal dark:text-white font-orbitron">
                {t("careers.noOpenRolesTitle")}
              </h3>
              <p className="mt-3 text-zrp-charcoal/80 dark:text-white/70 font-inter">
                {t("careers.noOpenRolesDesc")}
              </p>
              <a
                href="mailto:careers@zrp.one"
                className="inline-block mt-6 px-6 py-3 bg-zrp-red text-white font-semibold rounded-full shadow-lg hover:bg-zrp-darkRed transition font-inter"
              >
                {t("careers.reachOut")}
              </a>
            </div>
          </div>
        </section>

        {/* What we look for */}
        <section className="py-16 px-4 max-w-4xl mx-auto">
          <h2 className="text-3xl font-bold text-center text-zrp-charcoal dark:text-white font-orbitron mb-10">
            {t("careers.lookingForHeading")}
          </h2>
          <ul className="space-y-4">
            {WHAT_WE_LOOK_FOR.map((item) => (
              <li
                key={item}
                className="flex items-start gap-3 p-4 bg-zrp-silver/20 dark:bg-zrp-charcoal/50 rounded-lg border border-zrp-silver/30 dark:border-zrp-charcoal"
              >
                <span className="text-zrp-red font-bold flex-shrink-0">✓</span>
                <span className="text-zrp-charcoal/90 dark:text-white/80 font-inter">{item}</span>
              </li>
            ))}
          </ul>
        </section>

        {/* Closing CTA */}
        <section className="bg-gradient-to-br from-zrp-darkRed to-zrp-deepBlack py-16 px-4">
          <div className="max-w-2xl mx-auto text-center">
            <h2 className="text-2xl sm:text-3xl font-bold text-white font-orbitron">
              {t("careers.closingTitle")}
            </h2>
            <p className="mt-3 text-white/80 font-inter">
              {t("careers.closingDesc")}
            </p>
            <a
              href="mailto:careers@zrp.one"
              className="inline-block mt-6 px-6 py-3 bg-white text-zrp-darkRed font-semibold rounded-full shadow-lg hover:bg-gray-200 transition font-inter"
            >
              careers@zrp.one
            </a>
          </div>
        </section>
      </main>
    </div>
  );
}
