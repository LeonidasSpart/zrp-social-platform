"use client";

import Link from "next/link";
import Image from "next/image";
import { useLanguage } from "@/contexts/LanguageContext";

export default function PrivacyPage() {
  const { t } = useLanguage();

  const SECTIONS = [
    { id: "introduction", number: "01", title: t("privacy.nav.introduction") },
    { id: "controller", number: "02", title: t("privacy.nav.controller") },
    { id: "data-collected", number: "03", title: t("privacy.nav.dataCollected") },
    { id: "data-use", number: "04", title: t("privacy.nav.dataUse") },
    { id: "legal-basis", number: "05", title: t("privacy.nav.legalBasis") },
    { id: "cookies", number: "06", title: t("privacy.nav.cookies") },
    { id: "sharing", number: "07", title: t("privacy.nav.sharing") },
    { id: "retention", number: "08", title: t("privacy.nav.retention") },
    { id: "transfers", number: "09", title: t("privacy.nav.transfers") },
    { id: "rights", number: "10", title: t("privacy.nav.rights") },
    { id: "security", number: "11", title: t("privacy.nav.security") },
    { id: "children", number: "12", title: t("privacy.nav.children") },
    { id: "moderation", number: "13", title: t("privacy.nav.moderation") },
    { id: "charity", number: "14", title: t("privacy.nav.charity") },
    { id: "changes", number: "15", title: t("privacy.nav.changes") },
    { id: "contact", number: "16", title: t("privacy.nav.contact") },
  ];

  const lastUpdated = new Date().toLocaleDateString("en-US", {
    year: "numeric",
    month: "long",
    day: "numeric",
  });

  return (
    <div className="min-h-screen bg-white dark:bg-zrp-deepBlack font-inter">
      <main>

        {/* ─────────────────────────────────────────────────────────────
            HERO
        ───────────────────────────────────────────────────────────── */}
        <section className="relative overflow-hidden bg-gradient-to-br from-zrp-darkRed to-zrp-deepBlack py-16 sm:py-20 px-4">
          <div className="absolute inset-0 pointer-events-none">
            <div className="absolute -top-24 -right-24 w-72 h-72 bg-zrp-red/20 rounded-full blur-3xl" />
            <div className="absolute -bottom-32 -left-24 w-80 h-80 bg-black/30 rounded-full blur-3xl" />
          </div>

          <div className="relative max-w-5xl mx-auto">

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

                <div className="inline-flex items-center gap-2 bg-white/10 backdrop-blur-sm border border-white/10 px-3 py-1.5 rounded-full text-xs text-white/90 font-medium mb-4">
                  🇨🇭 ZRP Social · {t("privacy.badgeSuffix")}
                </div>

                <h1 className="text-4xl sm:text-5xl font-extrabold font-orbitron text-white leading-tight">
                  {t("privacy.title")}
                </h1>

                <p className="mt-4 text-white/80 max-w-2xl text-base sm:text-lg leading-relaxed">
                  {t("privacy.subtitle")}
                </p>

              </div>

            </div>

            <div className="mt-8 flex flex-wrap gap-3">

              <div className="bg-white/10 backdrop-blur-sm border border-white/10 rounded-full px-4 py-2 text-sm text-white/90">
                {t("privacy.lastUpdated")} {lastUpdated}
              </div>

              <div className="bg-white/10 backdrop-blur-sm border border-white/10 rounded-full px-4 py-2 text-sm text-white/90">
                🇨🇭 {t("privacy.swissBadge")}
              </div>

              <div className="bg-white/10 backdrop-blur-sm border border-white/10 rounded-full px-4 py-2 text-sm text-white/90">
                🔒 {t("privacy.focusedBadge")}
              </div>

            </div>

          </div>
        </section>

        {/* ─────────────────────────────────────────────────────────────
            PRIVACY PROMISE
        ───────────────────────────────────────────────────────────── */}
        <section className="px-4 pt-10">

          <div className="max-w-5xl mx-auto">

            <div className="rounded-2xl border border-zrp-red/20 bg-zrp-red/5 dark:bg-zrp-red/10 p-5 sm:p-6">

              <div className="flex items-start gap-4">

                <div className="flex-shrink-0 w-10 h-10 rounded-xl bg-zrp-red/10 dark:bg-zrp-red/20 flex items-center justify-center text-zrp-red">
                  🔒
                </div>

                <div>

                  <h2 className="font-orbitron font-bold text-zrp-charcoal dark:text-white">
                    {t("privacy.promiseTitle")}
                  </h2>

                  <p className="mt-2 text-sm sm:text-base leading-relaxed text-zrp-charcoal/70 dark:text-white/70">
                    {t("privacy.promiseDesc")}
                  </p>

                  <div className="mt-3">
                    <Link
                      href="/terms"
                      className="text-sm font-semibold text-zrp-red hover:underline"
                    >
                      {t("privacy.readTerms")}
                    </Link>
                  </div>

                </div>

              </div>

            </div>

          </div>

        </section>

        {/* ─────────────────────────────────────────────────────────────
            MAIN CONTENT
        ───────────────────────────────────────────────────────────── */}
        <section className="py-12 sm:py-16 px-4">

          <div className="max-w-6xl mx-auto grid lg:grid-cols-[250px_minmax(0,1fr)] gap-10">

            {/* Desktop contents */}
            <aside className="hidden lg:block">

              <div className="sticky top-24">

                <div className="bg-zrp-silver/10 dark:bg-zrp-charcoal/40 border border-zrp-silver/30 dark:border-zrp-charcoal rounded-2xl p-5">

                  <h2 className="font-orbitron font-bold text-sm uppercase tracking-wider text-zrp-charcoal dark:text-white mb-4">
                    {t("privacy.guideHeading")}
                  </h2>

                  <nav className="space-y-1">

                    {SECTIONS.map((section) => (
                      <a
                        key={section.id}
                        href={`#${section.id}`}
                        className="flex items-center gap-3 px-3 py-2 rounded-lg text-xs text-zrp-charcoal/65 dark:text-white/60 hover:text-zrp-red hover:bg-zrp-red/5 transition"
                      >
                        <span className="font-orbitron text-[10px] text-zrp-red/70">
                          {section.number}
                        </span>

                        <span>{section.title}</span>
                      </a>
                    ))}

                  </nav>

                </div>

              </div>

            </aside>

            {/* Document */}
            <article className="min-w-0">

              <div className="space-y-8">

                {/* 01 */}
                <section
                  id="introduction"
                  className="privacy-section"
                >
                  <SectionHeader number="01" title={t("privacy.h.introduction")} />

                  <Text>
                    {t("privacy.intro.p1Prefix")} <strong>{t("privacy.intro.p1Bold")}</strong>
                    {t("privacy.intro.p1Suffix")}
                  </Text>

                  <Text>
                    {t("privacy.intro.p2")}
                  </Text>

                  <Text>
                    {t("privacy.intro.p3")}
                  </Text>

                  <Callout variant="red">
                    <strong>{t("privacy.intro.calloutBold")}</strong> {t("privacy.intro.calloutText")}
                  </Callout>

                  <Callout>
                    <strong>{t("privacy.governingVersionBold")}</strong>{" "}
                    {t("privacy.governingVersionText")}
                  </Callout>
                </section>

                {/* 02 */}
                <section
                  id="controller"
                  className="privacy-section"
                >
                  <SectionHeader
                    number="02"
                    title={t("privacy.h.controller")}
                  />

                  <Text>
                    <strong>{t("privacy.controller.p1Bold")}</strong> {t("privacy.controller.p1Suffix")}
                  </Text>

                  <div className="grid sm:grid-cols-2 gap-4 mt-6">

                    <ContactCard
                      title={t("privacy.controller.privacyInquiries")}
                      email="privacy@zrp.one"
                    />

                    <ContactCard
                      title={t("privacy.controller.generalSupport")}
                      email="support@zrp.one"
                    />

                  </div>

                  <Callout>
                    <strong>{t("privacy.controller.calloutBold")}</strong> {t("privacy.controller.calloutText")}
                  </Callout>
                </section>

                {/* 03 */}
                <section
                  id="data-collected"
                  className="privacy-section"
                >
                  <SectionHeader
                    number="03"
                    title={t("privacy.h.dataCollected")}
                  />

                  <Text>
                    {t("privacy.dataCollected.intro")}
                  </Text>

                  <div className="grid md:grid-cols-2 gap-4">

                    <DataCard
                      icon="👤"
                      title={t("privacy.dataCollected.accountTitle")}
                      text={t("privacy.dataCollected.accountText")}
                    />

                    <DataCard
                      icon="📝"
                      title={t("privacy.dataCollected.profileTitle")}
                      text={t("privacy.dataCollected.profileText")}
                    />

                    <DataCard
                      icon="📱"
                      title={t("privacy.dataCollected.contentTitle")}
                      text={t("privacy.dataCollected.contentText")}
                    />

                    <DataCard
                      icon="💬"
                      title={t("privacy.dataCollected.interactionsTitle")}
                      text={t("privacy.dataCollected.interactionsText")}
                    />

                    <DataCard
                      icon="🛡️"
                      title={t("privacy.dataCollected.deviceTitle")}
                      text={t("privacy.dataCollected.deviceText")}
                    />

                    <DataCard
                      icon="🍪"
                      title={t("privacy.dataCollected.cookiesTitle")}
                      text={t("privacy.dataCollected.cookiesText")}
                    />

                  </div>

                  <Callout>
                    {t("privacy.dataCollected.calloutText")}
                  </Callout>
                </section>

                {/* 04 */}
                <section
                  id="data-use"
                  className="privacy-section"
                >
                  <SectionHeader
                    number="04"
                    title={t("privacy.h.dataUse")}
                  />

                  <Text>
                    {t("privacy.dataUse.intro")}
                  </Text>

                  <BulletList
                    items={[
                      <>{t("privacy.dataUse.item1")}</>,
                      <>{t("privacy.dataUse.item2")}</>,
                      <>{t("privacy.dataUse.item3")}</>,
                      <>{t("privacy.dataUse.item4")}</>,
                      <>{t("privacy.dataUse.item5")}</>,
                      <>{t("privacy.dataUse.item6")}</>,
                      <>{t("privacy.dataUse.item7")}</>,
                      <>{t("privacy.dataUse.item8")}</>,
                    ]}
                  />

                  <Callout variant="red">
                    <strong>{t("privacy.dataUse.calloutBold")}</strong>{" "}
                    {t("privacy.dataUse.calloutText")}
                  </Callout>
                </section>

                {/* 05 */}
                <section
                  id="legal-basis"
                  className="privacy-section"
                >
                  <SectionHeader
                    number="05"
                    title={t("privacy.h.legalBasis")}
                  />

                  <Text>
                    {t("privacy.legalBasis.intro")}
                  </Text>

                  <div className="space-y-4">

                    <LegalBasisCard
                      title={t("privacy.legalBasis.contractualTitle")}
                      text={t("privacy.legalBasis.contractualText")}
                    />

                    <LegalBasisCard
                      title={t("privacy.legalBasis.legitimateTitle")}
                      text={t("privacy.legalBasis.legitimateText")}
                    />

                    <LegalBasisCard
                      title={t("privacy.legalBasis.consentTitle")}
                      text={t("privacy.legalBasis.consentText")}
                    />

                    <LegalBasisCard
                      title={t("privacy.legalBasis.obligationTitle")}
                      text={t("privacy.legalBasis.obligationText")}
                    />

                  </div>
                </section>

                {/* 06 */}
                <section
                  id="cookies"
                  className="privacy-section"
                >
                  <SectionHeader
                    number="06"
                    title={t("privacy.h.cookies")}
                  />

                  <Text>
                    {t("privacy.cookies.intro")}
                  </Text>

                  <div className="grid sm:grid-cols-2 gap-4 mt-6">

                    <InfoCard
                      title={t("privacy.cookies.essentialTitle")}
                      text={t("privacy.cookies.essentialText")}
                    />

                    <InfoCard
                      title={t("privacy.cookies.functionalTitle")}
                      text={t("privacy.cookies.functionalText")}
                    />

                    <InfoCard
                      title={t("privacy.cookies.analyticsTitle")}
                      text={t("privacy.cookies.analyticsText")}
                    />

                    <InfoCard
                      title={t("privacy.cookies.advertisingTitle")}
                      text={t("privacy.cookies.advertisingText")}
                    />

                  </div>

                  <Text>
                    {t("privacy.cookies.outro")}
                  </Text>
                </section>

                {/* 07 */}
                <section
                  id="sharing"
                  className="privacy-section"
                >
                  <SectionHeader
                    number="07"
                    title={t("privacy.h.sharing")}
                  />

                  <Text>
                    {t("privacy.sharing.p1")}
                  </Text>

                  <Text>
                    {t("privacy.sharing.p2")}
                  </Text>

                  <Callout variant="red">
                    {t("privacy.sharing.calloutText")}
                  </Callout>

                  <Text>
                    {t("privacy.sharing.p3")}
                  </Text>
                </section>

                {/* 08 */}
                <section
                  id="retention"
                  className="privacy-section"
                >
                  <SectionHeader
                    number="08"
                    title={t("privacy.h.retention")}
                  />

                  <Text>
                    {t("privacy.retention.p1")}
                  </Text>

                  <Text>
                    {t("privacy.retention.p2")}
                  </Text>

                  <Callout>
                    {t("privacy.retention.calloutText")}
                  </Callout>
                </section>

                {/* 09 */}
                <section
                  id="transfers"
                  className="privacy-section"
                >
                  <SectionHeader
                    number="09"
                    title={t("privacy.h.transfers")}
                  />

                  <Text>
                    {t("privacy.transfers.p1")}
                  </Text>

                  <Text>
                    {t("privacy.transfers.p2")}
                  </Text>

                  <Text>
                    {t("privacy.transfers.p3")}
                  </Text>

                  <Text>
                    {t("privacy.transfers.p4")}
                  </Text>

                  <Callout>
                    {t("privacy.transfers.calloutText")}
                  </Callout>
                </section>

                {/* 10 */}
                <section
                  id="rights"
                  className="privacy-section"
                >
                  <SectionHeader
                    number="10"
                    title={t("privacy.h.rights")}
                  />

                  <Text>
                    {t("privacy.rights.intro")}
                  </Text>

                  <div className="grid sm:grid-cols-2 gap-4">

                    <RightCard
                      title={t("privacy.rights.accessTitle")}
                      text={t("privacy.rights.accessText")}
                    />

                    <RightCard
                      title={t("privacy.rights.rectificationTitle")}
                      text={t("privacy.rights.rectificationText")}
                    />

                    <RightCard
                      title={t("privacy.rights.erasureTitle")}
                      text={t("privacy.rights.erasureText")}
                    />

                    <RightCard
                      title={t("privacy.rights.restrictionTitle")}
                      text={t("privacy.rights.restrictionText")}
                    />

                    <RightCard
                      title={t("privacy.rights.portabilityTitle")}
                      text={t("privacy.rights.portabilityText")}
                    />

                    <RightCard
                      title={t("privacy.rights.objectionTitle")}
                      text={t("privacy.rights.objectionText")}
                    />

                    <RightCard
                      title={t("privacy.rights.withdrawTitle")}
                      text={t("privacy.rights.withdrawText")}
                    />

                    <RightCard
                      title={t("privacy.rights.complaintTitle")}
                      text={t("privacy.rights.complaintText")}
                    />

                  </div>

                  <Text>
                    {t("privacy.rights.contactPrefix")}{" "}
                    <a
                      href="mailto:privacy@zrp.one"
                      className="legal-link"
                    >
                      privacy@zrp.one
                    </a>
                    {t("privacy.rights.contactSuffix")}
                  </Text>
                </section>

                {/* 11 */}
                <section
                  id="security"
                  className="privacy-section"
                >
                  <SectionHeader
                    number="11"
                    title={t("privacy.h.security")}
                  />

                  <Text>
                    {t("privacy.security.intro")}
                  </Text>

                  <div className="grid sm:grid-cols-2 gap-4">

                    <SecurityCard
                      icon="🔐"
                      title={t("privacy.security.encryptionTitle")}
                      text={t("privacy.security.encryptionText")}
                    />

                    <SecurityCard
                      icon="🛡️"
                      title={t("privacy.security.accessTitle")}
                      text={t("privacy.security.accessText")}
                    />

                    <SecurityCard
                      icon="🔎"
                      title={t("privacy.security.monitoringTitle")}
                      text={t("privacy.security.monitoringText")}
                    />

                    <SecurityCard
                      icon="⚙️"
                      title={t("privacy.security.improvementsTitle")}
                      text={t("privacy.security.improvementsText")}
                    />

                  </div>

                  <Callout>
                    {t("privacy.security.calloutText")}
                  </Callout>
                </section>

                {/* 12 */}
                <section
                  id="children"
                  className="privacy-section"
                >
                  <SectionHeader
                    number="12"
                    title={t("privacy.h.children")}
                  />

                  <Text>
                    {t("privacy.children.p1")}
                  </Text>

                  <Text>
                    {t("privacy.children.p2Prefix")}{" "}
                    <a
                      href="mailto:privacy@zrp.one"
                      className="legal-link"
                    >
                      privacy@zrp.one
                    </a>
                    .
                  </Text>
                </section>

                {/* 13 */}
                <section
                  id="moderation"
                  className="privacy-section"
                >
                  <SectionHeader
                    number="13"
                    title={t("privacy.h.moderation")}
                  />

                  <Text>
                    {t("privacy.moderation.p1")}
                  </Text>

                  <Text>
                    {t("privacy.moderation.p2")}
                  </Text>

                  <div className="rounded-2xl bg-gradient-to-br from-zrp-darkRed to-zrp-deepBlack p-6 sm:p-8 text-white">

                    <div className="flex items-start gap-4">

                      <div className="text-3xl">
                        🗽
                      </div>

                      <div>

                        <h3 className="font-orbitron font-bold text-xl">
                          {t("privacy.moderation.bannerTitle")}
                        </h3>

                        <p className="mt-2 text-white/75 leading-relaxed">
                          {t("privacy.moderation.bannerText")}
                        </p>

                      </div>

                    </div>

                  </div>

                </section>

                {/* 14 */}
                <section
                  id="charity"
                  className="privacy-section"
                >
                  <SectionHeader
                    number="14"
                    title={t("privacy.h.charity")}
                  />

                  <div className="rounded-2xl border border-zrp-red/20 bg-zrp-red/5 dark:bg-zrp-red/10 p-6 sm:p-8">

                    <div className="flex flex-col sm:flex-row items-start gap-6">

                      <div className="flex-shrink-0">

                        <div className="text-5xl font-orbitron font-bold text-zrp-red">
                          35%
                        </div>

                        <div className="text-xs uppercase tracking-wider text-zrp-charcoal/50 dark:text-white/50 mt-1">
                          {t("privacy.charity.profitLabel")}
                        </div>

                      </div>

                      <div>

                        <h3 className="text-xl font-orbitron font-bold text-zrp-charcoal dark:text-white">
                          {t("privacy.charity.title")}
                        </h3>

                        <p className="mt-2 text-zrp-charcoal/70 dark:text-white/70 leading-relaxed">
                          {t("privacy.charity.p1")}
                        </p>

                        <p className="mt-3 text-sm text-zrp-charcoal/60 dark:text-white/55">
                          {t("privacy.charity.p2")}
                        </p>

                      </div>

                    </div>

                  </div>
                </section>

                {/* 15 */}
                <section
                  id="changes"
                  className="privacy-section"
                >
                  <SectionHeader
                    number="15"
                    title={t("privacy.h.changes")}
                  />

                  <Text>
                    {t("privacy.changes.p1")}
                  </Text>

                  <Text>
                    {t("privacy.changes.p2")}
                  </Text>

                  <Callout>
                    {t("privacy.changes.calloutPrefix")}{" "}
                    <Link
                      href="/privacy"
                      className="legal-link"
                    >
                      zrp.one/privacy
                    </Link>
                    .
                  </Callout>
                </section>

                {/* 16 */}
                <section
                  id="contact"
                  className="privacy-section"
                >
                  <SectionHeader
                    number="16"
                    title={t("privacy.h.contact")}
                  />

                  <Text>
                    {t("privacy.contact.p1")}
                  </Text>

                  <div className="grid sm:grid-cols-2 gap-4 mt-6">

                    <ContactCard
                      title={t("privacy.contact.privacyLabel")}
                      email="privacy@zrp.one"
                    />

                    <ContactCard
                      title={t("privacy.contact.supportLabel")}
                      email="support@zrp.one"
                    />

                  </div>

                  <Text>
                    {t("privacy.contact.p2")}
                  </Text>
                </section>

                {/* Privacy Summary */}
                <section className="rounded-2xl border border-zrp-silver/30 dark:border-zrp-charcoal bg-zrp-silver/10 dark:bg-zrp-charcoal/30 p-6 sm:p-8">

                  <div className="flex items-center gap-3 mb-6">

                    <div className="w-10 h-10 rounded-xl bg-zrp-red/10 flex items-center justify-center text-zrp-red">
                      🔒
                    </div>

                    <div>

                      <h2 className="text-2xl font-orbitron font-bold text-zrp-charcoal dark:text-white">
                        {t("privacy.summary.title")}
                      </h2>

                      <p className="text-sm text-zrp-charcoal/60 dark:text-white/60 mt-1">
                        {t("privacy.summary.subtitle")}
                      </p>

                    </div>

                  </div>

                  <div className="grid sm:grid-cols-2 gap-4">

                    <PrincipleCard
                      title={t("privacy.summary.byDesignTitle")}
                      text={t("privacy.summary.byDesignText")}
                    />

                    <PrincipleCard
                      title={t("privacy.summary.minimisationTitle")}
                      text={t("privacy.summary.minimisationText")}
                    />

                    <PrincipleCard
                      title={t("privacy.summary.noSellingTitle")}
                      text={t("privacy.summary.noSellingText")}
                    />

                    <PrincipleCard
                      title={t("privacy.summary.userControlTitle")}
                      text={t("privacy.summary.userControlText")}
                    />

                    <PrincipleCard
                      title={t("privacy.summary.securityTitle")}
                      text={t("privacy.summary.securityText")}
                    />

                    <PrincipleCard
                      title={t("privacy.summary.transparencyTitle")}
                      text={t("privacy.summary.transparencyText")}
                    />

                  </div>

                </section>

              </div>

            </article>

          </div>

        </section>

        {/* ─────────────────────────────────────────────────────────────
            BOTTOM CTA
        ───────────────────────────────────────────────────────────── */}
        <section className="bg-gradient-to-br from-zrp-darkRed to-zrp-deepBlack py-14 px-4">

          <div className="max-w-3xl mx-auto text-center">

            <Image
              src="/logo.png"
              alt="ZRP Social"
              width={56}
              height={56}
              className="w-14 h-14 object-contain mx-auto mb-5"
            />

            <h2 className="text-2xl sm:text-3xl font-bold font-orbitron text-white">
              {t("privacy.cta.title")}
            </h2>

            <p className="mt-3 text-white/75 font-inter">
              {t("privacy.cta.desc")}
            </p>

            <a
              href="mailto:privacy@zrp.one"
              className="inline-flex items-center justify-center mt-6 px-7 py-3 bg-white text-zrp-darkRed font-semibold rounded-full shadow-lg hover:bg-gray-100 transition font-inter"
            >
              {t("privacy.cta.button")}
            </a>

          </div>

        </section>

      </main>
    </div>
  );
}

