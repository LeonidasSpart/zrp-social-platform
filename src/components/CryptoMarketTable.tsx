"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { useLanguage } from "@/contexts/LanguageContext";
import { Skeleton } from "@/components/ui/Skeleton";

/*
 * Live top-100 crypto market snapshot for the Crypto News category.
 *
 * Every number here comes from /api/news/crypto/market, which in turn
 * either returns a real provider snapshot or fails outright - there is
 * no code path in this component that invents, estimates or reuses a
 * stale figure as if it were current. A failed fetch shows the real
 * error state, not a guess.
 */

interface MarketRow {
  id: string;
  symbol: string;
  name: string;
  image: string | null;
  priceUsd: number;
  marketCapUsd: number;
  rank: number;
  volume24hUsd: number;
  priceChangePercent24h: number | null;
}

const REFRESH_INTERVAL_MS = 60_000;

function formatUsd(value: number): string {
  if (value >= 1) {
    return value.toLocaleString("en-US", {
      style: "currency",
      currency: "USD",
      maximumFractionDigits: value >= 1000 ? 0 : 2,
    });
  }
  // Small-cap tokens are routinely worth a fraction of a cent; rounding
  // to two decimals would show "$0.00" for a real, non-zero price.
  return value.toLocaleString("en-US", {
    style: "currency",
    currency: "USD",
    maximumFractionDigits: 6,
  });
}

function formatCompactUsd(value: number): string {
  return value.toLocaleString("en-US", {
    style: "currency",
    currency: "USD",
    notation: "compact",
    maximumFractionDigits: 2,
  });
}

export default function CryptoMarketTable() {
  const { t } = useLanguage();
  const [rows, setRows] = useState<MarketRow[] | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(false);
  const intervalRef = useRef<ReturnType<typeof setInterval> | null>(null);

  const load = useCallback(async () => {
    try {
      const response = await fetch("/api/news/crypto/market", { cache: "no-store" });
      const data = await response.json();

      if (!response.ok || !data.success) {
        setError(true);
        return;
      }

      setError(false);
      setRows(data.rows);
    } catch {
      setError(true);
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    void load();

    // Only poll while the tab is actually visible - no point spending a
    // request a minute on a background tab nobody is looking at.
    function tick() {
      if (document.visibilityState === "visible") void load();
    }
    intervalRef.current = setInterval(tick, REFRESH_INTERVAL_MS);

    function onVisibilityChange() {
      if (document.visibilityState === "visible") void load();
    }
    document.addEventListener("visibilitychange", onVisibilityChange);

    return () => {
      if (intervalRef.current) clearInterval(intervalRef.current);
      document.removeEventListener("visibilitychange", onVisibilityChange);
    };
  }, [load]);

  if (loading) {
    return (
      <div
        className="mb-6 overflow-hidden rounded-2xl border border-border bg-card"
        aria-busy="true"
      >
        <div className="border-b border-border p-4">
          <Skeleton variant="text" className="w-40" />
        </div>
        <div className="divide-y divide-border">
          {Array.from({ length: 6 }).map((_, index) => (
            <div key={index} className="flex items-center gap-3 p-4">
              <Skeleton variant="circle" className="h-8 w-8 shrink-0" />
              <Skeleton variant="text" className="w-24" />
              <Skeleton variant="text" className="ml-auto w-16" />
              <Skeleton variant="text" className="w-14" />
            </div>
          ))}
        </div>
      </div>
    );
  }

  if (error || !rows) {
    return (
      <div
        role="alert"
        aria-live="polite"
        className="mb-6 rounded-2xl border border-dashed border-border bg-card p-6 text-center"
      >
        <p className="text-sm text-muted-foreground">
          {t("news.marketDataUnavailable")}
        </p>
        <button
          type="button"
          onClick={() => {
            setLoading(true);
            void load();
          }}
          className="mt-3 rounded-lg border border-border px-4 py-2 text-sm font-semibold transition hover:border-red-500 hover:text-red-600"
        >
          {t("news.retry")}
        </button>
      </div>
    );
  }

  return (
    <section
      className="mb-6 overflow-hidden rounded-2xl border border-border bg-card"
      aria-label={t("news.cryptoMarketsTitle")}
    >
      <div className="flex items-center justify-between border-b border-border p-4">
        <h2 className="text-base font-semibold">{t("news.cryptoMarketsTitle")}</h2>
        <span className="text-xs text-zrp-blue">
          {rows.length}
        </span>
      </div>

      {/* Horizontal scroll on narrow screens - the page itself never
          scrolls sideways, only this table region does. */}
      <div className="overflow-x-auto">
        <table className="w-full min-w-[560px] border-collapse text-sm">
          <thead>
            <tr className="border-b border-border text-left text-xs uppercase tracking-wide text-muted-foreground">
              <th scope="col" className="px-4 py-2 font-medium">#</th>
              <th scope="col" className="px-2 py-2 font-medium">
                {/* Coin identity column has no separate translated
                    header - the name/symbol are themselves the content,
                    same convention CoinMarketCap-style tables use. */}
              </th>
              <th scope="col" className="px-2 py-2 text-right font-medium">
                {t("news.marketCap")}
              </th>
              <th scope="col" className="px-2 py-2 text-right font-medium">
                {t("news.change24h")}
              </th>
              <th scope="col" className="px-4 py-2 text-right font-medium">
                {t("news.volume24h")}
              </th>
            </tr>
          </thead>
          <tbody className="divide-y divide-border">
            {rows.map((row) => {
              const change = row.priceChangePercent24h;
              const changeIsUp = change !== null && change >= 0;

              return (
                <tr key={row.id} className="hover:bg-muted/40">
                  <td className="px-4 py-2.5 text-muted-foreground">{row.rank}</td>
                  <td className="px-2 py-2.5">
                    <div className="flex items-center gap-2.5">
                      <div className="h-6 w-6 shrink-0 overflow-hidden rounded-full bg-muted">
                        {row.image && (
                          // Matches the rest of the codebase's convention
                          // for arbitrary external image hosts (PostCard,
                          // LinkPreviewCard): a plain <img>, not
                          // next/image, since the provider's icon host
                          // isn't a fixed set next.config.js can allowlist.
                          // eslint-disable-next-line @next/next/no-img-element
                          <img
                            src={row.image}
                            alt=""
                            loading="lazy"
                            className="h-full w-full object-cover"
                          />
                        )}
                      </div>
                      <div className="min-w-0">
                        <div className="truncate font-medium">{row.name}</div>
                        <div className="text-xs text-muted-foreground">{row.symbol}</div>
                      </div>
                      <div className="ml-2 shrink-0 tabular-nums">
                        {formatUsd(row.priceUsd)}
                      </div>
                    </div>
                  </td>
                  <td className="px-2 py-2.5 text-right tabular-nums text-muted-foreground">
                    {formatCompactUsd(row.marketCapUsd)}
                  </td>
                  <td
                    className={[
                      "px-2 py-2.5 text-right tabular-nums font-medium",
                      change === null
                        ? "text-muted-foreground"
                        : changeIsUp
                          ? "text-green-600 dark:text-green-400"
                          : "text-red-600 dark:text-red-500",
                    ].join(" ")}
                  >
                    {change === null ? "—" : `${changeIsUp ? "+" : ""}${change.toFixed(2)}%`}
                  </td>
                  <td className="px-4 py-2.5 text-right tabular-nums text-muted-foreground">
                    {formatCompactUsd(row.volume24hUsd)}
                  </td>
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>
    </section>
  );
}
