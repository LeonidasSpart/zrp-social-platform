"use client";

import Link from "next/link";
import Image from "next/image";
import { useLanguage } from "@/contexts/LanguageContext";

/*
 * The ZRP Community & Leadership Code: one hub page distinguishing four
 * levels of responsibility (Community Guidelines, Ambassador Code,
 * Country Manager Code, Leadership/Staff Standards) plus the shared
 * Reporting/Moderation/Appeals machinery that already exists.
 *
 * Section A deliberately renders the same terms.userConduct.* /
 * terms.content.* translation keys the /guidelines page already renders,
 * rather than re-authoring that copy - so this page can never say
 * something different from Terms/Guidelines about the same rules. Only
 * sections B-D (Ambassador/Country Manager/Leadership) are new policy
 * content that doesn't exist anywhere else. Section E's report
 * categories reuse the exact same transparency.reason* keys ReportModal
 * uses, and Section G's appeal statuses match settings/appeals' pending/
 * upheld/overturned exactly - one source of truth for all of it.
 *
 * The version/date pill below is a fixed literal (communityCode.version /
 * communityCode.versionDate), never `new Date()` - unlike /guidelines'
 * "last updated" pill, which computes "today" at render time. That's a
 * pre-existing pattern on /guidelines and /terms this page intentionally
 * does not copy, since the brief this page was built for explicitly
 * requires an honest, non-regenerating publication date.
 */

const SECTIONS = [
  { id: "a-community-guidelines", key: "communityCode.a.title" },
  { id: "b-ambassador-code", key: "communityCode.b.title" },
  { id: "c-country-manager-code", key: "communityCode.c.title" },
  { id: "d-leadership-standards", key: "communityCode.d.title" },
  { id: "e-reporting-safety", key: "communityCode.e.title" },
  { id: "f-moderation-enforcement", key: "communityCode.f.title" },
  { id: "g-appeals", key: "communityCode.g.title" },
  { id: "h-status-distinction", key: "communityCode.h.title" },
  { id: "i-version-acceptance", key: "communityCode.i.title" },
] as const;

