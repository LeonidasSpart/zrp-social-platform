"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { Loader2, TrendingUp } from "lucide-react";
import { useLanguage } from "@/contexts/LanguageContext";

interface TrendingTag {
  tag: string;
  count: number;
}

// Same real data source (/api/hashtags/trending) RightPanel already
// uses on desktop, reformatted as a compact card so mobile/tablet feeds
// get a "Trending on ZRP" module too. Real counts only - never invents
// numbers when the endpoint returns nothing.
export default function HomeTrending() {
  const { t } = useLanguage();
  const [trending, setTrending] = useState<TrendingTag[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    let cancelled = false;

    fetch("/api/hashtags/trending")
      .then((res) => (res.ok ? res.json() : []))
      .then((data) => {
        if (!cancelled) setTrending(Array.isArray(data) ? data.slice(0, 4) : []);
      })
      .catch(() => {})
      .finally(() => {
        if (!cancelled) setLoading(false);
      });

    return () => {
      cancelled = true;
    };
  }, []);

  if (loading) {
    return (
      <div className="bg-white dark:bg-zrp-deepBlack px-4 py-4 border-b border-gray-200 dark:border-gray-800">
        <div className="flex justify-center py-4">
          <Loader2 className="w-5 h-5 animate-spin text-zrp-red" />
        </div>
      </div>
    );
  }

  if (trending.length === 0) return null;

  return (
    <div className="bg-white dark:bg-zrp-deepBlack px-4 py-4 border-b border-gray-200 dark:border-gray-800">
      <div className="flex items-center justify-between mb-3">
        <h2 className="flex items-center gap-1.5 text-base font-bold text-gray-900 dark:text-white">
          <TrendingUp className="w-4 h-4 text-zrp-blue" />
          {t("home.trendingOnZrp")}
        </h2>

        <Link
          href="/explore"
          className="text-xs font-semibold text-zrp-red hover:underline"
        >
          {t("home.seeAll")}
        </Link>
      </div>

      <div className="grid grid-cols-2 gap-2">
        {trending.map((item) => (
          <Link
            key={item.tag}
            href={`/hashtag/${item.tag}`}
            className="rounded-xl border border-zrp-blue/20 bg-zrp-blue/5 dark:bg-zrp-blue/10 px-3 py-2.5 hover:bg-zrp-blue/10 dark:hover:bg-zrp-blue/15 transition"
          >
            <p className="text-sm font-semibold text-gray-900 dark:text-white truncate">
              #{item.tag}
            </p>
            <p className="text-xs text-gray-500 dark:text-gray-400">
              {t("rightPanel.postsCount", { n: item.count })}
            </p>
          </Link>
        ))}
      </div>
    </div>
  );
}
