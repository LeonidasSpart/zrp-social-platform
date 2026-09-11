"use client";

import dynamic from "next/dynamic";
import { useLanguage } from "@/contexts/LanguageContext";
import { useAmbassadorCountries } from "@/hooks/useAmbassadorCountries";
import AmbassadorHero from "./AmbassadorHero";
import AmbassadorLevels from "./AmbassadorLevels";
import CountryExplorer from "./CountryExplorer";

/*
 * The world map is the heaviest thing on this page by far - it pulls
 * in react-simple-maps/d3-geo and, at runtime, a ~740KB topojson file
 * - so it's excluded from the page's own bundle entirely via
 * next/dynamic({ssr:false}) and only fetched once someone actually
 * scrolls to it. The map also touches window/SVG layout APIs that
 * don't exist during server rendering, so ssr:false is a correctness
 * requirement here, not just a size optimization.
 */
const WorldMap = dynamic(() => import("./WorldMap"), {
  ssr: false,
  loading: () => (
    <div
      className="aspect-[800/420] w-full animate-pulse rounded-2xl bg-gray-100 dark:bg-gray-800"
      aria-hidden="true"
    />
  ),
});

export default function AmbassadorsExperience() {
  const { t } = useLanguage();
  const { countries, loading } = useAmbassadorCountries();

  return (
    <div className="bg-white dark:bg-zrp-deepBlack">
      <AmbassadorHero />

      <section id="world-map" className="mx-auto max-w-6xl scroll-mt-20 px-4 py-16 sm:py-20">
        <div className="mx-auto max-w-2xl text-center">
          <h2 className="text-balance font-orbitron text-2xl font-bold text-gray-900 dark:text-white sm:text-3xl">
            {t("ambassadors.map.sectionTitle")}
          </h2>
          <p className="mt-3 text-sm text-gray-600 dark:text-gray-400 sm:text-base">
            {t("ambassadors.map.sectionSubtitle")}
          </p>
        </div>

        <div className="mt-10">
          <WorldMap countries={countries} />
        </div>

        <div className="mt-10">
          <CountryExplorer countries={countries} loading={loading} />
        </div>
      </section>

      <AmbassadorLevels />
    </div>
  );
}
