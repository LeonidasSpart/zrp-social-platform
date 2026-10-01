"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import Image from "next/image";
import { useSession } from "next-auth/react";
import { Sprout, Plus } from "lucide-react";
import { useLanguage } from "@/contexts/LanguageContext";

interface FarmingPoolSummary {
  id: string;
  lpTokenName: string;
  lpTokenSymbol: string;
  apyBasisPoints: number;
  lockSeconds: number;
  totalStakedRaw: string;
  lpDecimals: number;
  rewardToken: { name: string; symbol: string; imageUrl: string };
}

function formatApy(basisPoints: number): string {
  return (basisPoints / 100).toFixed(2) + "%";
}

function formatLock(seconds: number, t: ReturnType<typeof useLanguage>["t"]): string {
  if (seconds === 0) return t("launchpad.farming.noLock");
  const days = Math.round(seconds / 86400);
  return t("launchpad.farming.lockDays", { days });
}

export default function FarmingHomePage() {
  const { t } = useLanguage();
  const { data: session } = useSession();
  const [pools, setPools] = useState<FarmingPoolSummary[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    setLoading(true);
    fetch("/api/launchpad/farming/pools")
      .then((res) => res.json())
      .then((data) => setPools(data.pools || []))
      .catch(() => {})
      .finally(() => setLoading(false));
  }, []);

  return (
    <div className="max-w-5xl mx-auto px-4 py-8">
      <div className="flex items-center justify-between mb-6">
        <div className="flex items-center gap-2">
          <Sprout className="w-7 h-7 text-zrp-red" />
          <h1 className="text-2xl font-extrabold font-orbitron text-gray-900 dark:text-white">{t("launchpad.farming.title")}</h1>
        </div>
        <div className="flex gap-2">
          <Link
            href="/launchpad/farming/positions"
            className="inline-flex items-center gap-1.5 px-4 py-2 border border-gray-300 dark:border-gray-700 rounded-full font-semibold text-sm hover:bg-gray-50 dark:hover:bg-gray-800 transition"
          >
            {t("launchpad.farming.myPositions")}
          </Link>
          {session?.user && (
            <Link
              href="/launchpad/farming/create"
              className="inline-flex items-center gap-1.5 px-4 py-2 bg-zrp-red text-white rounded-full font-semibold hover:bg-red-700 transition text-sm"
            >
              <Plus className="w-4 h-4" />
              {t("launchpad.farming.newPool")}
            </Link>
          )}
        </div>
      </div>
      <p className="text-sm text-gray-500 dark:text-gray-400 mb-6">
        {t("launchpad.farming.subtitle")}
      </p>

      {loading ? (
        <div className="flex justify-center py-16">
          <div className="w-8 h-8 border-4 border-zrp-red border-t-transparent rounded-full animate-spin" />
        </div>
      ) : pools.length === 0 ? (
        <p className="text-center py-16 text-gray-500 dark:text-gray-400">{t("launchpad.farming.empty")}</p>
      ) : (
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4">
          {pools.map((pool) => (
            <Link
              key={pool.id}
              href={`/launchpad/farming/${pool.id}`}
              className="rounded-xl border border-gray-200 dark:border-gray-700 p-4 hover:border-zrp-red transition bg-white dark:bg-gray-900"
            >
              <p className="font-semibold text-gray-900 dark:text-white truncate mb-1">{pool.lpTokenName}</p>
              <p className="text-sm text-gray-500 dark:text-gray-400 mb-2">${pool.lpTokenSymbol}</p>
              <p className="text-2xl font-bold text-green-600 dark:text-green-400">
                {t("launchpad.farming.apyLabel", { apy: formatApy(pool.apyBasisPoints) })}
              </p>
              <div className="flex items-center gap-2 mt-2">
                <Image
                  src={pool.rewardToken.imageUrl}
                  alt={pool.rewardToken.name}
                  width={18}
                  height={18}
                  className="w-[18px] h-[18px] rounded-full object-cover flex-shrink-0"
                  unoptimized
                />
                <p className="text-xs text-gray-500 dark:text-gray-400">
                  {t("launchpad.farming.earnToken", { symbol: pool.rewardToken.symbol })}
                </p>
              </div>
              <p className="text-xs text-gray-500 dark:text-gray-400 mt-1">{formatLock(pool.lockSeconds, t)}</p>
            </Link>
          ))}
        </div>
      )}
    </div>
  );
}
