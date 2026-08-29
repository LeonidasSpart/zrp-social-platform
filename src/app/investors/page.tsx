"use client";

import Link from "next/link";
import { useLanguage } from "@/contexts/LanguageContext";

export default function InvestorsPage() {
  const { t } = useLanguage();

  const WHY_ZRP = [
    { icon: "🇨🇭", title: t("investors.why1Title"), description: t("investors.why1Desc") },
    { icon: "🌍", title: t("investors.why2Title"), description: t("investors.why2Desc") },
    { icon: "⚡", title: t("investors.why3Title"), description: t("investors.why3Desc") },
  ];

  const PLATFORM = [
    { title: t("investors.platform1Title"), description: t("investors.platform1Desc") },
    { title: t("investors.platform2Title"), description: t("investors.platform2Desc") },
    { title: t("investors.platform3Title"), description: t("investors.platform3Desc") },
    { title: t("investors.platform4Title"), description: t("investors.platform4Desc") },
    { title: t("investors.platform5Title"), description: t("investors.platform5Desc") },
    { title: t("investors.platform6Title"), description: t("investors.platform6Desc") },
  ];

  const OPPORTUNITIES = [
    { icon: "💻", title: t("investors.opp1Title"), description: t("investors.opp1Desc") },
    { icon: "🌍", title: t("investors.opp2Title"), description: t("investors.opp2Desc") },
    { icon: "👥", title: t("investors.opp3Title"), description: t("investors.opp3Desc") },
    { icon: "🚀", title: t("investors.opp4Title"), description: t("investors.opp4Desc") },
  ];

  const INVESTOR_TYPES = [
    t("investors.type1"),
    t("investors.type2"),
    t("investors.type3"),
    t("investors.type4"),
    t("investors.type5"),
    t("investors.type6"),
  ];

  return (
    <div className="min-h-screen bg-white dark:bg-zrp-deepBlack font-inter">
      <main>

        {/* Hero */}
        <section className="relative bg-gradient-to-br from-zrp-darkRed to-zrp-deepBlack py-20 px-4">
          <div className="max-w-4xl mx-auto text-center">

            <span className="inline-block bg-white/10 backdrop-blur-sm px-3 py-1 rounded-full text-sm font-medium text-white/90 mb-6">
              {t("investors.badge")}
            </span>

            <img
              src="/logo.png"
              alt="ZRP Social Logo"
              className="h-16 mx-auto mb-6 object-contain"
            />

            <h1 className="text-4xl sm:text-5xl font-extrabold font-orbitron text-white leading-tight">
              {t("investors.heroTitle")}
            </h1>

            <p className="mt-6 text-xl text-white/90 max-w-2xl mx-auto font-inter">
              {t("investors.heroSubtitle")}
            </p>

            <div className="mt-8 flex flex-wrap justify-center gap-4">

              <a
                href="mailto:investors@zrp.one"
                className="px-6 py-3 bg-white text-zrp-darkRed font-semibold rounded-full shadow-lg hover:bg-gray-200 transition font-inter"
              >
                {t("investors.contactIR")}
              </a>

              <Link
                href="/about"
                className="px-6 py-3 bg-transparent border-2 border-white text-white font-semibold rounded-full shadow-lg hover:bg-white/10 transition font-inter"
              >
                {t("investors.learnAboutZrp")}
              </Link>

            </div>
          </div>
        </section>

        {/* Vision */}
        <section className="py-16 px-4 max-w-6xl mx-auto">

          <div className="max-w-3xl mx-auto text-center">

            <h2 className="text-3xl font-bold text-zrp-charcoal dark:text-white font-orbitron">
              {t("investors.visionHeading")}
            </h2>

            <p className="mt-5 text-zrp-charcoal/80 dark:text-white/70 font-inter leading-relaxed">
              {t("investors.visionP1")}
            </p>

            <p className="mt-4 text-zrp-charcoal/80 dark:text-white/70 font-inter leading-relaxed">
              {t("investors.visionP2")}
            </p>

          </div>

          <div className="mt-12 grid md:grid-cols-3 gap-8">

            {WHY_ZRP.map((item) => (
              <div
                key={item.title}
                className="text-center p-6 bg-zrp-silver/20 dark:bg-zrp-charcoal/50 rounded-xl shadow-sm border border-zrp-silver/30 dark:border-zrp-charcoal"
              >
                <div className="text-4xl mb-4">
                  {item.icon}
                </div>

                <h3 className="text-xl font-semibold text-zrp-charcoal dark:text-white font-orbitron">
                  {item.title}
                </h3>

                <p className="mt-2 text-zrp-charcoal/80 dark:text-white/70 font-inter">
                  {item.description}
                </p>
              </div>
            ))}

          </div>
        </section>

        {/* Platform */}
        <section className="bg-zrp-silver/10 dark:bg-zrp-charcoal/30 py-16 px-4">

          <div className="max-w-6xl mx-auto">

            <div className="max-w-3xl mx-auto text-center">

              <h2 className="text-3xl font-bold text-zrp-charcoal dark:text-white font-orbitron">
                {t("investors.platformHeading")}
              </h2>

              <p className="mt-4 text-zrp-charcoal/70 dark:text-white/70 font-inter">
                {t("investors.platformSubtitle")}
              </p>

            </div>

            <div className="mt-12 grid md:grid-cols-2 lg:grid-cols-3 gap-6">

              {PLATFORM.map((feature) => (
                <div
                  key={feature.title}
                  className="bg-white dark:bg-zrp-charcoal/80 p-6 rounded-xl border border-zrp-silver/30 dark:border-zrp-charcoal"
                >
                  <div className="w-10 h-10 rounded-lg bg-zrp-red/10 dark:bg-zrp-red/20 flex items-center justify-center text-zrp-red font-orbitron font-bold">
                    Z
                  </div>

                  <h3 className="mt-5 text-lg font-bold font-orbitron text-zrp-charcoal dark:text-white">
                    {feature.title}
                  </h3>

                  <p className="mt-2 text-zrp-charcoal/70 dark:text-white/70 font-inter text-sm leading-relaxed">
                    {feature.description}
                  </p>
                </div>
              ))}

            </div>
          </div>
        </section>

        {/* Growth */}
        <section className="py-16 px-4 max-w-6xl mx-auto">

          <div className="max-w-3xl mx-auto text-center">

            <h2 className="text-3xl font-bold text-zrp-charcoal dark:text-white font-orbitron">
              {t("investors.growthHeading")}
            </h2>

            <p className="mt-4 text-zrp-charcoal/70 dark:text-white/70 font-inter">
              {t("investors.growthDesc")}
            </p>

          </div>

          <div className="mt-10 grid md:grid-cols-3 gap-6">

            <div className="text-center p-7 bg-zrp-silver/20 dark:bg-zrp-charcoal/50 rounded-xl border border-zrp-silver/30 dark:border-zrp-charcoal">
              <div className="text-4xl font-bold font-orbitron text-zrp-red">
                195K+
              </div>

              <p className="mt-2 text-sm text-zrp-charcoal/70 dark:text-white/70 font-inter">
                {t("investors.statUsersLabel")}
              </p>
            </div>

            <div className="text-center p-7 bg-zrp-silver/20 dark:bg-zrp-charcoal/50 rounded-xl border border-zrp-silver/30 dark:border-zrp-charcoal">
              <div className="text-4xl font-bold font-orbitron text-zrp-red">
                {t("investors.statLiveValue")}
              </div>

              <p className="mt-2 text-sm text-zrp-charcoal/70 dark:text-white/70 font-inter">
                {t("investors.statLiveLabel")}
              </p>
            </div>

            <div className="text-center p-7 bg-zrp-silver/20 dark:bg-zrp-charcoal/50 rounded-xl border border-zrp-silver/30 dark:border-zrp-charcoal">
              <div className="text-4xl font-bold font-orbitron text-zrp-red">
                {t("investors.statGrowingValue")}
              </div>

              <p className="mt-2 text-sm text-zrp-charcoal/70 dark:text-white/70 font-inter">
                {t("investors.statGrowingLabel")}
              </p>
            </div>

          </div>

          <p className="mt-6 text-center text-xs text-zrp-charcoal/50 dark:text-white/50 font-inter">
            {t("investors.figuresNote")}
          </p>

        </section>

        {/* Investment Opportunities */}
        <section className="bg-zrp-silver/10 dark:bg-zrp-charcoal/30 py-16 px-4">

          <div className="max-w-6xl mx-auto">

            <div className="max-w-3xl mx-auto text-center">

              <h2 className="text-3xl font-bold text-zrp-charcoal dark:text-white font-orbitron">
                {t("investors.opportunitiesHeading")}
              </h2>

              <p className="mt-4 text-zrp-charcoal/70 dark:text-white/70 font-inter">
                {t("investors.opportunitiesSubtitle")}
              </p>

            </div>

            <div className="mt-12 grid md:grid-cols-2 gap-8">

              {OPPORTUNITIES.map((item) => (
                <div
                  key={item.title}
                  className="flex items-start gap-5 p-6 bg-white dark:bg-zrp-deepBlack rounded-xl border border-zrp-silver/30 dark:border-zrp-charcoal"
                >
                  <div className="text-3xl flex-shrink-0">
                    {item.icon}
                  </div>

                  <div>
                    <h3 className="text-xl font-semibold text-zrp-charcoal dark:text-white font-orbitron">
                      {item.title}
                    </h3>

                    <p className="mt-2 text-zrp-charcoal/75 dark:text-white/70 font-inter">
                      {item.description}
                    </p>
                  </div>
                </div>
              ))}

            </div>

          </div>
        </section>

        {/* Investor Types */}
        <section className="py-16 px-4 max-w-4xl mx-auto">

          <h2 className="text-3xl font-bold text-center text-zrp-charcoal dark:text-white font-orbitron mb-10">
            {t("investors.typesHeading")}
          </h2>

          <div className="grid sm:grid-cols-2 gap-4">

            {INVESTOR_TYPES.map((type) => (
              <div
                key={type}
                className="flex items-center gap-3 p-4 bg-zrp-silver/20 dark:bg-zrp-charcoal/50 rounded-lg border border-zrp-silver/30 dark:border-zrp-charcoal"
              >
                <span className="text-zrp-red font-bold flex-shrink-0">
                  ✓
                </span>

                <span className="text-zrp-charcoal/90 dark:text-white/80 font-inter">
                  {type}
                </span>
              </div>
            ))}

          </div>

        </section>

        {/* Charity */}
        <section className="py-16 px-4 max-w-6xl mx-auto">

          <div className="bg-gradient-to-r from-zrp-red to-zrp-darkRed rounded-xl p-8 sm:p-10 text-white">

            <div className="grid md:grid-cols-2 gap-8 items-center">

              <div>

                <h2 className="text-3xl font-bold font-orbitron">
                  {t("investors.charityHeading")}
                </h2>

                <p className="mt-4 text-white/90 font-inter leading-relaxed">
                  {t("investors.charityDesc")}
                </p>

              </div>

              <div className="text-center">

                <div className="text-6xl font-bold font-orbitron">
                  35%
                </div>

                <p className="mt-2 text-white/80 font-inter">
                  {t("investors.charityStatLabel")}
                </p>

                <div className="mt-5 text-3xl">
                  👶 📚 🏥 🌍
                </div>

              </div>

            </div>

          </div>

        </section>

        {/* Investor Contact */}
        <section className="bg-gradient-to-br from-zrp-darkRed to-zrp-deepBlack py-16 px-4">

          <div className="max-w-2xl mx-auto text-center">

            <h2 className="text-2xl sm:text-3xl font-bold text-white font-orbitron">
              {t("investors.contactHeading")}
            </h2>

            <p className="mt-3 text-white/80 font-inter">
              {t("investors.contactDesc")}
            </p>

            <div className="mt-6 flex flex-wrap justify-center gap-4">

              <a
                href="mailto:investors@zrp.one"
                className="inline-block px-6 py-3 bg-white text-zrp-darkRed font-semibold rounded-full shadow-lg hover:bg-gray-200 transition font-inter"
              >
                investors@zrp.one
              </a>

              <Link
                href="/about"
                className="inline-block px-6 py-3 bg-transparent border-2 border-white text-white font-semibold rounded-full hover:bg-white/10 transition font-inter"
              >
                {t("investors.learnMoreAboutZrp")}
              </Link>

            </div>

            <p className="mt-7 text-xs text-white/50 font-inter leading-relaxed">
              {t("investors.disclaimer")}
            </p>

          </div>

        </section>

        {/* Closing */}
        <section className="py-16 px-4 max-w-4xl mx-auto text-center">

          <blockquote className="text-2xl font-orbitron text-zrp-charcoal dark:text-white italic">
            {t("investors.closingQuote")}
          </blockquote>

          <div className="mt-6 text-zrp-charcoal/50 dark:text-white/50 font-inter text-sm">
            ZRP Social
          </div>

        </section>

      </main>
    </div>
  );
}
