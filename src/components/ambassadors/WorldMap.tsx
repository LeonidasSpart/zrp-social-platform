"use client";

import { useMemo, useState, useCallback, useEffect } from "react";
import {
  ComposableMap,
  Geographies,
  Geography,
  ZoomableGroup,
} from "react-simple-maps";
import { Plus, Minus } from "lucide-react";
import iso from "i18n-iso-countries";
import { useLanguage } from "@/contexts/LanguageContext";
import type { AmbassadorCountryStat } from "@/hooks/useAmbassadorCountries";
import CountryPanel from "./CountryPanel";

/*
 * The interactive world map itself. Deliberately built on a
 * well-maintained third-party geography renderer (react-simple-maps,
 * on top of d3-geo/topojson) rather than hand-authored SVG paths - see
 * the frontend design guidance on exactly that point, and
 * src/lib/ambassadors/countries.ts's own module doc for the full
 * reasoning behind the dataset choice.
 *
 * Geometry source: /data/world-countries-50m.json (Natural Earth via
 * the `world-atlas` package, MIT license, copied into public/ once -
 * see the PR description for exactly how). It draws 241 distinct
 * landmasses; 235 of ZRP's 250 canonical ISO countries have a
 * distinguishable shape in it at this resolution. The 15 that don't
 * (Bouvet Island, Christmas Island, Tokelau, several small Caribbean/
 * Indian-Ocean territories, ...) are real countries too small to
 * render separately at world scale, or merged into a parent
 * territory's shape by the underlying cartographic data - a limitation
 * of drawing the whole world on one screen, not an omission. None of
 * them are ever missing from the Country Explorer or search (see
 * CountryExplorer.tsx) - the accessibility requirement that the map
 * must never be the ONLY way to reach a country holds regardless.
 *
 * Loaded via next/dynamic({ssr:false}) at its call site
 * (AmbassadorsExperience.tsx) specifically so neither
 * react-simple-maps/d3 nor the ~740KB topojson file sit in the initial
 * page bundle - both are fetched only once someone actually reaches
 * the map.
 *
 * Hover recoloring is done in CSS (globals.css, scoped to
 * .zrp-world-map), not by recomputing fill in React state on every
 * mouse-move - 241 SVG paths is exactly the kind of surface where that
 * would matter for the "no unnecessary continuous work" requirement.
 * React state here only tracks which country is hovered for the
 * tooltip's text, updated once on enter/leave, not per pixel of
 * movement.
 */

const GEO_URL = "/data/world-countries-50m.json";

interface WorldMapProps {
  countries: AmbassadorCountryStat[];
}

function fillFor(ambassadors: number, resolvable: boolean, isDark: boolean): string {
  if (!resolvable) return isDark ? "#1f2937" : "#e5e7eb"; // neutral landmass, not part of the dataset
  if (ambassadors === 0) return isDark ? "#27272a" : "#e4e4e7";
  if (ambassadors < 3) return "#fca5a5"; // red-300
  if (ambassadors < 10) return "#f87171"; // red-400
  return "#B10000"; // zrp-darkRed - an established presence
}