export default function CommunityCodePage() {
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
                {t("communityCode.title")}
              </h1>
            </div>
          </div>

          <p className="mt-6 max-w-2xl text-white/80 text-[15px] sm:text-base leading-7">
            {t("communityCode.subtitle")}
          </p>

          <div className="mt-8 flex flex-wrap gap-3">
            <div className="bg-white/10 backdrop-blur-sm border border-white/10 rounded-full px-4 py-2 text-sm text-white/90">
              {t("communityCode.versionLabel")} {t("communityCode.version")}
            </div>
            <div className="bg-white/10 backdrop-blur-sm border border-white/10 rounded-full px-4 py-2 text-sm text-white/90">
              {t("communityCode.publishedLabel")} {t("communityCode.versionDate")}
            </div>
          </div>
        </div>
      </section>

      <section className="py-8 px-4 border-b border-zrp-silver/30 dark:border-zrp-charcoal sticky top-0 z-10 bg-white/95 dark:bg-zrp-deepBlack/95 backdrop-blur-sm">
        <nav aria-label={t("communityCode.tocLabel")} className="max-w-3xl mx-auto">
          <ul className="flex flex-wrap gap-2 text-sm">
            {SECTIONS.map((s) => (
              <li key={s.id}>
                <a
                  href={`#${s.id}`}
                  className="inline-block px-3 py-1.5 rounded-full border border-zrp-silver/40 dark:border-zrp-charcoal text-zrp-charcoal/75 dark:text-white/70 hover:border-zrp-red hover:text-zrp-red dark:hover:text-zrp-red transition"
                >
                  {t(s.key)}
                </a>
              </li>
            ))}
          </ul>
        </nav>
      </section>

      <section className="py-12 sm:py-16 px-4">
        <div className="max-w-3xl mx-auto">
          <p className="text-sm text-zrp-charcoal/60 dark:text-white/50 mb-8">
            {t("communityCode.reviewNotice")}
          </p>

          <div className="space-y-8">
            <Card id="a-community-guidelines">
              <SectionHeader number="A" title={t("communityCode.a.title")} />
              <Text>{t("communityCode.a.intro")}</Text>
              <p className="text-[15px] sm:text-base leading-7 mb-4">
                {t("communityCode.a.linkPrefix")}{" "}
                <Link href="/guidelines" className="legal-link">
                  {t("communityCode.a.linkLabel")}
                </Link>
                .
              </p>

              <SubHeading>{t("terms.h.userConduct")}</SubHeading>
              <Text>{t("terms.userConduct.intro")}</Text>
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
              <Text>{t("terms.userConduct.outro")}</Text>

              <SubHeading>{t("communityCode.a.safetyTitle")}</SubHeading>
              <Text>{t("communityCode.a.safetyIntro")}</Text>
              <BulletList
                items={[
                  <>{t("communityCode.a.safety1")}</>,
                  <>{t("communityCode.a.safety2")}</>,
                  <>{t("communityCode.a.safety3")}</>,
                  <>{t("communityCode.a.safety4")}</>,
                  <>{t("communityCode.a.safety5")}</>,
                  <>{t("communityCode.a.safety6")}</>,
                  <>{t("communityCode.a.safety7")}</>,
                  <>{t("communityCode.a.safety8")}</>,
                  <>{t("communityCode.a.safety9")}</>,
                ]}
              />
              <Text>{t("communityCode.a.safetyOutro")}</Text>
            </Card>

            <Card id="b-ambassador-code">
              <SectionHeader number="B" title={t("communityCode.b.title")} />
              <Text>{t("communityCode.b.intro")}</Text>
              <Text>{t("communityCode.b.principlesIntro")}</Text>
              <BulletList
                items={[
                  <>{t("communityCode.b.item1")}</>,
                  <>{t("communityCode.b.item2")}</>,
                  <>{t("communityCode.b.item3")}</>,
                  <>{t("communityCode.b.item4")}</>,
                  <>{t("communityCode.b.item5")}</>,
                  <>{t("communityCode.b.item6")}</>,
                  <>{t("communityCode.b.item7")}</>,
                  <>{t("communityCode.b.item8")}</>,
                  <>{t("communityCode.b.item9")}</>,
                  <>{t("communityCode.b.item10")}</>,
                  <>{t("communityCode.b.item11")}</>,
                ]}
              />
              <Callout>{t("communityCode.b.noImmunity")}</Callout>
              <Text>{t("communityCode.b.enforcement")}</Text>
            </Card>

            <Card id="c-country-manager-code">
              <SectionHeader number="C" title={t("communityCode.c.title")} />
              <Text>{t("communityCode.c.intro")}</Text>
              <Text>{t("communityCode.c.responsibilitiesIntro")}</Text>
              <BulletList
                items={[
                  <>{t("communityCode.c.item1")}</>,
                  <>{t("communityCode.c.item2")}</>,
                  <>{t("communityCode.c.item3")}</>,
                  <>{t("communityCode.c.item4")}</>,
                  <>{t("communityCode.c.item5")}</>,
                  <>{t("communityCode.c.item6")}</>,
                  <>{t("communityCode.c.item7")}</>,
                  <>{t("communityCode.c.item8")}</>,
                  <>{t("communityCode.c.item9")}</>,
                  <>{t("communityCode.c.item10")}</>,
                  <>{t("communityCode.c.item11")}</>,
                ]}
              />
              <SubHeading>{t("communityCode.c.distinctionTitle")}</SubHeading>
              <Text>{t("communityCode.c.distinctionBody")}</Text>
              <BulletList
                items={[
                  <>{t("communityCode.c.limit1")}</>,
                  <>{t("communityCode.c.limit2")}</>,
                  <>{t("communityCode.c.limit3")}</>,
                  <>{t("communityCode.c.limit4")}</>,
                  <>{t("communityCode.c.limit5")}</>,
                  <>{t("communityCode.c.limit6")}</>,
                ]}
              />
              <Callout>{t("communityCode.c.serverAuthoritative")}</Callout>
            </Card>

            <Card id="d-leadership-standards">
              <SectionHeader number="D" title={t("communityCode.d.title")} />
              <Text>{t("communityCode.d.intro")}</Text>
              <Text>{t("communityCode.d.itemsIntro")}</Text>
              <BulletList
                items={[
                  <>{t("communityCode.d.item1")}</>,
                  <>{t("communityCode.d.item2")}</>,
                  <>{t("communityCode.d.item3")}</>,
                  <>{t("communityCode.d.item4")}</>,
                  <>{t("communityCode.d.item5")}</>,
                  <>{t("communityCode.d.item6")}</>,
                  <>{t("communityCode.d.item7")}</>,
                  <>{t("communityCode.d.item8")}</>,
                  <>{t("communityCode.d.item9")}</>,
                  <>{t("communityCode.d.item10")}</>,
                ]}
              />
            </Card>

            <Card id="e-reporting-safety">
              <SectionHeader number="E" title={t("communityCode.e.title")} />
              <SubHeading>{t("communityCode.e.howToReportTitle")}</SubHeading>
              <Text>{t("communityCode.e.howToReportBody")}</Text>
              <SubHeading>{t("communityCode.e.whatTitle")}</SubHeading>
              <Text>{t("communityCode.e.whatBody")}</Text>
              <BulletList
                items={[
                  <>{t("transparency.reasonSpam")}</>,
                  <>{t("transparency.reasonHarassment")}</>,
                  <>{t("transparency.reasonInappropriate")}</>,
                  <>{t("transparency.reasonMisinformation")}</>,
                  <>{t("transparency.reasonHateSpeech")}</>,
                  <>{t("transparency.reasonImpersonation")}</>,
                  <>{t("transparency.reasonOther")}</>,
                ]}
              />
              <SubHeading>{t("communityCode.e.afterTitle")}</SubHeading>
              <Text>{t("communityCode.e.afterBody")}</Text>
              <SubHeading>{t("communityCode.e.seriousTitle")}</SubHeading>
              <Callout>{t("communityCode.e.seriousBody")}</Callout>
            </Card>

            <Card id="f-moderation-enforcement">
              <SectionHeader number="F" title={t("communityCode.f.title")} />
              <SubHeading>{t("communityCode.f.lifecycleTitle")}</SubHeading>
              <Text>{t("communityCode.f.lifecycleIntro")}</Text>
              <ol className="my-5 flex flex-wrap gap-2 text-sm">
                {[
                  t("communityCode.f.step1"),
                  t("communityCode.f.step2"),
                  t("communityCode.f.step3"),
                  t("communityCode.f.step4"),
                  t("communityCode.f.step5"),
                  t("communityCode.f.step6"),
                  t("communityCode.f.step7"),
                  t("communityCode.f.step8"),
                ].map((step, i) => (
                  <li
                    key={step}
                    className="flex items-center gap-2 px-3 py-1.5 rounded-full bg-zrp-red/10 dark:bg-zrp-red/15 text-zrp-charcoal/80 dark:text-white/80"
                  >
                    <span className="font-orbitron font-bold text-zrp-red">{i + 1}</span>
                    {step}
                  </li>
                ))}
              </ol>
              <SubHeading>{t("communityCode.f.measuresTitle")}</SubHeading>
              <Text>{t("communityCode.f.measuresIntro")}</Text>
              <BulletList
                items={[
                  <>{t("communityCode.f.measure1")}</>,
                  <>{t("communityCode.f.measure2")}</>,
                  <>{t("communityCode.f.measure3")}</>,
                  <>{t("communityCode.f.measure4")}</>,
                  <>{t("communityCode.f.measure5")}</>,
                  <>{t("communityCode.f.measure6")}</>,
                  <>{t("communityCode.f.measure7")}</>,
                  <>{t("communityCode.f.measure8")}</>,
                  <>{t("communityCode.f.measure9")}</>,
                ]}
              />
              <Text>{t("communityCode.f.disclaimer")}</Text>
            </Card>

            <Card id="g-appeals">
              <SectionHeader number="G" title={t("communityCode.g.title")} />
              <Text>{t("communityCode.g.intro")}</Text>
              <SubHeading>{t("communityCode.g.whenTitle")}</SubHeading>
              <Text>{t("communityCode.g.whenBody")}</Text>
              <SubHeading>{t("communityCode.g.howTitle")}</SubHeading>
              <Text>{t("communityCode.g.howBody")}</Text>
              <SubHeading>{t("communityCode.g.statusTitle")}</SubHeading>
              <BulletList
                items={[
                  <>{t("communityCode.g.statusPending")}</>,
                  <>{t("communityCode.g.statusUpheld")}</>,
                  <>{t("communityCode.g.statusOverturned")}</>,
                ]}
              />
              <Link
                href="/settings/appeals"
                className="inline-flex items-center mt-2 px-4 py-2.5 rounded-full bg-zrp-red text-white text-sm font-semibold hover:bg-zrp-darkRed transition"
              >
                {t("communityCode.g.cta")}
              </Link>
            </Card>

            <Card id="h-status-distinction">
              <SectionHeader number="H" title={t("communityCode.h.title")} />
              <SubHeading>{t("communityCode.h.distinctionTitle")}</SubHeading>
              <Text>{t("communityCode.h.distinctionBody")}</Text>
              <SubHeading>{t("communityCode.h.accountLevelTitle")}</SubHeading>
              <Text>{t("communityCode.h.accountLevelBody")}</Text>
              <SubHeading>{t("communityCode.h.serverAuthoritativeTitle")}</SubHeading>
              <Callout>{t("communityCode.h.serverAuthoritativeBody")}</Callout>
            </Card>

            <Card id="i-version-acceptance">
              <SectionHeader number="I" title={t("communityCode.i.title")} />
              <Text>{t("communityCode.i.versionBody")}</Text>
              <SubHeading>{t("communityCode.i.acceptanceTitle")}</SubHeading>
              <Text>{t("communityCode.i.acceptanceIntro")}</Text>
              <Callout>{t("communityCode.i.acceptanceStatement")}</Callout>
            </Card>

            <div className="bg-white dark:bg-zrp-charcoal/30 rounded-2xl border border-zrp-silver/30 dark:border-zrp-charcoal p-6 sm:p-8 flex flex-wrap gap-x-2 gap-y-1 text-[15px] sm:text-base">
              <Link href="/guidelines" className="legal-link">{t("help.footer.guidelines")}</Link>
              <span className="text-zrp-charcoal/40 dark:text-white/40">·</span>
              <Link href="/terms" className="legal-link">{t("footer.termsOfService")}</Link>
              <span className="text-zrp-charcoal/40 dark:text-white/40">·</span>
              <Link href="/privacy" className="legal-link">{t("footer.privacyPolicy")}</Link>
              <span className="text-zrp-charcoal/40 dark:text-white/40">·</span>
              <Link href="/ambassadors" className="legal-link">{t("ambassadors.navLabel")}</Link>
              <span className="text-zrp-charcoal/40 dark:text-white/40">·</span>
              <Link href="/contact" className="legal-link">{t("footer.contact")}</Link>
            </div>
          </div>
        </div>
      </section>
    </div>
  );
}

