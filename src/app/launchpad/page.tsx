"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import Image from "next/image";
import { useSession } from "next-auth/react";
import { Rocket, Plus } from "lucide-react";
import { useLanguage } from "@/contexts/LanguageContext";

interface LaunchedTokenSummary {
  id: string;
  mintAddress: string;
  name: string;
  symbol: string;
  description: string | null;
  imageUrl: string;
  supply: string;
  decimals: number;
  revokeMint: boolean;
  revokeFreeze: boolean;
  revokeUpdate: boolean;
  createdAt: string;
  creator: { id: string; username: string; name: string | null; avatarUrl: string | null } | null;
}

export default function LaunchpadHomePage() {
  const { data: session } = useSession();
  const { t } = useLanguage();
  const [tokens, setTokens] = useState<LaunchedTokenSummary[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    setLoading(true);
    fetch("/api/launchpad/tokens")
      .then((res) => res.json())
      .then((data) => setTokens(data.tokens || []))
      .catch(() => setError(t("launchpad.home.loadError")))
      .finally(() => setLoading(false));
  }, [t]);

  return (
    <div className="max-w-6xl mx-auto px-4 py-6">
      <section className="relative bg-gradient-to-br from-zrp-darkRed to-zrp-deepBlack rounded-2xl px-6 py-10 text-center mb-8">
        <div className="flex items-center justify-center gap-2">
          <Rocket className="w-8 h-8 text-white" />
          <h1 className="text-3xl sm:text-4xl font-extrabold font-orbitron text-white">{t("launchpad.home.title")}</h1>
        </div>
        <p className="mt-3 text-white/80 max-w-xl mx-auto">{t("launchpad.home.subtitle")}</p>

        <div className="mt-6 flex flex-wrap justify-center gap-3">
          {session?.user && (
            <>
              <Link
                href="/launchpad/create"
                className="inline-flex items-center gap-1.5 px-4 py-2 bg-white text-zrp-darkRed rounded-full font-semibold hover:bg-gray-100 transition text-sm"
              >
                <Plus className="w-4 h-4" />
                {t("launchpad.home.createToken")}
              </Link>
              <Link
                href="/launchpad/vesting"
                className="inline-flex items-center gap-1.5 px-4 py-2 border border-white/40 text-white rounded-full font-semibold hover:bg-white/10 transition text-sm"
              >
                {t("launchpad.home.myVestingContracts")}
              </Link>
            </>
          )}
          <Link
            href="/launchpad/staking"
            className="inline-flex items-center gap-1.5 px-4 py-2 border border-white/40 text-white rounded-full font-semibold hover:bg-white/10 transition text-sm"
          >
            {t("launchpad.home.stakingPools")}
          </Link>
          <Link
            href="/launchpad/vesting/claim"
            className="inline-flex items-center gap-1.5 px-4 py-2 border border-white/40 text-white rounded-full font-semibold hover:bg-white/10 transition text-sm"
          >
            {t("launchpad.home.claimVestedTokens")}
          </Link>
          <Link
            href="/launchpad/nft"
            className="inline-flex items-center gap-1.5 px-4 py-2 border border-white/40 text-white rounded-full font-semibold hover:bg-white/10 transition text-sm"
          >
            {t("launchpad.home.nfts")}
          </Link>
          <Link
            href="/launchpad/nft-staking"
            className="inline-flex items-center gap-1.5 px-4 py-2 border border-white/40 text-white rounded-full font-semibold hover:bg-white/10 transition text-sm"
          >
            {t("launchpad.home.nftStaking")}
          </Link>
          <Link
            href="/launchpad/farming"
            className="inline-flex items-center gap-1.5 px-4 py-2 border border-white/40 text-white rounded-full font-semibold hover:bg-white/10 transition text-sm"
          >
            {t("launchpad.home.liquidityFarming")}
          </Link>
          <Link
            href="/launchpad/dao"
            className="inline-flex items-center gap-1.5 px-4 py-2 border border-white/40 text-white rounded-full font-semibold hover:bg-white/10 transition text-sm"
          >
            {t("launchpad.home.daos")}
          </Link>
          <Link
            href="/launchpad/ido"
            className="inline-flex items-center gap-1.5 px-4 py-2 border border-white/40 text-white rounded-full font-semibold hover:bg-white/10 transition text-sm"
          >
            {t("launchpad.home.idoCampaigns")}
          </Link>
          <Link
            href="/launchpad/scanner"
            className="inline-flex items-center gap-1.5 px-4 py-2 border border-white/40 text-white rounded-full font-semibold hover:bg-white/10 transition text-sm"
          >
            {t("launchpad.home.tokenScanner")}
          </Link>
          <Link
            href="/launchpad/swap"
            className="inline-flex items-center gap-1.5 px-4 py-2 border border-white/40 text-white rounded-full font-semibold hover:bg-white/10 transition text-sm"
          >
            {t("launchpad.home.swap")}
          </Link>
          <Link
            href="/launchpad/airdrop"
            className="inline-flex items-center gap-1.5 px-4 py-2 border border-white/40 text-white rounded-full font-semibold hover:bg-white/10 transition text-sm"
          >
            {t("launchpad.home.airdrop")}
          </Link>
          <Link
            href="/launchpad/ai-assistant"
            className="inline-flex items-center gap-1.5 px-4 py-2 border border-white/40 text-white rounded-full font-semibold hover:bg-white/10 transition text-sm"
          >
            {t("launchpad.home.aiAssistant")}
          </Link>
        </div>
      </section>

      {error && <p className="text-center py-4 text-red-500">{error}</p>}

      {loading ? (
        <div className="flex justify-center py-16">
          <div className="w-8 h-8 border-4 border-zrp-red border-t-transparent rounded-full animate-spin" />
        </div>
      ) : tokens.length === 0 ? (
        <p className="text-center py-16 text-gray-500 dark:text-gray-400">{t("launchpad.home.emptyState")}</p>
      ) : (
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4">
          {tokens.map((token) => (
            <Link
              key={token.id}
              href={`/launchpad/token/${token.mintAddress}`}
              className="flex items-center gap-3 rounded-xl border border-gray-200 dark:border-gray-700 p-4 hover:border-zrp-red transition bg-white dark:bg-gray-900"
            >
              <Image
                src={token.imageUrl}
                alt={token.name}
                width={48}
                height={48}
                className="w-12 h-12 rounded-full object-cover flex-shrink-0"
                unoptimized
              />
              <div className="min-w-0">
                <p className="font-semibold text-gray-900 dark:text-white truncate">{token.name}</p>
                <p className="text-sm text-gray-500 dark:text-gray-400">${token.symbol}</p>
              </div>
            </Link>
          ))}
        </div>
      )}
    </div>
  );
}
