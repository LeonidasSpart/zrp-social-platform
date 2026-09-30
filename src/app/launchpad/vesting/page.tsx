"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { useSession } from "next-auth/react";
import { Loader2, Plus } from "lucide-react";

interface VestingContractSummary {
  id: string;
  beneficiaryWalletAddress: string;
  totalAmount: string;
  totalReleased: string;
  status: string;
  claimableRaw: string;
  launchedToken: { name: string; symbol: string; decimals: number; imageUrl: string };
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

export default function MyVestingPage() {
  const { data: session, status } = useSession();
  const [contracts, setContracts] = useState<VestingContractSummary[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    if (!session?.user) return;
    setLoading(true);
    fetch("/api/launchpad/vesting?mine=1")
      .then((res) => res.json())
      .then((data) => setContracts(data.contracts || []))
      .catch(() => {})
      .finally(() => setLoading(false));
  }, [session]);

  if (status === "loading") {
    return (
      <div className="flex justify-center py-24">
        <Loader2 className="w-8 h-8 animate-spin text-zrp-red" />
      </div>
    );
  }
  if (!session?.user) {
    return (
      <div className="max-w-md mx-auto px-4 py-16 text-center">
        <p className="text-gray-600 dark:text-gray-400">Sign in to view your vesting contracts.</p>
      </div>
    );
  }

  return (
    <div className="max-w-3xl mx-auto px-4 py-8">
      <div className="flex items-center justify-between mb-6">
        <h1 className="text-2xl font-extrabold font-orbitron text-gray-900 dark:text-white">My vesting contracts</h1>
        <Link
          href="/launchpad/vesting/create"
          className="inline-flex items-center gap-1.5 px-4 py-2 bg-zrp-red text-white rounded-full font-semibold hover:bg-red-700 transition text-sm"
        >
          <Plus className="w-4 h-4" />
          New
        </Link>
      </div>

      {loading ? (
        <div className="flex justify-center py-16">
          <Loader2 className="w-6 h-6 animate-spin text-zrp-red" />
        </div>
      ) : contracts.length === 0 ? (
        <p className="text-center py-16 text-gray-500 dark:text-gray-400">You haven&apos;t created any vesting contracts yet.</p>
      ) : (
        <div className="space-y-3">
          {contracts.map((c) => (
            <div key={c.id} className="rounded-xl border border-gray-200 dark:border-gray-700 p-4 bg-white dark:bg-gray-900">
              <div className="flex items-center justify-between">
                <p className="font-semibold text-gray-900 dark:text-white">
                  {c.launchedToken.name} (${c.launchedToken.symbol})
                </p>
                <span
                  className={`text-xs font-semibold px-2 py-0.5 rounded-full ${
                    c.status === "COMPLETED" ? "bg-green-100 text-green-700 dark:bg-green-900/30 dark:text-green-400" : "bg-gray-100 text-gray-600 dark:bg-gray-800 dark:text-gray-300"
                  }`}
                >
                  {c.status}
                </span>
              </div>
              <p className="text-xs text-gray-500 dark:text-gray-400 font-mono mt-1 truncate">To: {c.beneficiaryWalletAddress}</p>
              <p className="text-sm text-gray-600 dark:text-gray-400 mt-2">
                Released {formatRaw(c.totalReleased, c.launchedToken.decimals)} / {formatRaw(c.totalAmount, c.launchedToken.decimals)}
              </p>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
