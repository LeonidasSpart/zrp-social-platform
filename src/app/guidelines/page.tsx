"use client";

import Link from "next/link";
import Image from "next/image";
import { useLanguage } from "@/contexts/LanguageContext";

// This page exists to resolve a link that already appears in the Terms of
// Service and Help Center ("Community Guidelines" -> /guidelines), which
// previously had no destination. Its content is deliberately drawn from
// the Terms of Service's own already-translated User Conduct, Content, and
// Moderation sections rather than introducing new policy, so this page can
// never say something different from the Terms it's meant to summarize.
export default function GuidelinesPage() {
  const { t } = useLanguage();

  const lastUpdated = new Date().toLocaleDateString("en-US", {
    year: "numeric",
    month: "long",
    day: "numeric",
  });

  return (
    <div className="min-h-screen bg-white dark:bg-zrp-deepBlack font-inter">
      <main>
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
                  {t("help.footer.guidelines")}
                </h1>
              </div>
            </div>

            <div className="mt-8 flex flex-wrap gap-3">
              <div className="bg-white/10 backdrop-blur-sm border border-white/10 rounded-full px-4 py-2 text-sm text-white/90">
                {t("terms.lastUpdated")} {lastUpdated}
              </div>
            </div>
          </div>
        </section>

        <section className="py-12 sm:py-16 px-4">
          <div className="max-w-3xl mx-auto">
            <div className="space-y-8">
              <div className="bg-white dark:bg-zrp-charcoal/30 rounded-2xl border border-zrp-silver/30 dark:border-zrp-charcoal p-6 sm:p-8">
                <Text>{t("guidelines.intro")}</Text>
              </div>

              <section className="bg-white dark:bg-zrp-charcoal/30 rounded-2xl border border-zrp-silver/30 dark:border-zrp-charcoal p-6 sm:p-8">
                <SectionHeader title={t("terms.h.userConduct")} />
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
              </section>

              <section className="bg-white dark:bg-zrp-charcoal/30 rounded-2xl border border-zrp-silver/30 dark:border-zrp-charcoal p-6 sm:p-8">
                <SectionHeader title={t("terms.h.content")} />
                <Text>
                  <strong>{t("terms.content.p1Bold")}</strong> {t("terms.content.p1Suffix")}
                </Text>
                <Text>{t("terms.content.p2")}</Text>
                <Text>{t("terms.content.p3")}</Text>
                <Text>{t("terms.content.p4")}</Text>
              </section>

              <section className="bg-white dark:bg-zrp-charcoal/30 rounded-2xl border border-zrp-silver/30 dark:border-zrp-charcoal p-6 sm:p-8">
                <SectionHeader title={t("guidelines.reportTitle")} />
                <Text>{t("guidelines.reportBody")}</Text>
              </section>

              <section className="bg-white dark:bg-zrp-charcoal/30 rounded-2xl border border-zrp-silver/30 dark:border-zrp-charcoal p-6 sm:p-8">
                <SectionHeader title={t("terms.h.moderation")} />
                <Text>{t("terms.moderation.p1")}</Text>
                <Text>
                  <strong>{t("terms.moderation.p2Bold")}</strong> {t("terms.moderation.p2Suffix")}
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
                <Text>{t("terms.moderation.outro")}</Text>
              </section>

              <div className="bg-white dark:bg-zrp-charcoal/30 rounded-2xl border border-zrp-silver/30 dark:border-zrp-charcoal p-6 sm:p-8 flex flex-wrap gap-x-2 gap-y-1 text-[15px] sm:text-base">
                <Link href="/terms" className="legal-link">{t("footer.termsOfService")}</Link>
                <span className="text-zrp-charcoal/40 dark:text-white/40">·</span>
                <Link href="/privacy" className="legal-link">{t("footer.privacyPolicy")}</Link>
                <span className="text-zrp-charcoal/40 dark:text-white/40">·</span>
                <Link href="/contact" className="legal-link">{t("footer.contact")}</Link>
              </div>
            </div>
          </div>
        </section>
      </main>
    </div>
  );
}

function SectionHeader({ title }: { title: string }) {
  return (
    <div className="flex items-start gap-4 mb-6">
      <h2 className="font-orbitron font-bold text-lg text-zrp-charcoal dark:text-white">
        {title}
      </h2>
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
