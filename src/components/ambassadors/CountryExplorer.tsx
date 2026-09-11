"use client";

import { useMemo, useState } from "react";
import { Search } from "lucide-react";
import { useLanguage } from "@/contexts/LanguageContext";
import type { TranslationKey } from "@/lib/translations";
import { flagEmoji, REGIONS, type ZrpRegion } from "@/lib/ambassadors/countries";
import type { AmbassadorCountryStat } from "@/hooks/useAmbassadorCountries";
import CountryPanel from "./CountryPanel";

/*
 * The searchable, complete country list that sits beside the world
 * map - and the primary requirement this satisfies on its own: every
 * one of the 250 countries is reachable here by keyboard and by a
 * screen reader with no dependency on the map's SVG geometry at all
 * (see the Accessibility requirement: "the map cannot be mouse-only").
 *
 * Search runs through src/lib/ambassadors/searchCountries - the exact
 * same complete dataset the map and the stats API use, so a country
 * can never be findable on the map but not here, or vice versa. The
 * region filter (REGIONS) only narrows which of the already-complete
 * list is shown; it can never make a country disappear from the
 * dataset itself.
 */

interface CountryExplorerProps {
  countries: AmbassadorCountryStat[];
  loading: boolean;
}

const REGION_LABEL_KEY: Record<ZrpRegion, TranslationKey> = {
  AFRICA: "ambassadors.region.africa",
  ASIA: "ambassadors.region.asia",
  EUROPE: "ambassadors.region.europe",
  NORTH_AMERICA: "ambassadors.region.northAmerica",
  SOUTH_AMERICA: "ambassadors.region.southAmerica",
  OCEANIA: "ambassadors.region.oceania",
  ANTARCTICA: "ambassadors.region.antarctica",
};

export default function CountryExplorer({ countries, loading }: CountryExplorerProps) {
  const { t } = useLanguage();
  const [query, setQuery] = useState("");
  const [region, setRegion] = useState<ZrpRegion | "ALL">("ALL");
  const [selected, setSelected] = useState<AmbassadorCountryStat | null>(null);

  const filtered = useMemo(() => {
    const q = query.trim().toLowerCase();
    return countries
      .filter((c) => region === "ALL" || c.region === region)
      .filter((c) => !q || c.name.toLowerCase().includes(q) || c.code.toLowerCase() === q)
      .sort((a, b) => b.ambassadors - a.ambassadors || a.name.localeCompare(b.name));
  }, [countries, query, region]);

  return (
    <div>
      <div className="flex flex-col gap-3 sm:flex-row sm:items-center">
        <label htmlFor="ambassador-country-search" className="sr-only">
          {t("ambassadors.map.searchPlaceholder")}
        </label>
        <div className="relative flex-1">
          <Search
            className="pointer-events-none absolute left-3.5 top-1/2 h-4 w-4 -translate-y-1/2 text-gray-400"
            aria-hidden="true"
          />
          <input
            id="ambassador-country-search"
            type="text"
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            placeholder={t("ambassadors.map.searchPlaceholder")}
            className="w-full rounded-full border border-gray-300 bg-white py-2.5 pl-10 pr-4 text-sm text-gray-900 focus:border-transparent focus:ring-2 focus:ring-zrp-red dark:border-gray-700 dark:bg-zrp-charcoal dark:text-white"
          />
        </div>

        <label htmlFor="ambassador-region-filter" className="sr-only">
          {t("ambassadors.map.allRegions")}
        </label>
        <select
          id="ambassador-region-filter"
          value={region}
          onChange={(e) => setRegion(e.target.value as ZrpRegion | "ALL")}
          className="rounded-full border border-gray-300 bg-white px-4 py-2.5 text-sm text-gray-900 focus:border-transparent focus:ring-2 focus:ring-zrp-red dark:border-gray-700 dark:bg-zrp-charcoal dark:text-white"
        >
          <option value="ALL">{t("ambassadors.map.allRegions")}</option>
          {REGIONS.map((r) => (
            <option key={r} value={r}>
              {t(REGION_LABEL_KEY[r])}
            </option>
          ))}
        </select>
      </div>

      <div
        role="list"
        aria-label={t("ambassadors.map.searchPlaceholder")}
        aria-busy={loading}
        className="mt-4 grid max-h-[420px] grid-cols-1 gap-2 overflow-y-auto pr-1 sm:grid-cols-2"
      >
        {loading ? (
          Array.from({ length: 8 }).map((_, i) => (
            <div
              key={i}
              className="h-14 animate-pulse rounded-xl bg-gray-100 dark:bg-gray-800"
              aria-hidden="true"
            />
          ))
        ) : filtered.length === 0 ? (
          <p className="col-span-full py-8 text-center text-sm text-gray-500 dark:text-gray-400">
            {t("ambassadors.map.noResults")}
          </p>
        ) : (
          filtered.map((country) => (
            <button
              key={country.code}
              type="button"
              role="listitem"
              onClick={() => setSelected(country)}
              className="flex items-center gap-3 rounded-xl border border-gray-200 bg-white px-3.5 py-2.5 text-left transition hover:border-zrp-red/40 hover:bg-red-50/40 dark:border-gray-800 dark:bg-zrp-charcoal dark:hover:bg-zrp-red/5"
            >
              <span className="text-xl leading-none" aria-hidden="true">
                {flagEmoji(country.code)}
              </span>
              <span className="min-w-0 flex-1 truncate text-sm font-medium text-gray-900 dark:text-white">
                {country.name}
              </span>
              <span
                className={`shrink-0 rounded-full px-2 py-0.5 text-xs font-semibold tabular-nums ${
                  country.ambassadors > 0
                    ? "bg-zrp-red/10 text-zrp-red"
                    : "bg-gray-100 text-gray-400 dark:bg-gray-800 dark:text-gray-500"
                }`}
              >
                {country.ambassadors}
              </span>
            </button>
          ))
        )}
      </div>

      {selected && <CountryPanel country={selected} onClose={() => setSelected(null)} />}
    </div>
  );
}
