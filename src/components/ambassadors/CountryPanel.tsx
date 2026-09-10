"use client";

import Link from "next/link";
import { X } from "lucide-react";
import { useLanguage } from "@/contexts/LanguageContext";
import { flagEmoji } from "@/lib/ambassadors/countries";
import type { AmbassadorCountryStat } from "@/hooks/useAmbassadorCountries";

/*
 * The country detail surface shared by both the world map (a country
 * click opens this as a panel) and the country explorer list (a row
 * click opens the same component). One implementation, so a Nigeria
 * with 12 ambassadors reads identically no matter which of the two
 * ways someone got there.
 *
 * Every number here comes straight from the AmbassadorCountryStat the
 * caller passes in - itself sourced from /api/ambassadors/countries,
 * a real database query. There is no "explore" action to a per-country
 * community page because ZRP has no such destination yet; the one
 * real, working action is applying to become the ambassador for this
 * country.
 */

interface CountryPanelProps {
  country: AmbassadorCountryStat;
  onClose?: () => void;
  /** Renders as an inline card (explorer) rather than an overlay (map). */
  variant?: "overlay" | "inline";
}

export default function CountryPanel({ country, onClose, variant = "overlay" }: CountryPanelProps) {
  const { t } = useLanguage();
  const hasAmbassadors = country.ambassadors > 0;

  const body = (
    <div
      className={
        variant === "overlay"
          ? "w-full max-w-sm rounded-2xl border border-gray-200 bg-white p-5 shadow-2xl dark:border-gray-800 dark:bg-zrp-charcoal"
          : "w-full rounded-2xl border border-gray-200 bg-white p-5 dark:border-gray-800 dark:bg-zrp-charcoal"
      }
    >
      <div className="flex items-start justify-between gap-3">
        <div className="flex items-center gap-3 min-w-0">
          <span className="text-3xl leading-none" aria-hidden="true">
            {flagEmoji(country.code)}
          </span>
          <h3 className="truncate font-orbitron text-lg font-bold text-gray-900 dark:text-white">
            {country.name}
          </h3>
        </div>
        {onClose && (
          <button
            type="button"
            onClick={onClose}
            aria-label={t("ambassadors.map.closePanel")}
            className="shrink-0 rounded-full p-1.5 text-gray-400 transition hover:bg-gray-100 hover:text-gray-600 dark:hover:bg-gray-800 dark:hover:text-gray-300"
          >
            <X className="h-4 w-4" aria-hidden="true" />
          </button>
        )}
      </div>

      <dl className="mt-4 grid grid-cols-3 gap-3 text-center">
        <div>
          <dt className="text-[11px] font-medium uppercase tracking-wide text-gray-500 dark:text-gray-400">
            {t("ambassadors.map.labelAmbassadors")}
          </dt>
          <dd className="mt-1 text-xl font-bold tabular-nums text-zrp-red">{country.ambassadors}</dd>
        </div>
        <div>
          <dt className="text-[11px] font-medium uppercase tracking-wide text-gray-500 dark:text-gray-400">
            {t("ambassadors.map.labelCommunities")}
          </dt>
          <dd className="mt-1 text-xl font-bold tabular-nums text-gray-900 dark:text-white">
            {country.communities}
          </dd>
        </div>
        <div>
          <dt className="text-[11px] font-medium uppercase tracking-wide text-gray-500 dark:text-gray-400">
            {t("ambassadors.map.labelMembers")}
          </dt>
          <dd className="mt-1 text-xl font-bold tabular-nums text-gray-900 dark:text-white">
            {country.activeMembers}
          </dd>
        </div>
      </dl>

      <p className="mt-4 text-sm text-gray-600 dark:text-gray-300">
        {hasAmbassadors
          ? t("ambassadors.map.hasAmbassadors", { country: country.name })
          : t("ambassadors.map.noAmbassadorsYet", { country: country.name })}
      </p>

      <Link
        href={`/ambassadors/apply?country=${country.code}`}
        className="mt-4 flex w-full items-center justify-center rounded-full bg-zrp-red px-4 py-2.5 text-sm font-semibold text-white transition hover:bg-zrp-darkRed"
      >
        {t("ambassadors.map.becomeCta")}
      </Link>
    </div>
  );

  if (variant === "inline") return body;

  return (
    <div
      role="dialog"
      aria-modal="true"
      aria-label={country.name}
      className="fixed inset-0 z-50 flex items-end justify-center bg-black/50 p-4 sm:items-center"
      onClick={onClose}
    >
      <div onClick={(e) => e.stopPropagation()}>{body}</div>
    </div>
  );
}