/* ────────────────────────────────────────────────────────────────────────── */
/* Reusable Components                                                       */
/* ────────────────────────────────────────────────────────────────────────── */

function SectionHeader({
  number,
  title,
}: {
  number: string;
  title: string;
}) {
  return (
    <div className="flex items-start gap-4 mb-6">

      <div className="flex-shrink-0 w-10 h-10 rounded-xl bg-zrp-red/10 dark:bg-zrp-red/15 flex items-center justify-center">
        <span className="font-orbitron font-bold text-xs text-zrp-red">
          {number}
        </span>
      </div>

      <div>

        <h2 className="text-2xl sm:text-3xl font-bold font-orbitron text-zrp-charcoal dark:text-white leading-tight">
          {title}
        </h2>

        <div className="mt-3 w-12 h-0.5 bg-zrp-red rounded-full" />

      </div>

    </div>
  );
}

function Text({
  children,
}: {
  children: React.ReactNode;
}) {
  return (
    <p className="text-[15px] sm:text-base leading-7 text-zrp-charcoal/75 dark:text-white/70 mb-4">
      {children}
    </p>
  );
}

function BulletList({
  items,
}: {
  items: React.ReactNode[];
}) {
  return (
    <ul className="space-y-3 my-5">

      {items.map((item, index) => (
        <li
          key={index}
          className="flex items-start gap-3 text-[15px] sm:text-base leading-7 text-zrp-charcoal/75 dark:text-white/70"
        >

          <span className="flex-shrink-0 w-5 h-5 mt-1 rounded-full bg-zrp-red/10 dark:bg-zrp-red/15 flex items-center justify-center">
            <span className="w-1.5 h-1.5 rounded-full bg-zrp-red" />
          </span>

          <span>{item}</span>

        </li>
      ))}

    </ul>
  );
}

