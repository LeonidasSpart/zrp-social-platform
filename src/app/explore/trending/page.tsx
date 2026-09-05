"use client";

import { useSession } from "next-auth/react";
import { useRouter } from "next/navigation";
import { useEffect, useState } from "react";
import Link from "next/link";
import { ArrowLeft, TrendingUp } from "lucide-react";
import { useLanguage } from "@/contexts/LanguageContext";

export const dynamic = "force-dynamic";

interface TrendingTag {
  tag: string;
  count: number;
}

// Full "Trending on ZRP" discovery page - the "See all" destination for
// HomeTrending. Same real data source (/api/hashtags/trending), just
// requesting the full available list instead of the compact Home teaser's
// slice, and rendered as a full-width scannable list instead of a grid.
export default function TrendingDiscoveryPage() {
  const { status } = useSession();
  const router = useRouter();
  const { t } = useLanguage();
  const [trending, setTrending] = useState<TrendingTag[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    if (status === "unauthenticated") router.push("/login");
  }, [status, router]);

  useEffect(() => {
    if (status !== "authenticated") return;
    let cancelled = false;

    fetch("/api/hashtags/trending?limit=50")
      .then((res) => (res.ok ? res.json() : []))
      .then((data) => {
        if (!cancelled) setTrending(Array.isArray(data) ? data : []);
      })
      .catch(() => {})
      .finally(() => {
        if (!cancelled) setLoading(false);
      });

    return () => {
      cancelled = true;
    };
  }, [status]);

  if (status === "loading" || loading) {
    return (
      <div className="flex items-center justify-center min-h-screen">
        {t("action.loading")}
      </div>
    );
  }

  return (
    <div className="max-w-2xl mx-auto py-4 px-4">
      <div className="flex items-center gap-3 mb-6">
        <Link href="/" className="text-gray-500 hover:text-gray-700 -m-2 p-2">
          <ArrowLeft className="w-5 h-5" />
        </Link>
        <h1 className="text-2xl font-bold text-gray-900 dark:text-white flex items-center gap-2">
          <TrendingUp className="w-6 h-6 text-zrp-blue" />
          {t("rightPanel.trending")}
        </h1>
      </div>

      {trending.length === 0 ? (
        <div className="text-center py-12 text-gray-500 dark:text-gray-400">
          <TrendingUp className="w-12 h-12 mx-auto text-gray-300 dark:text-gray-600 mb-2" />
          <p>{t("rightPanel.noTrending")}</p>
        </div>
      ) : (
        <div className="divide-y divide-gray-200 dark:divide-gray-800">
          {trending.map((item, index) => (
            <Link
              key={item.tag}
              href={`/hashtag/${item.tag}`}
              className="flex items-center gap-4 py-4 hover:bg-gray-50 dark:hover:bg-gray-900/40 -mx-4 px-4 transition"
            >
              <span className="text-sm font-semibold text-gray-400 dark:text-gray-600 w-6 text-right flex-shrink-0">
                {index + 1}
              </span>
              <div className="flex-1 min-w-0">
                <p className="font-semibold text-gray-900 dark:text-white truncate">
                  #{item.tag}
                </p>
                <p className="text-sm text-gray-500 dark:text-gray-400">
                  {t("rightPanel.postsCount", { n: item.count })}
                </p>
              </div>
            </Link>
          ))}
        </div>
      )}
    </div>
  );
}
