"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import Image from "next/image";
import { useSession } from "next-auth/react";
import { Rocket, Plus } from "lucide-react";

interface IdoCampaignSummary {
  id: string;
  title: string;
  tokenPriceUsdc: number;
  softCapUsdc: number;
  hardCapUsdc: number;
  saleStartsAt: string;
  saleEndsAt: string;
  launchedToken: { name: string; symbol: string; imageUrl: string };
}

export default function IdoHomePage() {
  const { data: session } = useSession();
  const [campaigns, setCampaigns] = useState<IdoCampaignSummary[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    setLoading(true);
    fetch("/api/launchpad/ido")
      .then((res) => res.json())
      .then((data) => setCampaigns(data.campaigns || []))
      .catch(() => {})
      .finally(() => setLoading(false));
  }, []);

  return (
    <div className="max-w-5xl mx-auto px-4 py-8">
      <div className="flex items-center justify-between mb-2">
        <div className="flex items-center gap-2">
          <Rocket className="w-7 h-7 text-zrp-red" />
          <h1 className="text-2xl font-extrabold font-orbitron text-gray-900 dark:text-white">IDO campaigns</h1>
        </div>
        {session?.user && (
          <Link
            href="/launchpad/ido/create"
            className="inline-flex items-center gap-1.5 px-4 py-2 bg-zrp-red text-white rounded-full font-semibold hover:bg-red-700 transition text-sm"
          >
            <Plus className="w-4 h-4" />
            Open a campaign
          </Link>
        )}
      </div>
      <p className="text-sm text-gray-500 dark:text-gray-400 mb-6">
        ZRP does not pool, hold, or distribute funds for any sale listed here. Each campaign shows its own off-platform instructions for
        approved participants.
      </p>

      {loading ? (
        <div className="flex justify-center py-16">
          <div className="w-8 h-8 border-4 border-zrp-red border-t-transparent rounded-full animate-spin" />
        </div>
      ) : campaigns.length === 0 ? (
        <p className="text-center py-16 text-gray-500 dark:text-gray-400">No IDO campaigns yet.</p>
      ) : (
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4">
          {campaigns.map((c) => (
            <Link
              key={c.id}
              href={`/launchpad/ido/${c.id}`}
              className="rounded-xl border border-gray-200 dark:border-gray-700 p-4 hover:border-zrp-red transition bg-white dark:bg-gray-900"
            >
              <div className="flex items-center gap-2 mb-2">
                <Image
                  src={c.launchedToken.imageUrl}
                  alt={c.launchedToken.name}
                  width={28}
                  height={28}
                  className="w-7 h-7 rounded-full object-cover flex-shrink-0"
                  unoptimized
                />
                <div className="min-w-0">
                  <p className="font-semibold text-gray-900 dark:text-white truncate">{c.title}</p>
                  <p className="text-xs text-gray-500 dark:text-gray-400">${c.launchedToken.symbol}</p>
                </div>
              </div>
              <p className="text-sm text-gray-600 dark:text-gray-400">${c.tokenPriceUsdc} / token</p>
              <p className="text-xs text-gray-400 dark:text-gray-500 mt-1">
                Cap: ${c.softCapUsdc.toLocaleString()} - ${c.hardCapUsdc.toLocaleString()}
              </p>
            </Link>
          ))}
        </div>
      )}
    </div>
  );
}