function Callout({
  children,
  variant = "default",
}: {
  children: React.ReactNode;
  variant?: "default" | "red";
}) {
  return (
    <div
      className={
        variant === "red"
          ? "mt-6 rounded-xl border border-zrp-red/25 bg-zrp-red/5 dark:bg-zrp-red/10 px-5 py-4 text-sm leading-6 text-zrp-charcoal/80 dark:text-white/75"
          : "mt-6 rounded-xl border border-zrp-silver/40 dark:border-zrp-charcoal bg-zrp-silver/10 dark:bg-zrp-charcoal/40 px-5 py-4 text-sm leading-6 text-zrp-charcoal/75 dark:text-white/70"
      }
    >
      {children}
    </div>
  );
}

function DataCard({
  icon,
  title,
  text,
}: {
  icon: string;
  title: string;
  text: string;
}) {
  return (
    <div className="rounded-xl border border-zrp-silver/30 dark:border-zrp-charcoal bg-zrp-silver/10 dark:bg-zrp-charcoal/40 p-5">

      <div className="text-2xl mb-3">
        {icon}
      </div>

      <h3 className="font-orbitron font-bold text-base text-zrp-charcoal dark:text-white">
        {title}
      </h3>

      <p className="mt-2 text-sm leading-6 text-zrp-charcoal/70 dark:text-white/65">
        {text}
      </p>

    </div>
  );
}

