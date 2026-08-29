"use client";

import Link from "next/link";
import { useLanguage } from "@/contexts/LanguageContext";
import CharityLedger from "@/components/CharityLedger";

export default function CharityPage() {
  const { t } = useLanguage();

  const CAUSES = [
    { title: t("charity.cause1Title"), description: t("charity.cause1Desc"), icon: "👶", percentage: 35 },
    { title: t("charity.cause2Title"), description: t("charity.cause2Desc"), icon: "📚", percentage: 25 },
    { title: t("charity.cause3Title"), description: t("charity.cause3Desc"), icon: "🏥", percentage: 20 },
    { title: t("charity.cause4Title"), description: t("charity.cause4Desc"), icon: "🌍", percentage: 20 },
  ];

  return (
    <div className="min-h-screen bg-white dark:bg-zrp-deepBlack font-inter">
      {/* Header removed – no navigation menu */}

      {/* Main content */}
      <main>
        {/* Hero – dark red to black gradient */}
        <section className="relative bg-gradient-to-br from-zrp-darkRed to-zrp-deepBlack py-20 px-4">
          <div className="max-w-4xl mx-auto text-center">
            <h1 className="text-4xl sm:text-5xl font-extrabold font-orbitron text-white leading-tight">
              {t("charity.heroTitle1")} <br />
              <span className="text-white/90">{t("charity.heroTitle2")}</span>
            </h1>
            <p className="mt-6 text-xl text-white/90 max-w-2xl mx-auto font-inter">
              {t("charity.heroSubtitleP1")} <strong className="text-white">{t("charity.heroSubtitleBold")}</strong> {t("charity.heroSubtitleP2")}
            </p>
            <p className="mt-4 text-lg text-white/80 max-w-2xl mx-auto">
              <span className="bg-white/10 backdrop-blur-sm px-3 py-1 rounded-full text-sm font-medium">
                {t("charity.quarterlyBadge")}
              </span>
            </p>
            <div className="mt-8 flex flex-wrap justify-center gap-4">
              <Link
                href="#how-it-works"
                className="px-6 py-3 bg-white text-zrp-darkRed font-semibold rounded-full shadow-lg hover:bg-gray-200 transition font-inter"
              >
                {t("charity.learnHowItWorks")}
              </Link>
              <Link
                href="#transparency"
                className="px-6 py-3 bg-transparent border-2 border-white text-white font-semibold rounded-full shadow-lg hover:bg-white/10 transition font-inter"
              >
                {t("charity.seeTransparency")}
              </Link>
            </div>
          </div>
        </section>

        {/* How It Works */}
        <section id="how-it-works" className="py-16 px-4 max-w-6xl mx-auto">
          <h2 className="text-3xl font-bold text-center text-zrp-charcoal dark:text-white font-orbitron mb-12">
            {t("charity.howItWorksHeading")}
          </h2>
          <div className="grid md:grid-cols-3 gap-8">
            <div className="text-center p-6 bg-zrp-silver/20 dark:bg-zrp-charcoal/50 rounded-xl shadow-sm border border-zrp-silver/30 dark:border-zrp-charcoal">
              <div className="text-4xl mb-4">💰</div>
              <h3 className="text-xl font-semibold text-zrp-charcoal dark:text-white font-orbitron">{t("charity.step1Title")}</h3>
              <p className="mt-2 text-zrp-charcoal/80 dark:text-white/70 font-inter">
                {t("charity.step1Desc")} <strong className="text-zrp-red">{t("charity.step1Bold")}</strong> {t("charity.step1DescEnd")}
              </p>
            </div>
            <div className="text-center p-6 bg-zrp-silver/20 dark:bg-zrp-charcoal/50 rounded-xl shadow-sm border border-zrp-silver/30 dark:border-zrp-charcoal">
              <div className="text-4xl mb-4">⚖️</div>
              <h3 className="text-xl font-semibold text-zrp-charcoal dark:text-white font-orbitron">{t("charity.step2Title")}</h3>
              <p className="mt-2 text-zrp-charcoal/80 dark:text-white/70 font-inter">
                {t("charity.step2Desc")} <strong className="text-zrp-red">{t("charity.step2Bold")}</strong>.
              </p>
            </div>
            <div className="text-center p-6 bg-zrp-silver/20 dark:bg-zrp-charcoal/50 rounded-xl shadow-sm border border-zrp-silver/30 dark:border-zrp-charcoal">
              <div className="text-4xl mb-4">🤝</div>
              <h3 className="text-xl font-semibold text-zrp-charcoal dark:text-white font-orbitron">{t("charity.step3Title")}</h3>
              <p className="mt-2 text-zrp-charcoal/80 dark:text-white/70 font-inter">
                {t("charity.step3Desc")}
                <br />
                <span className="text-sm text-zrp-red font-medium">{t("charity.step3Note")}</span>
              </p>
            </div>
          </div>
        </section>

        {/* Causes – Where the 35% Goes */}
        <section className="bg-zrp-silver/10 dark:bg-zrp-charcoal/30 py-16 px-4">
          <div className="max-w-6xl mx-auto">
            <h2 className="text-3xl font-bold text-center text-zrp-charcoal dark:text-white font-orbitron mb-4">
              {t("charity.whereGoesHeading")}
            </h2>
            <p className="text-center text-zrp-charcoal/70 dark:text-white/70 mb-12 max-w-2xl mx-auto font-inter">
              {t("charity.whereGoesDesc")}
            </p>
            <div className="grid md:grid-cols-2 gap-8">
              {CAUSES.map((cause) => (
                <div
                  key={cause.title}
                  className="bg-white dark:bg-zrp-charcoal/80 p-6 rounded-xl shadow-md border border-zrp-silver/30 dark:border-zrp-charcoal flex items-start gap-4"
                >
                  <span className="text-3xl">{cause.icon}</span>
                  <div>
                    <h3 className="text-xl font-semibold text-zrp-charcoal dark:text-white font-orbitron">
                      {cause.title}
                    </h3>
                    <p className="text-zrp-charcoal/70 dark:text-white/70 mt-1 font-inter">{cause.description}</p>
                    <div className="mt-3 w-full bg-zrp-silver/50 dark:bg-zrp-charcoal rounded-full h-2.5">
                      <div
                        className="bg-zrp-red h-2.5 rounded-full"
                        style={{ width: `${cause.percentage}%` }}
                      ></div>
                    </div>
                    <span className="text-sm text-zrp-charcoal/60 dark:text-white/60 font-inter">
                      {cause.percentage}% {t("charity.budgetPercent")}
                    </span>
                  </div>
                </div>
              ))}
            </div>
          </div>
        </section>

        {/* Transparency & Impact – No data shared yet */}
        <section id="transparency" className="py-16 px-4 max-w-6xl mx-auto">
          <h2 className="text-3xl font-bold text-center text-zrp-charcoal dark:text-white font-orbitron mb-4">
            {t("charity.transparencyHeading")}
          </h2>
          <p className="text-center text-zrp-charcoal/70 dark:text-white/70 mb-12 max-w-2xl mx-auto font-inter">
            {t("charity.transparencyDescP1")} <strong className="text-zrp-red">{t("charity.transparencyDescBold")}</strong> {t("charity.transparencyDescP2")} <strong className="text-zrp-red">{t("charity.transparencyDescBold2")}</strong>.
            <br />
            <span className="text-sm text-zrp-red font-medium">
              {t("charity.firstReportNote")}
            </span>
          </p>

          <CharityLedger />
        </section>

        {/* Call to Action – dark red background */}
        <section className="bg-gradient-to-r from-zrp-darkRed to-zrp-deepBlack py-16 px-4">
          <div className="max-w-4xl mx-auto text-center text-white">
            <h2 className="text-3xl font-bold font-orbitron">{t("charity.ctaHeading")}</h2>
            <p className="mt-4 text-lg opacity-90 font-inter">
              {t("charity.ctaDescP1")} <strong className="text-white">{t("charity.ctaDescBold")}</strong>{' '}
              {t("charity.ctaDescP2")}
            </p>
            <div className="mt-8 flex flex-wrap justify-center gap-4">
              <Link
                href="/signup"
                className="px-8 py-3 bg-white text-zrp-darkRed font-semibold rounded-full shadow-lg hover:bg-gray-200 transition font-inter"
              >
                {t("charity.createAccount")}
              </Link>
              <Link
                href="/about"
                className="px-8 py-3 border-2 border-white text-white font-semibold rounded-full hover:bg-white/10 transition font-inter"
              >
                {t("charity.learnAboutZrp")}
              </Link>
            </div>
          </div>
        </section>
      </main>

      {/* Footer removed – global footer will render via layout */}
    </div>
  );
}
