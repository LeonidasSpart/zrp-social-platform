"use client";

import { Compass, Flag, Users2, Globe } from "lucide-react";
import { useLanguage } from "@/contexts/LanguageContext";
import type { TranslationKey } from "@/lib/translations";

/*
 * The four-level progression from section 9 of the brief. This is
 * presented here as what it is - a real, numbered sequence a person
 * actually moves through - which is exactly the one case the design
 * system's "don't use 01/02/03 markers on content that isn't a
 * sequence" rule doesn't apply to.
 *
 * The levels themselves (AmbassadorLevel in schema.prisma) aren't
 * driven by anything yet beyond APPROVED unlocking AMBASSADOR - the
 * activity signals this section describes (community engagement,
 * retention, quality participation) don't exist as tracked data
 * anywhere in ZRP today, and inventing a scoring formula for them here
 * would be exactly the kind of fabricated metric the brief rules out.
 * This section is the real, honest description of the path; automatic
 * progression along it is UI/architecture foundation for later.
 */
const LEVELS: { icon: typeof Compass; nameKey: TranslationKey; descKey: TranslationKey }[] = [
  { icon: Compass, nameKey: "ambassadors.levels.explorer", descKey: "ambassadors.levels.explorerDesc" },
  { icon: Flag, nameKey: "ambassadors.levels.ambassador", descKey: "ambassadors.levels.ambassadorDesc" },
  {
    icon: Users2,
    nameKey: "ambassadors.levels.communityLeader",
    descKey: "ambassadors.levels.communityLeaderDesc",
  },
  {
    icon: Globe,
    nameKey: "ambassadors.levels.globalAmbassador",
    descKey: "ambassadors.levels.globalAmbassadorDesc",
  },
];

export default function AmbassadorLevels() {
  const { t } = useLanguage();

  return (
    <section className="mx-auto max-w-5xl px-4 py-16 sm:py-20">
      <div className="mx-auto max-w-2xl text-center">
        <h2 className="text-balance font-orbitron text-2xl font-bold text-gray-900 dark:text-white sm:text-3xl">
          {t("ambassadors.levels.sectionTitle")}
        </h2>
        <p className="mt-3 text-sm text-gray-600 dark:text-gray-400 sm:text-base">
          {t("ambassadors.levels.sectionSubtitle")}
        </p>
      </div>

      <ol className="mt-12 grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-4">
        {LEVELS.map((level, i) => {
          const Icon = level.icon;
          return (
            <li
              key={level.nameKey}
              className="relative rounded-2xl border border-gray-200 bg-white p-5 dark:border-gray-800 dark:bg-zrp-charcoal"
            >
              <span className="text-xs font-semibold text-gray-400 dark:text-gray-600">
                {String(i + 1).padStart(2, "0")}
              </span>
              <div className="mt-3 flex h-11 w-11 items-center justify-center rounded-xl bg-zrp-red/10 text-zrp-red">
                <Icon className="h-5 w-5" aria-hidden="true" />
              </div>
              <h3 className="mt-4 font-orbitron text-base font-bold text-gray-900 dark:text-white">
                {t(level.nameKey)}
              </h3>
              <p className="mt-1.5 text-sm text-gray-600 dark:text-gray-400">{t(level.descKey)}</p>
            </li>
          );
        })}
      </ol>
    </section>
  );
}
