"use client";

import Link from "next/link";
import { useLanguage } from "@/contexts/LanguageContext";
import {
  Globe2,
  Smartphone,
  MessageCircle,
  Users,
  Coins,
  Briefcase,
  Megaphone,
  Newspaper,
  Music2,
  Gamepad2,
  Store,
  Award,
  Video,
  Lock,
  Server,
  Layers,
  Languages,
  BadgeCheck,
  Scale,
  TrendingUp,
  Building2,
  UserCheck,
  Landmark,
  Rocket,
  Mail,
} from "lucide-react";

/**
 * Investor Relations page.
 *
 * Content policy for this page specifically: every factual claim is
 * sourced from this repository (Prisma schema, src/lib/limits.ts,
 * package.json) or from an explicitly cited external source with a date.
 * Nothing here is projected, estimated, or aspirational unless labeled as
 * such. See the PR description for the section-by-section source list.
 *
 * All copy is read through useLanguage()/t(), the same as every other
 * page, and is fully translated into all SUPPORTED_LANGUAGES - see the
 * "investors.*" keys in src/lib/translations.ts. The native app content
 * feed at /api/legal/investors (src/lib/legal-content.ts, INVESTORS_CONFIG)
 * reads the exact same keys, so the web page and native apps never drift.
 */

function SectionHeading({ eyebrow, title, subtitle }: { eyebrow?: string; title: string; subtitle?: string }) {
  return (
    <div className="max-w-3xl mx-auto text-center mb-12">
      {eyebrow && (
        <p className="text-sm font-semibold text-zrp-red mb-2 font-inter">{eyebrow}</p>
      )}
      <h2 className="text-3xl sm:text-4xl font-bold text-zrp-charcoal dark:text-white font-orbitron">
        {title}
      </h2>
      {subtitle && (
        <p className="mt-4 text-zrp-charcoal/70 dark:text-white/70 font-inter leading-relaxed">
          {subtitle}
        </p>
      )}
    </div>
  );
}