export default function WorldMap({ countries }: WorldMapProps) {
  const { t } = useLanguage();
  const [hoveredCode, setHoveredCode] = useState<string | null>(null);
  const [tooltipPos, setTooltipPos] = useState<{ x: number; y: number } | null>(null);
  const [selected, setSelected] = useState<AmbassadorCountryStat | null>(null);
  const [zoom, setZoom] = useState(1);
  const [isDark, setIsDark] = useState(false);

  useEffect(() => {
    setIsDark(document.documentElement.classList.contains("dark"));
    const observer = new MutationObserver(() =>
      setIsDark(document.documentElement.classList.contains("dark")),
    );
    observer.observe(document.documentElement, { attributes: true, attributeFilter: ["class"] });
    return () => observer.disconnect();
  }, []);

  const byCode = useMemo(() => {
    const map = new Map<string, AmbassadorCountryStat>();
    for (const c of countries) map.set(c.code, c);
    return map;
  }, [countries]);

  const handleEnter = useCallback((code: string, evt: React.MouseEvent) => {
    setHoveredCode(code);
    setTooltipPos({ x: evt.clientX, y: evt.clientY });
  }, []);

  const handleLeave = useCallback(() => {
    setHoveredCode(null);
    setTooltipPos(null);
  }, []);

  const hoveredCountry = hoveredCode ? byCode.get(hoveredCode) : null;

  return (
    <div className="relative">
      <div
        className="zrp-world-map overflow-hidden rounded-2xl border border-gray-200 bg-gray-50 dark:border-gray-800 dark:bg-zrp-charcoal/40"
        onMouseLeave={handleLeave}
      >
        <ComposableMap
          projection="geoNaturalEarth1"
          width={800}
          height={420}
          className="h-auto w-full"
          role="img"
          aria-label={t("ambassadors.map.ariaLabel")}
        >
          <ZoomableGroup zoom={zoom} onMoveEnd={(p) => setZoom(p.zoom ?? 1)} minZoom={1} maxZoom={6}>
            <Geographies geography={GEO_URL}>
              {({ geographies }) =>
                geographies.map((geo) => {
                  const code = iso.numericToAlpha2(String(geo.id));
                  const stat = code ? byCode.get(code) : undefined;
                  const resolvable = !!stat;
                  return (
                    <Geography
                      key={geo.rsmKey}
                      geography={geo}
                      data-resolvable={resolvable}
                      onMouseEnter={resolvable ? (evt) => handleEnter(code!, evt) : undefined}
                      onMouseLeave={resolvable ? handleLeave : undefined}
                      onClick={resolvable ? () => setSelected(stat!) : undefined}
                      // Not a keyboard/screen-reader stop, deliberately.
                      // With up to ~235 individually-focusable country
                      // shapes, Tab would have to walk every single one
                      // before ever reaching the Country Explorer below
                      // - the opposite of accessible. The parent
                      // <ComposableMap> above already carries
                      // role="img" + a full aria-label summarizing the
                      // map for a screen reader, and the Explorer gives
                      // every country a real, individually-focusable
                      // button with the same data - see the
                      // Accessibility requirement this satisfies: the
                      // map must never be the only way to reach a
                      // country, so it doesn't need to be a keyboard
                      // route to that same data too.
                      tabIndex={-1}
                      aria-hidden="true"
                      style={{
                        fill: fillFor(stat?.ambassadors ?? 0, resolvable, isDark),
                        stroke: isDark ? "#050505" : "#ffffff",
                        strokeWidth: 0.4,
                        outline: "none",
                        cursor: resolvable ? "pointer" : "default",
                      }}
                    />
                  );
                })
              }
            </Geographies>
          </ZoomableGroup>
        </ComposableMap>
      </div>
      <p className="sr-only">{t("ambassadors.map.useSearchInstead")}</p>

      {/* Zoom controls - the only chrome the map needs; panning is
          native pinch/drag via ZoomableGroup. Keyboard users reach
          every country through the Explorer below instead. */}
      <div className="absolute bottom-3 right-3 flex flex-col overflow-hidden rounded-lg border border-gray-200 bg-white/90 shadow-sm backdrop-blur dark:border-gray-700 dark:bg-zrp-charcoal/90">
        <button
          type="button"
          onClick={() => setZoom((z) => Math.min(6, z + 1))}
          aria-label={t("ambassadors.map.zoomIn")}
          className="p-2 text-gray-600 transition hover:bg-gray-100 dark:text-gray-300 dark:hover:bg-gray-800"
        >
          <Plus className="h-4 w-4" aria-hidden="true" />
        </button>
        <div className="h-px bg-gray-200 dark:bg-gray-700" />
        <button
          type="button"
          onClick={() => setZoom((z) => Math.max(1, z - 1))}
          aria-label={t("ambassadors.map.zoomOut")}
          className="p-2 text-gray-600 transition hover:bg-gray-100 dark:text-gray-300 dark:hover:bg-gray-800"
        >
          <Minus className="h-4 w-4" aria-hidden="true" />
        </button>
      </div>

      {/* Premium hover tooltip - desktop pointer only; touch taps go
          straight to the full CountryPanel below instead. */}
      {hoveredCountry && tooltipPos && (
        <div
          className="pointer-events-none fixed z-40 hidden -translate-x-1/2 -translate-y-[calc(100%+12px)] rounded-xl border border-gray-200 bg-white px-3.5 py-2.5 text-sm shadow-xl dark:border-gray-700 dark:bg-zrp-charcoal sm:block"
          style={{ left: tooltipPos.x, top: tooltipPos.y }}
        >
          <p className="font-semibold text-gray-900 dark:text-white">{hoveredCountry.name}</p>
          <p className="mt-0.5 text-xs text-gray-500 dark:text-gray-400">
            {t("ambassadors.map.labelAmbassadors")}: {hoveredCountry.ambassadors}
          </p>
        </div>
      )}

      {selected && <CountryPanel country={selected} onClose={() => setSelected(null)} />}
    </div>
  );
}