function Card({ id, children }: { id: string; children: React.ReactNode }) {
  return (
    <section
      id={id}
      className="scroll-mt-24 bg-white dark:bg-zrp-charcoal/30 rounded-2xl border border-zrp-silver/30 dark:border-zrp-charcoal p-6 sm:p-8"
    >
      {children}
    </section>
  );
}

function SectionHeader({ number, title }: { number: string; title: string }) {
  return (
    <div className="flex items-start gap-4 mb-6">
      <span
        aria-hidden="true"
        className="flex-shrink-0 w-9 h-9 rounded-xl bg-zrp-red/10 dark:bg-zrp-red/15 flex items-center justify-center font-orbitron font-bold text-zrp-red"
      >
        {number}
      </span>
      <h2 className="font-orbitron font-bold text-lg text-zrp-charcoal dark:text-white pt-1">
        {title}
      </h2>
    </div>
  );
}

function SubHeading({ children }: { children: React.ReactNode }) {
  return (
    <h3 className="font-orbitron font-semibold text-sm text-zrp-charcoal dark:text-white mt-6 mb-3">
      {children}
    </h3>
  );
}

function Text({ children }: { children: React.ReactNode }) {
  return (
    <p className="text-[15px] sm:text-base leading-7 text-zrp-charcoal/75 dark:text-white/70 mb-4">
      {children}
    </p>
  );
}

function Callout({ children }: { children: React.ReactNode }) {
  return (
    <p className="text-[15px] sm:text-base leading-7 text-zrp-charcoal dark:text-white bg-zrp-red/5 dark:bg-zrp-red/10 border-s-4 border-zrp-red rounded-e-lg px-4 py-3 mb-4 font-medium">
      {children}
    </p>
  );
}

function BulletList({ items }: { items: React.ReactNode[] }) {
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