export default function InvestorsPage() {
  const { t } = useLanguage();

  const PLATFORM_ECOSYSTEM = [
    { icon: MessageCircle, title: t("investors.platform.socialFeed.title"), description: t("investors.platform.socialFeed.desc") },
    { icon: Video, title: t("investors.platform.shorts.title"), description: t("investors.platform.shorts.desc") },
    { icon: Users, title: t("investors.platform.communities.title"), description: t("investors.platform.communities.desc") },
    { icon: MessageCircle, title: t("investors.platform.messaging.title"), description: t("investors.platform.messaging.desc") },
    { icon: Coins, title: t("investors.platform.creatorMonetization.title"), description: t("investors.platform.creatorMonetization.desc") },
    { icon: Briefcase, title: t("investors.platform.businessTools.title"), description: t("investors.platform.businessTools.desc") },
    { icon: Store, title: t("investors.platform.marketplace.title"), description: t("investors.platform.marketplace.desc") },
    { icon: Megaphone, title: t("investors.platform.advertising.title"), description: t("investors.platform.advertising.desc") },
    { icon: Gamepad2, title: t("investors.platform.play.title"), description: t("investors.platform.play.desc") },
    { icon: Newspaper, title: t("investors.platform.news.title"), description: t("investors.platform.news.desc") },
    { icon: Music2, title: t("investors.platform.music.title"), description: t("investors.platform.music.desc") },
    { icon: Award, title: t("investors.platform.ambassadors.title"), description: t("investors.platform.ambassadors.desc") },
  ];

  const BUSINESS_MODEL = [
    {
      icon: BadgeCheck,
      title: t("investors.businessModel.subscriptions.title"),
      what: t("investors.businessModel.subscriptions.what"),
      who: t("investors.businessModel.subscriptions.who"),
      value: t("investors.businessModel.subscriptions.value"),
    },
    {
      icon: Coins,
      title: t("investors.businessModel.creatorMonetization.title"),
      what: t("investors.businessModel.creatorMonetization.what"),
      who: t("investors.businessModel.creatorMonetization.who"),
      value: t("investors.businessModel.creatorMonetization.value"),
    },
    {
      icon: Megaphone,
      title: t("investors.businessModel.advertising.title"),
      what: t("investors.businessModel.advertising.what"),
      who: t("investors.businessModel.advertising.who"),
      value: t("investors.businessModel.advertising.value"),
    },
  ];

  const ROADMAP = [
    {
      label: t("investors.roadmap.nowLabel"),
      items: [t("investors.roadmap.nowItem1"), t("investors.roadmap.nowItem2")],
    },
    {
      label: t("investors.roadmap.nextLabel"),
      items: [t("investors.roadmap.nextItem1"), t("investors.roadmap.nextItem2")],
    },
    {
      label: t("investors.roadmap.laterLabel"),
      items: [t("investors.roadmap.laterItem1"), t("investors.roadmap.laterItem2")],
    },
  ];

  const GROWTH_AREAS = [
    { icon: Server, title: t("investors.growth.infra.title"), description: t("investors.growth.infra.desc") },
    { icon: Lock, title: t("investors.growth.security.title"), description: t("investors.growth.security.desc") },
    { icon: Layers, title: t("investors.growth.product.title"), description: t("investors.growth.product.desc") },
    { icon: Globe2, title: t("investors.growth.global.title"), description: t("investors.growth.global.desc") },
    { icon: Users, title: t("investors.growth.creatorBiz.title"), description: t("investors.growth.creatorBiz.desc") },
  ];

  const INVESTOR_TYPES = [
    { icon: UserCheck, label: t("investors.types.individual") },
    { icon: Rocket, label: t("investors.types.angel") },
    { icon: Building2, label: t("investors.types.strategic") },
    { icon: Landmark, label: t("investors.types.familyOffice") },
    { icon: TrendingUp, label: t("investors.types.vc") },
    { icon: Briefcase, label: t("investors.types.corporate") },
  ];

  const FAQ = [
    { q: t("investors.faq.q1"), a: t("investors.faq.a1") },
    { q: t("investors.faq.q2"), a: t("investors.faq.a2") },
    { q: t("investors.faq.q3"), a: t("investors.faq.a3") },
    { q: t("investors.faq.q4"), a: t("investors.faq.a4") },
    { q: t("investors.faq.q5"), a: t("investors.faq.a5") },
    { q: t("investors.faq.q6"), a: t("investors.faq.a6") },
    { q: t("investors.faq.q7"), a: t("investors.faq.a7") },
    { q: t("investors.faq.q8"), a: t("investors.faq.a8") },
    { q: t("investors.faq.q9"), a: t("investors.faq.a9") },
    { q: t("investors.faq.q10"), a: t("investors.faq.a10") },
  ];

  return (
    <div className="min-h-screen bg-white dark:bg-zrp-deepBlack font-inter">
      <div>

        {/* ─────────────────────────────────────────────────────── */}
        {/* HERO */}
        {/* ─────────────────────────────────────────────────────── */}

        <section className="relative bg-gradient-to-br from-zrp-darkRed to-zrp-deepBlack py-20 px-4">
          <div className="max-w-4xl mx-auto text-center">
            <span className="inline-block bg-white/10 backdrop-blur-sm px-3 py-1 rounded-full text-sm font-medium text-white/90 mb-6 font-inter">
              {t("investors.hero.badge")}
            </span>

            <img src="/logo.png" alt="ZRP Social Logo" className="h-16 mx-auto mb-6 object-contain" />

            <h1 className="text-4xl sm:text-5xl font-extrabold font-orbitron text-white leading-tight">
              {t("investors.hero.title")}
            </h1>

            <p className="mt-6 text-xl text-white/90 max-w-2xl mx-auto font-inter">
              {t("investors.hero.subtitle")}
            </p>

            <div className="mt-8 flex flex-wrap justify-center gap-4">
              <a
                href="mailto:investors@zrp.one"
                className="px-6 py-3 bg-white text-zrp-darkRed font-semibold rounded-full shadow-lg hover:bg-gray-200 transition font-inter"
              >
                {t("investors.hero.ctaContact")}
              </a>
              <Link
                href="/about"
                className="px-6 py-3 bg-transparent border-2 border-white text-white font-semibold rounded-full shadow-lg hover:bg-white/10 transition font-inter"
              >
                {t("investors.hero.ctaExplore")}
              </Link>
            </div>
          </div>
        </section>

        {/* ─────────────────────────────────────────────────────── */}
        {/* WHAT IS ZRP */}
        {/* ─────────────────────────────────────────────────────── */}

        <section className="py-16 px-4 max-w-4xl mx-auto">
          <SectionHeading title={t("investors.whatIsZrp.heading")} />

          <div className="space-y-5 text-zrp-charcoal/80 dark:text-white/70 font-inter leading-relaxed">
            <p>{t("investors.whatIsZrp.p1")}</p>
            <p>{t("investors.whatIsZrp.p2")}</p>
          </div>
        </section>

        {/* ─────────────────────────────────────────────────────── */}
        {/* THE PROBLEM */}
        {/* ─────────────────────────────────────────────────────── */}

        <section className="bg-zrp-silver/10 dark:bg-zrp-charcoal/30 py-16 px-4">
          <div className="max-w-4xl mx-auto">
            <SectionHeading title={t("investors.problem.heading")} />
            <div className="space-y-5 text-zrp-charcoal/80 dark:text-white/70 font-inter leading-relaxed">
              <p>{t("investors.problem.p1")}</p>
              <p>{t("investors.problem.p2")}</p>
            </div>
          </div>
        </section>

        {/* ─────────────────────────────────────────────────────── */}
        {/* THE ZRP APPROACH */}
        {/* ─────────────────────────────────────────────────────── */}

        <section className="py-16 px-4 max-w-4xl mx-auto">
          <SectionHeading title={t("investors.approach.heading")} />
          <div className="space-y-5 text-zrp-charcoal/80 dark:text-white/70 font-inter leading-relaxed">
            <p>{t("investors.approach.p1")}</p>
            <p>{t("investors.approach.p2")}</p>
          </div>
        </section>

        {/* ─────────────────────────────────────────────────────── */}
        {/* PLATFORM ECOSYSTEM */}
        {/* ─────────────────────────────────────────────────────── */}

        <section className="bg-zrp-silver/10 dark:bg-zrp-charcoal/30 py-16 px-4">
          <div className="max-w-6xl mx-auto">
            <SectionHeading
              title={t("investors.platform.heading")}
              subtitle={t("investors.platform.subtitle")}
            />

            <div className="grid sm:grid-cols-2 lg:grid-cols-3 gap-6">
              {PLATFORM_ECOSYSTEM.map((item) => {
                const Icon = item.icon;
                return (
                  <div
                    key={item.title}
                    className="bg-white dark:bg-zrp-charcoal/80 p-6 rounded-xl border border-zrp-silver/30 dark:border-zrp-charcoal"
                  >
                    <div className="w-10 h-10 rounded-lg bg-zrp-red/10 dark:bg-zrp-red/20 flex items-center justify-center text-zrp-red">
                      <Icon className="w-5 h-5" aria-hidden="true" />
                    </div>
                    <h3 className="mt-5 text-lg font-bold font-orbitron text-zrp-charcoal dark:text-white">
                      {item.title}
                    </h3>
                    <p className="mt-2 text-zrp-charcoal/70 dark:text-white/70 font-inter text-sm leading-relaxed">
                      {item.description}
                    </p>
                  </div>
                );
              })}
            </div>
          </div>
        </section>

        {/* ─────────────────────────────────────────────────────── */}
        {/* TRACTION */}
        {/* ─────────────────────────────────────────────────────── */}

        <section className="py-16 px-4 max-w-6xl mx-auto">
          <SectionHeading title={t("investors.traction.heading")} />

          <div className="grid sm:grid-cols-3 gap-6">
            <div className="text-center p-7 bg-zrp-silver/20 dark:bg-zrp-charcoal/50 rounded-xl border border-zrp-silver/30 dark:border-zrp-charcoal">
              <div className="text-4xl font-bold font-orbitron text-zrp-red">{t("investors.traction.stat1Value")}</div>
              <p className="mt-2 text-sm text-zrp-charcoal/70 dark:text-white/70 font-inter">{t("investors.traction.stat1Label")}</p>
              <p className="mt-1 text-xs text-zrp-charcoal/50 dark:text-white/50 font-inter">{t("investors.traction.stat1Date")}</p>
            </div>
            <div className="text-center p-7 bg-zrp-silver/20 dark:bg-zrp-charcoal/50 rounded-xl border border-zrp-silver/30 dark:border-zrp-charcoal">
              <div className="text-4xl font-bold font-orbitron text-zrp-red">{t("investors.traction.stat2Value")}</div>
              <p className="mt-2 text-sm text-zrp-charcoal/70 dark:text-white/70 font-inter">{t("investors.traction.stat2Label")}</p>
              <p className="mt-1 text-xs text-zrp-charcoal/50 dark:text-white/50 font-inter">{t("investors.traction.stat2Date")}</p>
            </div>
            <div className="text-center p-7 bg-zrp-silver/20 dark:bg-zrp-charcoal/50 rounded-xl border border-zrp-silver/30 dark:border-zrp-charcoal">
              <div className="text-4xl font-bold font-orbitron text-zrp-red">{t("investors.traction.stat3Value")}</div>
              <p className="mt-2 text-sm text-zrp-charcoal/70 dark:text-white/70 font-inter">{t("investors.traction.stat3Label")}</p>
              <p className="mt-1 text-xs text-zrp-charcoal/50 dark:text-white/50 font-inter">{t("investors.traction.stat3Date")}</p>
            </div>
          </div>

          <p className="mt-6 text-center text-xs text-zrp-charcoal/50 dark:text-white/50 font-inter max-w-2xl mx-auto">
            {t("investors.traction.noteBefore")}{" "}
            <Link href="/transparency" className="text-zrp-red hover:underline">
              zrp.one/transparency
            </Link>{" "}
            {t("investors.traction.noteAnd")}{" "}
            <Link href="/charity" className="text-zrp-red hover:underline">
              zrp.one/charity
            </Link>
            {t("investors.traction.noteEnd")}
          </p>
        </section>

        {/* ─────────────────────────────────────────────────────── */}
        {/* BUSINESS MODEL */}
        {/* ─────────────────────────────────────────────────────── */}

        <section className="bg-zrp-silver/10 dark:bg-zrp-charcoal/30 py-16 px-4">
          <div className="max-w-5xl mx-auto">
            <SectionHeading
              title={t("investors.businessModel.heading")}
              subtitle={t("investors.businessModel.subtitle")}
            />

            <div className="space-y-6">
              {BUSINESS_MODEL.map((item) => {
                const Icon = item.icon;
                return (
                  <div
                    key={item.title}
                    className="bg-white dark:bg-zrp-charcoal/80 p-6 sm:p-8 rounded-xl border border-zrp-silver/30 dark:border-zrp-charcoal"
                  >
                    <div className="flex items-center gap-3 mb-4">
                      <div className="w-10 h-10 rounded-lg bg-zrp-red/10 dark:bg-zrp-red/20 flex items-center justify-center text-zrp-red flex-shrink-0">
                        <Icon className="w-5 h-5" aria-hidden="true" />
                      </div>
                      <h3 className="text-xl font-bold font-orbitron text-zrp-charcoal dark:text-white">
                        {item.title}
                      </h3>
                    </div>
                    <dl className="grid sm:grid-cols-3 gap-4 text-sm font-inter">
                      <div>
                        <dt className="font-semibold text-zrp-charcoal dark:text-white mb-1">{t("investors.businessModel.whatLabel")}</dt>
                        <dd className="text-zrp-charcoal/70 dark:text-white/70 leading-relaxed">{item.what}</dd>
                      </div>
                      <div>
                        <dt className="font-semibold text-zrp-charcoal dark:text-white mb-1">{t("investors.businessModel.whoLabel")}</dt>
                        <dd className="text-zrp-charcoal/70 dark:text-white/70 leading-relaxed">{item.who}</dd>
                      </div>
                      <div>
                        <dt className="font-semibold text-zrp-charcoal dark:text-white mb-1">{t("investors.businessModel.valueLabel")}</dt>
                        <dd className="text-zrp-charcoal/70 dark:text-white/70 leading-relaxed">{item.value}</dd>
                      </div>
                    </dl>
                  </div>
                );
              })}
            </div>

            {/* Subscription tiers */}
            <div className="mt-10 bg-white dark:bg-zrp-charcoal/80 p-6 sm:p-8 rounded-xl border border-zrp-silver/30 dark:border-zrp-charcoal">
              <h4 className="text-lg font-bold font-orbitron text-zrp-charcoal dark:text-white mb-5">
                {t("investors.businessModel.tiersHeading")}
              </h4>
              <div className="grid grid-cols-2 sm:grid-cols-4 gap-4 text-center">
                {[
                  { name: t("investors.businessModel.planFree"), price: "$0" },
                  { name: t("investors.businessModel.planPro"), price: "$9.99/mo" },
                  { name: t("investors.businessModel.planBusiness"), price: "$49.99/mo" },
                  { name: t("investors.businessModel.planEnterprise"), price: "$99.99/mo" },
                ].map((plan) => (
                  <div
                    key={plan.name}
                    className="p-4 rounded-lg bg-zrp-silver/10 dark:bg-zrp-charcoal/50 border border-zrp-silver/30 dark:border-zrp-charcoal"
                  >
                    <div className="font-orbitron font-bold text-zrp-charcoal dark:text-white">{plan.name}</div>
                    <div className="text-zrp-red font-semibold mt-1">{plan.price}</div>
                  </div>
                ))}
              </div>
              <p className="mt-4 text-xs text-zrp-charcoal/50 dark:text-white/50 font-inter text-center">
                {t("investors.businessModel.pricingNoteBefore")}{" "}
                <Link href="/pricing" className="text-zrp-red hover:underline">
                  zrp.one/pricing
                </Link>
                {t("investors.businessModel.pricingNoteEnd")}
              </p>
            </div>
          </div>
        </section>

        {/* ─────────────────────────────────────────────────────── */}
        {/* MARKET OPPORTUNITY */}
        {/* ─────────────────────────────────────────────────────── */}

        <section className="py-16 px-4 max-w-4xl mx-auto">
          <SectionHeading title={t("investors.market.heading")} />

          <div className="space-y-6 font-inter">
            <div className="p-6 rounded-xl border border-zrp-silver/30 dark:border-zrp-charcoal bg-zrp-silver/10 dark:bg-zrp-charcoal/30">
              <h4 className="font-semibold text-zrp-charcoal dark:text-white mb-2">{t("investors.market.factHeading")}</h4>
              <p className="text-sm text-zrp-charcoal/80 dark:text-white/70 leading-relaxed">{t("investors.market.factBody")}</p>
            </div>
            <div className="p-6 rounded-xl border border-zrp-silver/30 dark:border-zrp-charcoal bg-zrp-silver/10 dark:bg-zrp-charcoal/30">
              <h4 className="font-semibold text-zrp-charcoal dark:text-white mb-2">{t("investors.market.targetHeading")}</h4>
              <p className="text-sm text-zrp-charcoal/80 dark:text-white/70 leading-relaxed">{t("investors.market.targetBody")}</p>
            </div>
            <div className="p-6 rounded-xl border border-zrp-silver/30 dark:border-zrp-charcoal bg-zrp-silver/10 dark:bg-zrp-charcoal/30">
              <h4 className="font-semibold text-zrp-charcoal dark:text-white mb-2">{t("investors.market.opportunityHeading")}</h4>
              <p className="text-sm text-zrp-charcoal/80 dark:text-white/70 leading-relaxed">{t("investors.market.opportunityBody")}</p>
            </div>
          </div>
        </section>

        {/* ─────────────────────────────────────────────────────── */}
        {/* TECHNOLOGY & INFRASTRUCTURE */}
        {/* ─────────────────────────────────────────────────────── */}

        <section className="bg-zrp-silver/10 dark:bg-zrp-charcoal/30 py-16 px-4">
          <div className="max-w-5xl mx-auto">
            <SectionHeading title={t("investors.technology.heading")} />

            <div className="grid sm:grid-cols-2 gap-6">
              <div className="bg-white dark:bg-zrp-charcoal/80 p-6 rounded-xl border border-zrp-silver/30 dark:border-zrp-charcoal">
                <div className="flex items-center gap-3 mb-3">
                  <Smartphone className="w-5 h-5 text-zrp-red" aria-hidden="true" />
                  <h4 className="font-bold font-orbitron text-zrp-charcoal dark:text-white">{t("investors.technology.crossPlatform.title")}</h4>
                </div>
                <p className="text-sm text-zrp-charcoal/70 dark:text-white/70 font-inter leading-relaxed">{t("investors.technology.crossPlatform.desc")}</p>
              </div>
              <div className="bg-white dark:bg-zrp-charcoal/80 p-6 rounded-xl border border-zrp-silver/30 dark:border-zrp-charcoal">
                <div className="flex items-center gap-3 mb-3">
                  <Server className="w-5 h-5 text-zrp-red" aria-hidden="true" />
                  <h4 className="font-bold font-orbitron text-zrp-charcoal dark:text-white">{t("investors.technology.realtime.title")}</h4>
                </div>
                <p className="text-sm text-zrp-charcoal/70 dark:text-white/70 font-inter leading-relaxed">{t("investors.technology.realtime.desc")}</p>
              </div>
              <div className="bg-white dark:bg-zrp-charcoal/80 p-6 rounded-xl border border-zrp-silver/30 dark:border-zrp-charcoal">
                <div className="flex items-center gap-3 mb-3">
                  <Coins className="w-5 h-5 text-zrp-red" aria-hidden="true" />
                  <h4 className="font-bold font-orbitron text-zrp-charcoal dark:text-white">{t("investors.technology.payments.title")}</h4>
                </div>
                <p className="text-sm text-zrp-charcoal/70 dark:text-white/70 font-inter leading-relaxed">{t("investors.technology.payments.desc")}</p>
              </div>
              <div className="bg-white dark:bg-zrp-charcoal/80 p-6 rounded-xl border border-zrp-silver/30 dark:border-zrp-charcoal">
                <div className="flex items-center gap-3 mb-3">
                  <Languages className="w-5 h-5 text-zrp-red" aria-hidden="true" />
                  <h4 className="font-bold font-orbitron text-zrp-charcoal dark:text-white">{t("investors.technology.localization.title")}</h4>
                </div>
                <p className="text-sm text-zrp-charcoal/70 dark:text-white/70 font-inter leading-relaxed">{t("investors.technology.localization.desc")}</p>
              </div>
            </div>
          </div>
        </section>

        {/* ─────────────────────────────────────────────────────── */}
        {/* SECURITY & TRUST */}
        {/* ─────────────────────────────────────────────────────── */}

        <section className="py-16 px-4 max-w-4xl mx-auto">
          <SectionHeading title={t("investors.security.heading")} />

          <div className="space-y-5 text-zrp-charcoal/80 dark:text-white/70 font-inter leading-relaxed">
            <p>{t("investors.security.p1")}</p>
            <p>
              {t("investors.security.p2Before")}{" "}
              <Link href="/transparency" className="text-zrp-red hover:underline">
                zrp.one/transparency
              </Link>
              {t("investors.security.p2After")}
            </p>
            <p className="text-sm text-zrp-charcoal/60 dark:text-white/60">{t("investors.security.p3")}</p>
          </div>
        </section>

        {/* ─────────────────────────────────────────────────────── */}
        {/* SWISS / EUROPEAN POSITIONING */}
        {/* ─────────────────────────────────────────────────────── */}

        <section className="bg-zrp-silver/10 dark:bg-zrp-charcoal/30 py-16 px-4">
          <div className="max-w-4xl mx-auto text-center">
            <SectionHeading title={t("investors.swiss.heading")} />
            <p className="text-zrp-charcoal/80 dark:text-white/70 font-inter leading-relaxed">
              {t("investors.swiss.body")}
            </p>
          </div>
        </section>

        {/* ─────────────────────────────────────────────────────── */}
        {/* SOCIAL IMPACT */}
        {/* ─────────────────────────────────────────────────────── */}

        <section className="py-16 px-4 max-w-6xl mx-auto">
          <div className="bg-gradient-to-r from-zrp-red to-zrp-darkRed rounded-xl p-8 sm:p-10 text-white">
            <div className="grid md:grid-cols-2 gap-8 items-center">
              <div>
                <h2 className="text-3xl font-bold font-orbitron">{t("investors.impact.heading")}</h2>
                <p className="mt-4 text-white/90 font-inter leading-relaxed">
                  {t("investors.impact.bodyBefore")}{" "}
                  <Link href="/charity" className="underline hover:no-underline">
                    zrp.one/charity
                  </Link>
                  {t("investors.impact.bodyAfter")}
                </p>
              </div>
              <div className="text-center">
                <div className="text-6xl font-bold font-orbitron">35%</div>
                <p className="mt-2 text-white/80 font-inter">{t("investors.impact.statLabel")}</p>
                <div className="mt-5 text-3xl" aria-hidden="true">👶 📚 🏥 🌍</div>
              </div>
            </div>
          </div>
        </section>

        {/* ─────────────────────────────────────────────────────── */}
        {/* ROADMAP */}
        {/* ─────────────────────────────────────────────────────── */}

        <section className="bg-zrp-silver/10 dark:bg-zrp-charcoal/30 py-16 px-4">
          <div className="max-w-5xl mx-auto">
            <SectionHeading
              title={t("investors.roadmap.heading")}
              subtitle={t("investors.roadmap.subtitle")}
            />
            <div className="grid md:grid-cols-3 gap-6">
              {ROADMAP.map((stage) => (
                <div
                  key={stage.label}
                  className="bg-white dark:bg-zrp-charcoal/80 p-6 rounded-xl border border-zrp-silver/30 dark:border-zrp-charcoal"
                >
                  <h4 className="text-sm font-bold uppercase tracking-wide text-zrp-red font-inter mb-4">
                    {stage.label}
                  </h4>
                  <ul className="space-y-3">
                    {stage.items.map((item) => (
                      <li key={item} className="flex items-start gap-2 text-sm text-zrp-charcoal/80 dark:text-white/70 font-inter">
                        <span className="text-zrp-red mt-1" aria-hidden="true">•</span>
                        <span>{item}</span>
                      </li>
                    ))}
                  </ul>
                </div>
              ))}
            </div>
          </div>
        </section>

        {/* ─────────────────────────────────────────────────────── */}
        {/* GROWTH OPPORTUNITIES */}
        {/* ─────────────────────────────────────────────────────── */}

        <section className="py-16 px-4 max-w-6xl mx-auto">
          <SectionHeading
            title={t("investors.growth.heading")}
            subtitle={t("investors.growth.subtitle")}
          />
          <div className="grid sm:grid-cols-2 lg:grid-cols-3 gap-6">
            {GROWTH_AREAS.map((item) => {
              const Icon = item.icon;
              return (
                <div
                  key={item.title}
                  className="flex items-start gap-4 p-6 bg-zrp-silver/20 dark:bg-zrp-charcoal/50 rounded-xl border border-zrp-silver/30 dark:border-zrp-charcoal"
                >
                  <div className="w-10 h-10 rounded-lg bg-zrp-red/10 dark:bg-zrp-red/20 flex items-center justify-center text-zrp-red flex-shrink-0">
                    <Icon className="w-5 h-5" aria-hidden="true" />
                  </div>
                  <div>
                    <h3 className="font-semibold text-zrp-charcoal dark:text-white font-orbitron">{item.title}</h3>
                    <p className="mt-1 text-sm text-zrp-charcoal/70 dark:text-white/70 font-inter">{item.description}</p>
                  </div>
                </div>
              );
            })}
          </div>
        </section>

        {/* ─────────────────────────────────────────────────────── */}
        {/* INVESTOR TYPES */}
        {/* ─────────────────────────────────────────────────────── */}

        <section className="bg-zrp-silver/10 dark:bg-zrp-charcoal/30 py-16 px-4">
          <div className="max-w-4xl mx-auto">
            <SectionHeading title={t("investors.types.heading")} />
            <div className="grid sm:grid-cols-2 gap-4">
              {INVESTOR_TYPES.map((type) => {
                const Icon = type.icon;
                return (
                  <div
                    key={type.label}
                    className="flex items-center gap-3 p-4 bg-white dark:bg-zrp-charcoal/80 rounded-lg border border-zrp-silver/30 dark:border-zrp-charcoal"
                  >
                    <Icon className="w-5 h-5 text-zrp-red flex-shrink-0" aria-hidden="true" />
                    <span className="text-zrp-charcoal/90 dark:text-white/80 font-inter">{type.label}</span>
                  </div>
                );
              })}
            </div>
          </div>
        </section>

        {/* ─────────────────────────────────────────────────────── */}
        {/* INVESTOR RELATIONS CTA */}
        {/* ─────────────────────────────────────────────────────── */}

        <section className="bg-gradient-to-br from-zrp-darkRed to-zrp-deepBlack py-16 px-4">
          <div className="max-w-2xl mx-auto text-center">
            <h2 className="text-2xl sm:text-3xl font-bold text-white font-orbitron">
              {t("investors.cta.heading")}
            </h2>
            <p className="mt-4 text-white/80 font-inter">
              {t("investors.cta.body")}
            </p>
            <div className="mt-6 flex flex-wrap justify-center gap-4">
              <a
                href="mailto:investors@zrp.one"
                className="inline-flex items-center gap-2 px-6 py-3 bg-white text-zrp-darkRed font-semibold rounded-full shadow-lg hover:bg-gray-200 transition font-inter"
              >
                <Mail className="w-4 h-4" aria-hidden="true" />
                investors@zrp.one
              </a>
              <Link
                href="/about"
                className="inline-block px-6 py-3 bg-transparent border-2 border-white text-white font-semibold rounded-full hover:bg-white/10 transition font-inter"
              >
                {t("investors.cta.learnMore")}
              </Link>
            </div>
          </div>
        </section>

        {/* ─────────────────────────────────────────────────────── */}
        {/* FAQ */}
        {/* ─────────────────────────────────────────────────────── */}

        <section className="py-16 px-4 max-w-4xl mx-auto">
          <SectionHeading title={t("investors.faq.heading")} />
          <div className="space-y-4">
            {FAQ.map((item) => (
              <details
                key={item.q}
                className="group bg-zrp-silver/10 dark:bg-zrp-charcoal/30 rounded-xl border border-zrp-silver/30 dark:border-zrp-charcoal p-5"
              >
                <summary className="font-semibold text-zrp-charcoal dark:text-white font-inter cursor-pointer list-none flex items-center justify-between gap-4">
                  {item.q}
                  <span className="text-zrp-red transition-transform group-open:rotate-45 text-xl leading-none" aria-hidden="true">+</span>
                </summary>
                <p className="mt-3 text-sm text-zrp-charcoal/70 dark:text-white/70 font-inter leading-relaxed">
                  {item.a}
                </p>
              </details>
            ))}
          </div>
        </section>

        {/* ─────────────────────────────────────────────────────── */}
        {/* LEGAL / DISCLAIMER */}
        {/* ─────────────────────────────────────────────────────── */}

        <section className="py-16 px-4 max-w-3xl mx-auto text-center">
          <Scale className="w-6 h-6 text-zrp-charcoal/40 dark:text-white/40 mx-auto mb-4" aria-hidden="true" />
          <p className="text-xs text-zrp-charcoal/50 dark:text-white/50 font-inter leading-relaxed">
            {t("investors.legal.disclaimer")}
          </p>
        </section>

        <section className="pb-16 px-4 max-w-4xl mx-auto text-center">
          <blockquote className="text-2xl font-orbitron text-zrp-charcoal dark:text-white italic">
            {t("investors.closing.quote")}
          </blockquote>
          <div className="mt-6 text-zrp-charcoal/50 dark:text-white/50 font-inter text-sm">{t("investors.closing.brand")}</div>
        </section>

      </div>
    </div>
  );
}
