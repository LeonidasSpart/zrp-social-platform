"use client";

import Image from "next/image";
import Link from "next/link";
import { useLanguage } from "@/contexts/LanguageContext";
import { MessageSquare, ShieldCheck, Users, Compass } from "lucide-react";

/**
 * ZRP's institutional identity page. Every string here is read through
 * useLanguage()/t() from the "about.*" namespace in
 * src/lib/translations.ts, translated into all SUPPORTED_LANGUAGES - no
 * hardcoded English, no invented facts or figures beyond what's already
 * published elsewhere (Charity page, Press Kit). The native app's
 * equivalent content feed is ABOUT_CONFIG in src/lib/legal-content.ts,
 * served at /api/legal/about, and mirrors this page's section structure.
 */
export default function AboutPage() {
  const { t } = useLanguage();

  const pillars = [
    {
      icon: MessageSquare,
      title: t("about.pillarExpressionTitle"),
      body: [t("about.pillarExpressionP1"), t("about.pillarExpressionP2")],
    },
    {
      icon: ShieldCheck,
      title: t("about.pillarPrivacyTitle"),
      body: [t("about.pillarPrivacyP1"), t("about.pillarPrivacyP2")],
    },
    {
      icon: Users,
      title: t("about.pillarPeopleTitle"),
      body: [t("about.pillarPeopleP1"), t("about.pillarPeopleP2")],
    },
  ];

  return (
    <div className="text-gray-800 dark:text-gray-200">
      {/* ─── Hero ─── */}
      <section className="text-center px-4 pt-12 pb-10 md:pt-20 md:pb-14 border-b border-gray-200 dark:border-gray-800">
        <div className="flex justify-center mb-6">
          <Image src="/logo.png" alt="ZRP" width={80} height={80} className="w-16 h-16 md:w-20 md:h-20 object-contain" />
        </div>
        <h1 className="text-4xl md:text-5xl font-orbitron font-bold text-zrp-red">{t("about.title")}</h1>
        <p className="mt-4 text-lg md:text-xl text-gray-600 dark:text-gray-400 max-w-2xl mx-auto leading-relaxed">
          {t("about.subtitle")}
        </p>
      </section>

      <div className="max-w-4xl mx-auto px-4 py-12 md:py-16 space-y-14 md:space-y-20">
        {/* ─── Who We Are ─── */}
        <section aria-labelledby="about-who-heading">
          <h2 id="about-who-heading" className="font-orbitron text-2xl md:text-3xl font-bold text-gray-900 dark:text-white mb-4">
            {t("about.whoWeAreTitle")}
          </h2>
          <p className="text-base md:text-lg leading-relaxed">{t("about.whoWeAreP1")}</p>
        </section>

        {/* ─── Why ZRP Exists ─── */}
        <section aria-labelledby="about-why-heading">
          <h2 id="about-why-heading" className="font-orbitron text-2xl md:text-3xl font-bold text-gray-900 dark:text-white mb-4">
            {t("about.whyExistsTitle")}
          </h2>
          <div className="space-y-4 text-base md:text-lg leading-relaxed">
            <p>{t("about.whyExistsP1")}</p>
            <p>{t("about.whyExistsP2")}</p>
          </div>
        </section>

        {/* ─── Swiss and European Identity ─── */}
        <section aria-labelledby="about-swiss-heading">
          <h2 id="about-swiss-heading" className="font-orbitron text-2xl md:text-3xl font-bold text-gray-900 dark:text-white mb-4">
            {t("about.swissTitle")}
          </h2>
          <div className="space-y-4 text-base md:text-lg leading-relaxed">
            <p>{t("about.swissP1")}</p>
            <p>{t("about.swissP2")}</p>
          </div>
        </section>

        {/* ─── What ZRP Stands For ─── */}
        <section aria-labelledby="about-pillars-heading">
          <h2
            id="about-pillars-heading"
            className="font-orbitron text-2xl md:text-3xl font-bold text-gray-900 dark:text-white mb-8 text-center"
          >
            {t("about.pillarsTitle")}
          </h2>
          <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
            {pillars.map((pillar) => {
              const Icon = pillar.icon;
              return (
                <div
                  key={pillar.title}
                  className="rounded-2xl border border-gray-200 dark:border-gray-800 bg-white dark:bg-zrp-charcoal p-6"
                >
                  <Icon aria-hidden="true" className="w-8 h-8 text-zrp-red mb-4" />
                  <h3 className="font-orbitron text-lg font-semibold text-gray-900 dark:text-white mb-2">{pillar.title}</h3>
                  <div className="space-y-3 text-sm text-gray-600 dark:text-gray-400 leading-relaxed">
                    {pillar.body.map((paragraph) => (
                      <p key={paragraph}>{paragraph}</p>
                    ))}
                  </div>
                </div>
              );
            })}
          </div>
        </section>

        {/* ─── The ZRP Ecosystem ─── */}
        <section aria-labelledby="about-ecosystem-heading">
          <h2
            id="about-ecosystem-heading"
            className="font-orbitron text-2xl md:text-3xl font-bold text-gray-900 dark:text-white mb-4"
          >
            {t("about.ecosystemTitle")}
          </h2>
          <p className="text-base md:text-lg leading-relaxed">{t("about.ecosystemP1")}</p>
        </section>

        {/* ─── Our Community ─── */}
        <section aria-labelledby="about-community-heading">
          <h2
            id="about-community-heading"
            className="font-orbitron text-2xl md:text-3xl font-bold text-gray-900 dark:text-white mb-4"
          >
            {t("about.communityTitle")}
          </h2>
          <p className="text-base md:text-lg leading-relaxed">{t("about.communityP1")}</p>
        </section>

        {/* ─── Social Impact ─── */}
        <section aria-labelledby="about-impact-heading">
          <div className="rounded-2xl border border-zrp-red/20 bg-zrp-red/5 dark:bg-zrp-red/10 p-6 md:p-8">
            <h2
              id="about-impact-heading"
              className="font-orbitron text-2xl md:text-3xl font-bold text-gray-900 dark:text-white mb-4"
            >
              {t("about.impactTitle")}
            </h2>
            <p className="text-base md:text-lg leading-relaxed">{t("about.impactP1")}</p>
            <Link
              href="/charity"
              className="inline-block mt-4 text-sm font-semibold text-zrp-red hover:text-zrp-darkRed underline underline-offset-4"
            >
              {t("footer.charity")} →
            </Link>
          </div>
        </section>

        {/* ─── Our Vision ─── */}
        <section aria-labelledby="about-vision-heading">
          <div className="flex items-start gap-4">
            <Compass aria-hidden="true" className="w-8 h-8 text-zrp-red shrink-0 mt-1" />
            <div>
              <h2
                id="about-vision-heading"
                className="font-orbitron text-2xl md:text-3xl font-bold text-gray-900 dark:text-white mb-4"
              >
                {t("about.visionTitle")}
              </h2>
              <p className="text-base md:text-lg leading-relaxed">{t("about.visionP1")}</p>
            </div>
          </div>
        </section>

        {/* ─── Join ZRP ─── */}
        <section aria-labelledby="about-join-heading" className="text-center pt-8 border-t border-gray-200 dark:border-gray-800">
          <h2 id="about-join-heading" className="font-orbitron text-2xl md:text-3xl font-bold text-gray-900 dark:text-white mb-4">
            {t("about.joinTitle")}
          </h2>
          <p className="text-base md:text-lg leading-relaxed max-w-2xl mx-auto mb-6">{t("about.joinP1")}</p>
          <p className="text-sm font-medium text-gray-500 dark:text-gray-400 mb-6">{t("about.ctaText")}</p>
          <Link
            href="/signup"
            className="inline-block bg-zrp-red text-white px-8 py-3 rounded-lg font-semibold hover:bg-zrp-darkRed transition"
          >
            {t("about.ctaButton")}
          </Link>

          <nav aria-label={t("footer.companyHeading")} className="mt-10 flex flex-wrap justify-center gap-x-6 gap-y-2 text-sm">
            <Link href="/press" className="text-gray-500 dark:text-gray-400 hover:text-zrp-red underline underline-offset-4">
              {t("press.heroTitle")}
            </Link>
            <Link href="/investors" className="text-gray-500 dark:text-gray-400 hover:text-zrp-red underline underline-offset-4">
              {t("investors.hero.title")}
            </Link>
            <Link href="/community-code" className="text-gray-500 dark:text-gray-400 hover:text-zrp-red underline underline-offset-4">
              {t("communityCode.navLabel")}
            </Link>
            <Link href="/privacy" className="text-gray-500 dark:text-gray-400 hover:text-zrp-red underline underline-offset-4">
              {t("footer.privacyPolicy")}
            </Link>
            <Link href="/terms" className="text-gray-500 dark:text-gray-400 hover:text-zrp-red underline underline-offset-4">
              {t("footer.termsOfService")}
            </Link>
            <Link href="/help" className="text-gray-500 dark:text-gray-400 hover:text-zrp-red underline underline-offset-4">
              {t("footer.helpCenter")}
            </Link>
            <Link href="/contact" className="text-gray-500 dark:text-gray-400 hover:text-zrp-red underline underline-offset-4">
              {t("footer.contact")}
            </Link>
          </nav>
        </section>
      </div>
    </div>
  );
}
