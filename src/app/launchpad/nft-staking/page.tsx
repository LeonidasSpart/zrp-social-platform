"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import Image from "next/image";
import { useSession } from "next-auth/react";
import { Layers, Plus } from "lucide-react";
import { useLanguage } from "@/contexts/LanguageContext";

type TFn = ReturnType<typeof useLanguage>["t"];

interface NftStakingPoolSummary {
  id: string;
  collectionName: string;
  rewardRatePerDayRaw: string;
  lockSeconds: number;
  rewardToken: { name: string; symbol: string; imageUrl: string; decimals: number };
}

function formatRaw(raw: string, decimals: number): string {
  try {
    const value = BigInt(raw);
    if (decimals === 0) return value.toLocaleString();
    let divisor = BigInt(1);
    for (let i = 0; i < decimals; i += 1) divisor *= BigInt(10);
    return (value / divisor).toLocaleString();
  } catch {
    return raw;
  }
}

function formatLock(seconds: number, t: TFn): string {
  if (seconds === 0) return t("launchpad.nftStaking.noLock");
  const days = Math.round(seconds / 86400);
  return t("launchpad.nftStaking.lockDays", { days, s: days === 1 ? "" : "s" });
}

export default function NftStakingHomePage() {
  const { t } = useLanguage();
  const { data: session } = useSession();
  const [pools, setPools] = useState<NftStakingPoolSummary[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    setLoading(true);
    fetch("/api/launchpad/nft-staking/pools")
      .then((res) => res.json())
      .then((data) => setPools(data.pools || []))
      .catch(() => {})
      .finally(() => setLoading(false));
  }, []);

  return (
    <div className="max-w-5xl mx-auto px-4 py-8">
      <div className="flex items-center justify-between mb-6">
        <div className="flex items-center gap-2">
          <Layers className="w-7 h-7 text-zrp-red" />
          <h1 className="text-2xl font-extrabold font-orbitron text-gray-900 dark:text-white">{t("launchpad.nftStaking.title")}</h1>
        </div>
        <div className="flex gap-2">
          <Link
            href="/launchpad/nft-staking/positions"
            className="inline-flex items-center gap-1.5 px-4 py-2 border border-gray-300 dark:border-gray-700 rounded-full font-semibold text-sm hover:bg-gray-50 dark:hover:bg-gray-800 transition"
          >
            {t("launchpad.nftStaking.myPositions")}
          </Link>
          {session?.user && (
            <Link
              href="/launchpad/nft-staking/create"
              className="inline-flex items-center gap-1.5 px-4 py-2 bg-zrp-red text-white rounded-full font-semibold hover:bg-red-700 transition text-sm"
            >
              <Plus className="w-4 h-4" />
              {t("launchpad.nftStaking.newPool")}
            </Link>
          )}
        </div>
      </div>

      {loading ? (
        <div className="flex justify-center py-16">
          <div className="w-8 h-8 border-4 border-zrp-red border-t-transparent rounded-full animate-spin" />
        </div>
      ) : pools.length === 0 ? (
        <p className="text-center py-16 text-gray-500 dark:text-gray-400">{t("launchpad.nftStaking.empty")}</p>
      ) : (
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4">
          {pools.map((pool) => (
            <Link
              key={pool.id}
              href={`/launchpad/nft-staking/${pool.id}`}
              className="rounded-xl border border-gray-200 dark:border-gray-700 p-4 hover:border-zrp-red transition bg-white dark:bg-gray-900"
            >
              <p className="font-semibold text-gray-900 dark:text-white truncate mb-2">{pool.collectionName}</p>
              <div className="flex items-center gap-2 mb-2">
                <Image
                  src={pool.rewardToken.imageUrl}
                  alt={pool.rewardToken.name}
                  width={24}
                  height={24}
                  className="w-6 h-6 rounded-full object-cover flex-shrink-0"
                  unoptimized
                />
                <p className="text-sm text-gray-600 dark:text-gray-400">
                  {t("launchpad.nftStaking.rewardPerNftPerDay", {
                    amount: formatRaw(pool.rewardRatePerDayRaw, pool.rewardToken.decimals),
                    symbol: pool.rewardToken.symbol,
                  })}
                </p>
              </div>
              <p className="text-xs text-gray-500 dark:text-gray-400">{formatLock(pool.lockSeconds, t)}</p>
            </Link>
          ))}
        </div>
      )}
    </div>
  );
}
