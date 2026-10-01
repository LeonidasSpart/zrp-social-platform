"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import Image from "next/image";
import { useSession } from "next-auth/react";
import { Image as ImageIcon, Plus } from "lucide-react";
import { useLanguage } from "@/contexts/LanguageContext";

interface LaunchedNftSummary {
  id: string;
  mintAddress: string;
  name: string;
  description: string | null;
  imageUrl: string;
  collectionName: string | null;
  createdAt: string;
  creator: { id: string; username: string; name: string | null; avatarUrl: string | null } | null;
}

export default function NftBrowsePage() {
  const { t } = useLanguage();
  const { data: session } = useSession();
  const [nfts, setNfts] = useState<LaunchedNftSummary[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    setLoading(true);
    fetch("/api/launchpad/nfts")
      .then((res) => res.json())
      .then((data) => setNfts(data.nfts || []))
      .catch(() => setError(t("launchpad.nft.loadError")))
      .finally(() => setLoading(false));
  }, [t]);

  return (
    <div className="max-w-6xl mx-auto px-4 py-6">
      <section className="relative bg-gradient-to-br from-zrp-darkRed to-zrp-deepBlack rounded-2xl px-6 py-10 text-center mb-8">
        <div className="flex items-center justify-center gap-2">
          <ImageIcon className="w-8 h-8 text-white" />
          <h1 className="text-3xl sm:text-4xl font-extrabold font-orbitron text-white">{t("launchpad.nft.title")}</h1>
        </div>
        <p className="mt-3 text-white/80 max-w-xl mx-auto">{t("launchpad.nft.subtitle")}</p>

        <div className="mt-6 flex flex-wrap justify-center gap-3">
          {session?.user && (
            <Link
              href="/launchpad/nft/create"
              className="inline-flex items-center gap-1.5 px-4 py-2 bg-white text-zrp-darkRed rounded-full font-semibold hover:bg-gray-100 transition text-sm"
            >
              <Plus className="w-4 h-4" />
              {t("launchpad.nft.createButton")}
            </Link>
          )}
          <Link
            href="/launchpad/nft-staking"
            className="inline-flex items-center gap-1.5 px-4 py-2 border border-white/40 text-white rounded-full font-semibold hover:bg-white/10 transition text-sm"
          >
            {t("launchpad.nft.stakingPoolsLink")}
          </Link>
        </div>
      </section>

      {error && <p className="text-center py-4 text-red-500">{error}</p>}

      {loading ? (
        <div className="flex justify-center py-16">
          <div className="w-8 h-8 border-4 border-zrp-red border-t-transparent rounded-full animate-spin" />
        </div>
      ) : nfts.length === 0 ? (
        <p className="text-center py-16 text-gray-500 dark:text-gray-400">{t("launchpad.nft.emptyState")}</p>
      ) : (
        <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-4 gap-4">
          {nfts.map((nft) => (
            <Link
              key={nft.id}
              href={`/launchpad/nft/${nft.mintAddress}`}
              className="rounded-xl border border-gray-200 dark:border-gray-700 overflow-hidden hover:border-zrp-red transition bg-white dark:bg-gray-900"
            >
              <Image
                src={nft.imageUrl}
                alt={nft.name}
                width={300}
                height={300}
                className="w-full aspect-square object-cover"
                unoptimized
              />
              <div className="p-3">
                <p className="font-semibold text-gray-900 dark:text-white truncate">{nft.name}</p>
                {nft.collectionName && <p className="text-xs text-gray-500 dark:text-gray-400 truncate">{nft.collectionName}</p>}
              </div>
            </Link>
          ))}
        </div>
      )}
    </div>
  );
}
