"use client";

import { useEffect, useState } from "react";
import { useParams } from "next/navigation";
import Link from "next/link";
import Image from "next/image";
import { useSession } from "next-auth/react";
import { Loader2, Plus } from "lucide-react";

interface ProposalSummary {
  id: string;
  title: string;
  proposerWalletAddress: string;
  votingEndsAt: string;
  forRaw: string;
  againstRaw: string;
  abstainRaw: string;
  status: "ACTIVE" | "PASSED" | "REJECTED" | "CANCELLED";
}

interface DaoDetail {
  id: string;
  name: string;
  description: string | null;
  quorumRaw: string;
  proposalThresholdRaw: string;
  votingPeriodSeconds: number;
  launchedToken: { name: string; symbol: string; imageUrl: string; decimals: number };
  proposals: ProposalSummary[];
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

const STATUS_STYLES: Record<ProposalSummary["status"], string> = {
  ACTIVE: "bg-blue-100 text-blue-700 dark:bg-blue-950/40 dark:text-blue-400",
  PASSED: "bg-green-100 text-green-700 dark:bg-green-950/40 dark:text-green-400",
  REJECTED: "bg-red-100 text-red-700 dark:bg-red-950/40 dark:text-red-400",
  CANCELLED: "bg-gray-100 text-gray-500 dark:bg-gray-800 dark:text-gray-400",
};

export default function DaoDetailPage() {
  const params = useParams<{ id: string }>();
  const { data: session } = useSession();
  const [dao, setDao] = useState<DaoDetail | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    if (!params.id) return;
    setLoading(true);
    fetch(`/api/launchpad/dao/${params.id}`)
      .then((res) => (res.ok ? res.json() : null))
      .then((data) => setDao(data?.dao ?? null))
      .catch(() => {})
      .finally(() => setLoading(false));
  }, [params.id]);

  if (loading) {
    return (
      <div className="flex justify-center py-24">
        <Loader2 className="w-8 h-8 animate-spin text-zrp-red" />
      </div>
    );
  }
  if (!dao) {
    return (
      <div className="max-w-md mx-auto px-4 py-16 text-center">
        <p className="text-gray-600 dark:text-gray-400">DAO not found.</p>
      </div>
    );
  }

  return (
    <div className="max-w-2xl mx-auto px-4 py-8 space-y-6">
      <div className="flex items-center gap-4">
        <Image
          src={dao.launchedToken.imageUrl}
          alt={dao.launchedToken.name}
          width={56}
          height={56}
          className="w-14 h-14 rounded-full object-cover"
          unoptimized
        />
        <div>
          <h1 className="text-2xl font-extrabold font-orbitron text-gray-900 dark:text-white">{dao.name}</h1>
          <p className="text-gray-500 dark:text-gray-400">${dao.launchedToken.symbol} governance</p>
        </div>
      </div>

      {dao.description && <p className="text-sm text-gray-600 dark:text-gray-400">{dao.description}</p>}

      <div className="grid grid-cols-2 gap-3">
        <div className="rounded-md border border-gray-200 dark:border-gray-700 p-3">
          <p className="text-xs text-gray-500 dark:text-gray-400">Quorum</p>
          <p className="font-semibold text-gray-900 dark:text-white">{formatRaw(dao.quorumRaw, dao.launchedToken.decimals)} tokens</p>
        </div>
        <div className="rounded-md border border-gray-200 dark:border-gray-700 p-3">
          <p className="text-xs text-gray-500 dark:text-gray-400">Proposal threshold</p>
          <p className="font-semibold text-gray-900 dark:text-white">{formatRaw(dao.proposalThresholdRaw, dao.launchedToken.decimals)} tokens</p>
        </div>
      </div>

      <div className="flex items-center justify-between">
        <h2 className="font-semibold text-gray-900 dark:text-white">Proposals</h2>
        {session?.user && (
          <Link
            href={`/launchpad/dao/${dao.id}/propose`}
            className="inline-flex items-center gap-1.5 px-3 py-1.5 bg-zrp-red text-white rounded-full font-semibold hover:bg-red-700 transition text-xs"
          >
            <Plus className="w-3.5 h-3.5" />
            New proposal
          </Link>
        )}
      </div>

      {dao.proposals.length === 0 ? (
        <p className="text-center py-8 text-gray-500 dark:text-gray-400">No proposals yet.</p>
      ) : (
        <div className="space-y-3">
          {dao.proposals.map((p) => (
            <Link
              key={p.id}
              href={`/launchpad/dao/proposals/${p.id}`}
              className="block rounded-xl border border-gray-200 dark:border-gray-700 p-4 hover:border-zrp-red transition bg-white dark:bg-gray-900"
            >
              <div className="flex items-center justify-between gap-2">
                <p className="font-semibold text-gray-900 dark:text-white truncate">{p.title}</p>
                <span className={`flex-shrink-0 rounded-full px-2 py-0.5 text-xs font-medium ${STATUS_STYLES[p.status]}`}>{p.status}</span>
              </div>
              <p className="text-xs text-gray-500 dark:text-gray-400 mt-1">
                For {formatRaw(p.forRaw, dao.launchedToken.decimals)} / Against {formatRaw(p.againstRaw, dao.launchedToken.decimals)}
              </p>
            </Link>
          ))}
        </div>
      )}
    </div>
  );
}