function InfoCard({
  title,
  text,
}: {
  title: string;
  text: string;
}) {
  return (
    <div className="rounded-xl border border-zrp-silver/30 dark:border-zrp-charcoal bg-zrp-silver/10 dark:bg-zrp-charcoal/40 p-5">

      <h3 className="font-orbitron font-bold text-base text-zrp-charcoal dark:text-white">
        {title}
      </h3>

      <p className="mt-2 text-sm leading-6 text-zrp-charcoal/70 dark:text-white/65">
        {text}
      </p>

    </div>
  );
}

function LegalBasisCard({
  title,
  text,
}: {
  title: string;
  text: string;
}) {
  return (
    <div className="flex items-start gap-4 rounded-xl border border-zrp-silver/30 dark:border-zrp-charcoal bg-white dark:bg-zrp-charcoal/30 p-5">

      <div className="flex-shrink-0 w-8 h-8 rounded-lg bg-zrp-red/10 flex items-center justify-center text-zrp-red font-bold text-sm">
        ✓
      </div>

      <div>

        <h3 className="font-orbitron font-bold text-base text-zrp-charcoal dark:text-white">
          {title}
        </h3>

        <p className="mt-1 text-sm leading-6 text-zrp-charcoal/70 dark:text-white/65">
          {text}
        </p>

      </div>

    </div>
  );
}

