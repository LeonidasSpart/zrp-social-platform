"use client";

import Link from "next/link";
import Image from "next/image";
import { useLanguage } from "@/contexts/LanguageContext";

export default function TermsPage() {
  const { t } = useLanguage();

  const SECTIONS = [
    { id: "introduction", number: "01", title: t("terms.nav.introduction") },
    { id: "eligibility", number: "02", title: t("terms.nav.eligibility") },
    { id: "registration", number: "03", title: t("terms.nav.registration") },
    { id: "freedom-of-speech", number: "04", title: t("terms.nav.freedomOfSpeech") },
    { id: "user-conduct", number: "05", title: t("terms.nav.userConduct") },
    { id: "content", number: "06", title: t("terms.nav.content") },
    { id: "intellectual-property", number: "07", title: t("terms.nav.intellectualProperty") },
    { id: "privacy", number: "08", title: t("terms.nav.privacy") },
    { id: "moderation", number: "09", title: t("terms.nav.moderation") },
    { id: "disputes", number: "10", title: t("terms.nav.disputes") },
    { id: "termination", number: "11", title: t("terms.nav.termination") },
    { id: "liability", number: "12", title: t("terms.nav.liability") },
    { id: "charity", number: "13", title: t("terms.nav.charity") },
    { id: "changes", number: "14", title: t("terms.nav.changes") },
    { id: "contact", number: "15", title: t("terms.nav.contact") },
  ];

  const lastUpdated = new Date().toLocaleDateString("en-US", {
    year: "numeric",
    month: "long",
    day: "numeric",
  });

  return (
    <div className="min-h-screen bg-white dark:bg-zrp-deepBlack font-inter">
      <main>

        {/* Hero */}
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
                  🇨🇭 ZRP Social · {t("terms.badgeSuffix")}
                </div>

                <h1 className="text-4xl sm:text-5xl font-extrabold font-orbitron text-white leading-tight">
                  {t("terms.title")}
                </h1>

                <p className="mt-4 text-white/80 max-w-2xl text-base sm:text-lg leading-relaxed">
                  {t("terms.subtitle")}
                </p>
              </div>

            </div>

            <div className="mt-8 flex flex-wrap gap-3">

              <div className="bg-white/10 backdrop-blur-sm border border-white/10 rounded-full px-4 py-2 text-sm text-white/90">
                {t("terms.lastUpdated")} {lastUpdated}
              </div>

              <div className="bg-white/10 backdrop-blur-sm border border-white/10 rounded-full px-4 py-2 text-sm text-white/90">
                🇨🇭 {t("terms.swissLawBadge")}
              </div>

              <div className="bg-white/10 backdrop-blur-sm border border-white/10 rounded-full px-4 py-2 text-sm text-white/90">
                {t("terms.privacyFocusedBadge")}
              </div>

            </div>

          </div>
        </section>

        {/* Intro Notice */}
        <section className="px-4 pt-10">
          <div className="max-w-5xl mx-auto">

            <div className="rounded-2xl border border-zrp-red/20 bg-zrp-red/5 dark:bg-zrp-red/10 p-5 sm:p-6">

              <div className="flex items-start gap-4">

                <div className="flex-shrink-0 w-10 h-10 rounded-xl bg-zrp-red/10 dark:bg-zrp-red/20 flex items-center justify-center text-zrp-red">
                  ⚖️
                </div>

                <div>
                  <h2 className="font-orbitron font-bold text-zrp-charcoal dark:text-white">
                    {t("terms.noticeTitle")}
                  </h2>

                  <p className="mt-2 text-sm sm:text-base leading-relaxed text-zrp-charcoal/70 dark:text-white/70">
                    {t("terms.noticeTextPrefix")}{" "}
                    <Link
                      href="/privacy"
                      className="text-zrp-red font-semibold hover:underline"
                    >
                      {t("footer.privacyPolicy")}
                    </Link>{" "}
                    {t("terms.noticeTextAnd")}{" "}
                    <Link
                      href="/guidelines"
                      className="text-zrp-red font-semibold hover:underline"
                    >
                      {t("help.footer.guidelines")}
                    </Link>
                    .
                  </p>
                </div>

              </div>

            </div>

          </div>
        </section>

        {/* Main Document */}
        <section className="py-12 sm:py-16 px-4">

          <div className="max-w-6xl mx-auto grid lg:grid-cols-[250px_minmax(0,1fr)] gap-10">

            {/* Contents */}
            <aside className="hidden lg:block">

              <div className="sticky top-24">

                <div className="bg-zrp-silver/10 dark:bg-zrp-charcoal/40 border border-zrp-silver/30 dark:border-zrp-charcoal rounded-2xl p-5">

                  <h2 className="font-orbitron font-bold text-sm uppercase tracking-wider text-zrp-charcoal dark:text-white mb-4">
                    {t("terms.contentsHeading")}
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

            {/* Legal Content */}
            <article className="min-w-0">

              <div className="space-y-8">

                {/* 01 */}
                <section
                  id="introduction"
                  className="scroll-mt-24 bg-white dark:bg-zrp-charcoal/30 rounded-2xl border border-zrp-silver/30 dark:border-zrp-charcoal p-6 sm:p-8"
                >
                  <SectionHeader number="01" title={t("terms.h.introduction")} />

                  <Text>
                    {t("terms.intro.p1Prefix")} <strong>{t("terms.intro.p1Bold")}</strong>
                    {t("terms.intro.p1Suffix")}
                  </Text>

                  <Text>
                    {t("terms.intro.p2Prefix")}{" "}
                    <Link href="/privacy" className="legal-link">
                      {t("footer.privacyPolicy")}
                    </Link>
                    {t("terms.intro.p2And")}{" "}
                    <Link href="/guidelines" className="legal-link">
                      {t("help.footer.guidelines")}
                    </Link>
                    .
                  </Text>

                  <Text>
                    {t("terms.intro.p3")}
                  </Text>

                  <Callout>
                    <strong>{t("terms.intro.calloutBold")}</strong> {t("terms.intro.calloutText")}
                  </Callout>

                  <Callout>
                    <strong>{t("terms.governingVersionBold")}</strong>{" "}
                    {t("terms.governingVersionText")}
                  </Callout>
                </section>

                {/* 02 */}
                <section
                  id="eligibility"
                  className="legal-section"
                >
                  <SectionHeader number="02" title={t("terms.h.eligibility")} />

                  <Text>{t("terms.eligibility.intro")}</Text>

                  <BulletList
                    items={[
                      <>
                        {t("terms.eligibility.item1Prefix")} <strong>{t("terms.eligibility.item1Bold")}</strong>{" "}
                        {t("terms.eligibility.item1Suffix")}
                      </>,
                      <>{t("terms.eligibility.item2")}</>,
                      <>{t("terms.eligibility.item3")}</>,
                      <>{t("terms.eligibility.item4")}</>,
                      <>{t("terms.eligibility.item5")}</>,
                    ]}
                  />

                  <Text>
                    {t("terms.eligibility.outro")}
                  </Text>
                </section>

                {/* 03 */}
                <section
                  id="registration"
                  className="legal-section"
                >
                  <SectionHeader number="03" title={t("terms.h.registration")} />

                  <Text>
                    {t("terms.registration.intro")}
                  </Text>

                  <BulletList
                    items={[
                      <>{t("terms.registration.item1")}</>,
                      <>{t("terms.registration.item2")}</>,
                      <>{t("terms.registration.item3")}</>,
                      <>{t("terms.registration.item4")}</>,
                      <>{t("terms.registration.item5")}</>,
                    ]}
                  />

                  <Text>
                    {t("terms.registration.outro")}
                  </Text>

                  <Callout>
                    <strong>{t("terms.registration.calloutBold")}</strong> {t("terms.registration.calloutText")}
                  </Callout>
                </section>

                {/* 04 */}
                <section
                  id="freedom-of-speech"
                  className="legal-section"
                >
                  <SectionHeader number="04" title={t("terms.h.freedomOfSpeech")} />

                  <Text>
                    <strong>
                      {t("terms.freedomOfSpeech.p1Bold")}
                    </strong>{" "}
                    {t("terms.freedomOfSpeech.p1Suffix")}
                  </Text>

                  <Text>
                    {t("terms.freedomOfSpeech.p2")}
                  </Text>

                  <Text>
                    {t("terms.freedomOfSpeech.p3")}
                  </Text>

                  <BulletList
                    items={[
                      <>{t("terms.freedomOfSpeech.item1")}</>,
                      <>{t("terms.freedomOfSpeech.item2")}</>,
                      <>{t("terms.freedomOfSpeech.item3")}</>,
                      <>{t("terms.freedomOfSpeech.item4")}</>,
                      <>{t("terms.freedomOfSpeech.item5")}</>,
                      <>{t("terms.freedomOfSpeech.item6")}</>,
                    ]}
                  />

                  <Callout variant="red">
                    <strong>{t("terms.freedomOfSpeech.calloutBold")}</strong>{" "}
                    {t("terms.freedomOfSpeech.calloutText")}
                  </Callout>
                </section>

                {/* 05 */}
                <section
                  id="user-conduct"
                  className="legal-section"
                >
                  <SectionHeader number="05" title={t("terms.h.userConduct")} />

                  <Text>
                    {t("terms.userConduct.intro")}
                  </Text>

                  <BulletList
                    items={[
                      <>{t("terms.userConduct.item1")}</>,
                      <>{t("terms.userConduct.item2")}</>,
                      <>{t("terms.userConduct.item3")}</>,
                      <>{t("terms.userConduct.item4")}</>,
                      <>{t("terms.userConduct.item5")}</>,
                      <>{t("terms.userConduct.item6")}</>,
                      <>{t("terms.userConduct.item7")}</>,
                      <>{t("terms.userConduct.item8")}</>,
                    ]}
                  />

                  <Text>
                    {t("terms.userConduct.outro")}
                  </Text>
                </section>

                {/* 06 */}
                <section
                  id="content"
                  className="legal-section"
                >
                  <SectionHeader
                    number="06"
                    title={t("terms.h.content")}
                  />

                  <Text>
                    <strong>
                      {t("terms.content.p1Bold")}
                    </strong>{" "}
                    {t("terms.content.p1Suffix")}
                  </Text>

                  <Text>
                    {t("terms.content.p2")}
                  </Text>

                  <Text>
                    {t("terms.content.p3")}
                  </Text>

                  <Text>
                    {t("terms.content.p4")}
                  </Text>
                </section>

                {/* 07 */}
                <section
                  id="intellectual-property"
                  className="legal-section"
                >
                  <SectionHeader
                    number="07"
                    title={t("terms.h.intellectualProperty")}
                  />

                  <Text>
                    {t("terms.ip.p1")}
                  </Text>

                  <Text>
                    {t("terms.ip.p2")}
                  </Text>
                </section>

                {/* 08 */}
                <section
                  id="privacy"
                  className="legal-section"
                >
                  <SectionHeader
                    number="08"
                    title={t("terms.h.privacy")}
                  />

                  <Text>
                    {t("terms.privacySection.p1Prefix")}{" "}
                    <Link href="/privacy" className="legal-link">
                      {t("footer.privacyPolicy")}
                    </Link>{" "}
                    {t("terms.privacySection.p1Suffix")}
                  </Text>

                  <Text>
                    {t("terms.privacySection.p2")}
                  </Text>

                  <Text>
                    {t("terms.privacySection.p3")}
                  </Text>
                </section>

                {/* 09 */}
                <section
                  id="moderation"
                  className="legal-section"
                >
                  <SectionHeader
                    number="09"
                    title={t("terms.h.moderation")}
                  />

                  <Text>
                    {t("terms.moderation.p1")}
                  </Text>

                  <Text>
                    <strong>{t("terms.moderation.p2Bold")}</strong>{" "}
                    {t("terms.moderation.p2Suffix")}
                  </Text>

                  <Text>{t("terms.moderation.p3")}</Text>

                  <BulletList
                    items={[
                      <>{t("terms.moderation.item1")}</>,
                      <>{t("terms.moderation.item2")}</>,
                      <>{t("terms.moderation.item3")}</>,
                      <>{t("terms.moderation.item4")}</>,
                    ]}
                  />

                  <Text>
                    {t("terms.moderation.outro")}
                  </Text>
                </section>

                {/* 10 */}
                <section
                  id="disputes"
                  className="legal-section"
                >
                  <SectionHeader
                    number="10"
                    title={t("terms.h.disputes")}
                  />

                  <Text>
                    {t("terms.disputes.p1Prefix")}{" "}
                    <strong>{t("terms.disputes.p1Bold")}</strong>{t("terms.disputes.p1Suffix")}
                  </Text>

                  <Text>
                    {t("terms.disputes.p2")}
                  </Text>

                  <BulletList
                    items={[
                      <>{t("terms.disputes.item1")}</>,
                      <>{t("terms.disputes.item2")}</>,
                      <>{t("terms.disputes.item3")}</>,
                    ]}
                  />

                  <Text>
                    {t("terms.disputes.contactPrefix")}{" "}
                    <a
                      href="mailto:support@zrp.one"
                      className="legal-link"
                    >
                      support@zrp.one
                    </a>{" "}
                    {t("terms.disputes.contactSuffix")}
                  </Text>
                </section>

                {/* 11 */}
                <section
                  id="termination"
                  className="legal-section"
                >
                  <SectionHeader number="11" title={t("terms.h.termination")} />

                  <Text>
                    {t("terms.termination.p1")}
                  </Text>

                  <Text>
                    {t("terms.termination.p2")}
                  </Text>

                  <Text>
                    {t("terms.termination.p3")}
                  </Text>
                </section>

                {/* 12 */}
                <section
                  id="liability"
                  className="legal-section"
                >
                  <SectionHeader
                    number="12"
                    title={t("terms.h.liability")}
                  />

                  <div className="grid gap-4">

                    <InfoCard
                      title={t("terms.liability.asIsTitle")}
                      text={t("terms.liability.asIsText")}
                    />

                    <InfoCard
                      title={t("terms.liability.accuracyTitle")}
                      text={t("terms.liability.accuracyText")}
                    />

                    <InfoCard
                      title={t("terms.liability.limitationTitle")}
                      text={t("terms.liability.limitationText")}
                    />

                  </div>

                  <Text>
                    {t("terms.liability.p1")}
                  </Text>

                  <Text>
                    <strong>{t("terms.liability.p2Bold")}</strong> {t("terms.liability.p2Suffix")}
                  </Text>
                </section>

                {/* 13 */}
                <section
                  id="charity"
                  className="legal-section"
                >
                  <SectionHeader
                    number="13"
                    title={t("terms.h.charity")}
                  />

                  <div className="rounded-2xl bg-gradient-to-br from-zrp-darkRed to-zrp-deepBlack p-6 sm:p-8 text-white">

                    <div className="flex flex-col sm:flex-row gap-6 items-start">

                      <div className="text-5xl font-orbitron font-bold text-white">
                        35%
                      </div>

                      <div>
                        <h3 className="font-orbitron font-bold text-xl">
                          {t("terms.charity.title")}
                        </h3>

                        <p className="mt-2 text-white/80 leading-relaxed">
                          {t("terms.charity.p1")}
                        </p>
                      </div>

                    </div>

                    <div className="mt-6 pt-5 border-t border-white/15 text-sm text-white/70">
                      {t("terms.charity.p2")}
                    </div>

                  </div>
                </section>

                {/* 14 */}
                <section
                  id="changes"
                  className="legal-section"
                >
                  <SectionHeader
                    number="14"
                    title={t("terms.h.changes")}
                  />

                  <Text>
                    {t("terms.changes.p1")}
                  </Text>

                  <Text>
                    {t("terms.changes.p2")}
                  </Text>

                  <BulletList
                    items={[
                      <>{t("terms.changes.item1")}</>,
                      <>{t("terms.changes.item2")}</>,
                      <>{t("terms.changes.item3Prefix")}</>,
                    ]}
                  />

                  <Text>
                    {t("terms.changes.outro")}
                  </Text>
                </section>

                {/* 15 */}
                <section
                  id="contact"
                  className="legal-section"
                >
                  <SectionHeader number="15" title={t("terms.h.contact")} />

                  <Text>
                    {t("terms.contact.p1")}
                  </Text>

                  <div className="grid sm:grid-cols-2 gap-4 mt-6">

                    <ContactCard
                      title={t("terms.contact.generalSupport")}
                      email="support@zrp.one"
                    />

                    <ContactCard
                      title={t("terms.contact.privacyInquiries")}
                      email="privacy@zrp.one"
                    />

                  </div>

                  <Text>
                    {t("terms.contact.p2")}
                  </Text>
                </section>

                {/* Rights Summary */}
                <section className="rounded-2xl border border-zrp-silver/30 dark:border-zrp-charcoal bg-zrp-silver/10 dark:bg-zrp-charcoal/30 p-6 sm:p-8">

                  <div className="flex items-center gap-3 mb-6">

                    <div className="w-10 h-10 rounded-xl bg-zrp-red/10 flex items-center justify-center text-zrp-red">
                      ✓
                    </div>

                    <div>
                      <h2 className="text-2xl font-orbitron font-bold text-zrp-charcoal dark:text-white">
                        {t("terms.summary.title")}
                      </h2>

                      <p className="text-sm text-zrp-charcoal/60 dark:text-white/60 mt-1">
                        {t("terms.summary.subtitle")}
                      </p>
                    </div>

                  </div>

                  <div className="grid sm:grid-cols-2 gap-4">

                    <RightCard
                      title={t("terms.summary.postFreelyTitle")}
                      text={t("terms.summary.postFreelyText")}
                    />

                    <RightCard
                      title={t("terms.summary.ownContentTitle")}
                      text={t("terms.summary.ownContentText")}
                    />

                    <RightCard
                      title={t("terms.summary.deleteDataTitle")}
                      text={t("terms.summary.deleteDataText")}
                    />

                    <RightCard
                      title={t("terms.summary.appealTitle")}
                      text={t("terms.summary.appealText")}
                    />

                    <RightCard
                      title={t("terms.summary.privacyTitle")}
                      text={t("terms.summary.privacyText")}
                    />

                    <RightCard
                      title={t("terms.summary.socialImpactTitle")}
                      text={t("terms.summary.socialImpactText")}
                    />

                  </div>

                </section>

              </div>

            </article>

          </div>

        </section>

        {/* Bottom CTA */}
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
              {t("terms.cta.title")}
            </h2>

            <p className="mt-3 text-white/75 font-inter">
              {t("terms.cta.desc")}
            </p>

            <a
              href="mailto:support@zrp.one"
              className="inline-flex items-center justify-center mt-6 px-7 py-3 bg-white text-zrp-darkRed font-semibold rounded-full shadow-lg hover:bg-gray-100 transition font-inter"
            >
              {t("terms.cta.button")}
            </a>

          </div>

        </section>

      </main>
    </div>
  );
}

/* -------------------------------------------------------------------------- */
/* Reusable Components                                                        */
/* -------------------------------------------------------------------------- */

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

function Text({ children }: { children: React.ReactNode }) {
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