function SecurityCard({
  icon,
  title,
  text,
}: {
  icon: string;
  title: string;
  text: string;
}) {
  return (
    <div className="rounded-xl border border-zrp-silver/30 dark:border-zrp-charcoal bg-zrp-silver/10 dark:bg-zrp-charcoal/40 p-5">

      <div className="text-2xl mb-3">
        {icon}
      </div>

      <h3 className="font-orbitron font-bold text-base text-zrp-charcoal dark:text-white">
        {title}
      </h3>

      <p className="mt-2 text-sm leading-6 text-zrp-charcoal/70 dark:text-white/65">
        {text}
      </p>

    </div>
  );
}

function RightCard({
  title,
  text,
}: {
  title: string;
  text: string;
}) {
  return (
    <div className="flex items-start gap-3 rounded-xl bg-white dark:bg-zrp-deepBlack/50 border border-zrp-silver/20 dark:border-zrp-charcoal p-4">

      <span className="flex-shrink-0 w-7 h-7 rounded-lg bg-zrp-red/10 flex items-center justify-center text-zrp-red font-bold">
        ✓
      </span>

      <div>

        <h3 className="font-semibold text-sm text-zrp-charcoal dark:text-white">
          {title}
        </h3>

        <p className="mt-1 text-xs leading-5 text-zrp-charcoal/60 dark:text-white/55">
          {text}
        </p>

      </div>

    </div>
  );
}

function PrincipleCard({
  title,
  text,
}: {
  title: string;
  text: string;
}) {
  return (
    <div className="rounded-xl bg-white dark:bg-zrp-deepBlack/50 border border-zrp-silver/20 dark:border-zrp-charcoal p-4">

      <div className="flex items-center gap-2">

        <span className="w-2 h-2 rounded-full bg-zrp-red" />

        <h3 className="font-orbitron font-bold text-sm text-zrp-charcoal dark:text-white">
          {title}
        </h3>

      </div>

      <p className="mt-2 text-xs leading-5 text-zrp-charcoal/60 dark:text-white/55">
        {text}
      </p>

    </div>
  );
}

function ContactCard({
  title,
  email,
}: {
  title: string;
  email: string;
}) {
  return (
    <div className="rounded-xl border border-zrp-silver/30 dark:border-zrp-charcoal bg-zrp-silver/10 dark:bg-zrp-charcoal/40 p-5">

      <div className="text-xs uppercase tracking-wider font-orbitron text-zrp-charcoal/50 dark:text-white/45">
        {title}
      </div>

      <a
        href={`mailto:${email}`}
        className="inline-block mt-2 text-zrp-red font-semibold hover:underline break-all"
      >
        {email}
      </a>

    </div>
  );
}
