"use client";

import { useEffect, useState } from "react";
import Image from "next/image";
import { Loader2, Rocket, Coins, Lock, Layers, Users2 } from "lucide-react";
import { useLanguage } from "@/contexts/LanguageContext";
import { getDateLocale } from "@/lib/dateLocale";
import AdminUserIdentity from "@/components/admin/AdminUserIdentity";

/*
 * Admin > ZRP Launchpad (Phase 5).
 *
 * Read-only visibility into every launchpad phase shipped so far - real
 * counts and real USDC amounts from GET /api/admin/launchpad, nothing
 * estimated. Unlike withdrawals/help-withdrawals there is no
 * approve/reject action here: tokens aren't user-generated content
 * needing moderation, and every fee/payout path is already automated
 * and verified on-chain - this page exists purely so an admin can see
 * what's happening without a direct database query.
 */

interface LaunchedTokenRow {
  id: string;
  mintAddress: string | null;
  name: string;
  symbol: string;
  imageUrl: string;
  // Decimal, serialized as an exact string (jsonWithDecimalStrings) -
  // `supply` is a raw base-unit amount that would lose precision as a
  // JS number. Money-scale fields (feeAmount, below) are converted to
  // plain numbers by the route before serialization instead.
  supply: string;
  decimals: number;
  feeAmount: number;
  status: "PENDING" | "COMPLETED" | "FAILED";
  failureReason: string | null;
  createdAt: string;
  creator: { id: string; username: string; name: string | null; avatarUrl: string | null } | null;
}

interface LaunchpadStats {
  tokensByStatus: Record<string, number>;
  totalFeeRevenue: number;
  vestingContractCount: number;
  stakingPoolCount: number;
  totalReferralCommissionPaid: number;
}

const STATUS_STYLES: Record<string, string> = {
  PENDING: "bg-yellow-100 text-yellow-700 dark:bg-yellow-900/30 dark:text-yellow-400",
  COMPLETED: "bg-green-100 text-green-700 dark:bg-green-900/30 dark:text-green-400",
  FAILED: "bg-red-100 text-red-700 dark:bg-red-900/30 dark:text-red-400",
};

export default function AdminLaunchpadPage() {
  const { t, language } = useLanguage();
  const locale = getDateLocale(language);
  const [tokens, setTokens] = useState<LaunchedTokenRow[]>([]);
  const [stats, setStats] = useState<LaunchpadStats | null>(null);
  const [statusFilter, setStatusFilter] = useState<string>("");
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    let cancelled = false;
    setLoading(true);
    setError(null);
    const qs = statusFilter ? `?status=${statusFilter}` : "";
    fetch(`/api/admin/launchpad${qs}`)
      .then((res) => {
        if (!res.ok) throw new Error("Failed to load launchpad data.");
        return res.json();
      })
      .then((data) => {
        if (cancelled) return;
        setTokens(data.tokens || []);
        setStats(data.stats || null);
      })
      .catch((err) => {
        if (!cancelled) setError(err instanceof Error ? err.message : "Failed to load launchpad data.");
      })
      .finally(() => {
        if (!cancelled) setLoading(false);
      });
    return () => {
      cancelled = true;
    };
  }, [statusFilter]);

  return (
    <div>
      <div className="mb-6 flex items-center gap-2">
        <Rocket className="h-6 w-6 text-zrp-red" />
        <h1 className="text-2xl font-bold text-gray-900 dark:text-white">{t("adminLaunchpad.title")}</h1>
      </div>

      {stats && (
        <div className="mb-6 grid grid-cols-2 gap-3 sm:grid-cols-3 lg:grid-cols-5">
          <StatCard icon={Coins} label={t("adminLaunchpad.statTokensLaunched")} value={stats.tokensByStatus.COMPLETED ?? 0} />
          <StatCard icon={Rocket} label={t("adminLaunchpad.statFeeRevenue")} value={`$${stats.totalFeeRevenue.toFixed(2)}`} />
          <StatCard icon={Lock} label={t("adminLaunchpad.statVestingContracts")} value={stats.vestingContractCount} />
          <StatCard icon={Layers} label={t("adminLaunchpad.statStakingPools")} value={stats.stakingPoolCount} />
          <StatCard icon={Users2} label={t("adminLaunchpad.statReferralPaid")} value={`$${stats.totalReferralCommissionPaid.toFixed(2)}`} />
        </div>
      )}

      <div className="mb-4 flex flex-wrap gap-2">
        {([
          { value: "", label: t("adminLaunchpad.statusAll") },
          { value: "COMPLETED", label: t("adminLaunchpad.statusCompleted") },
          { value: "PENDING", label: t("adminLaunchpad.statusPending") },
          { value: "FAILED", label: t("adminLaunchpad.statusFailed") },
        ] as const).map((opt) => (
          <button
            key={opt.value || "all"}
            type="button"
            onClick={() => setStatusFilter(opt.value)}
            className={`rounded-full px-3 py-1.5 text-sm font-medium transition ${
              statusFilter === opt.value
                ? "bg-zrp-red text-white"
                : "bg-gray-100 text-gray-700 hover:bg-gray-200 dark:bg-gray-800 dark:text-gray-300 dark:hover:bg-gray-700"
            }`}
          >
            {opt.label}
          </button>
        ))}
      </div>

      {loading ? (
        <div className="flex h-64 items-center justify-center">
          <Loader2 className="h-8 w-8 animate-spin text-zrp-red" />
        </div>
      ) : error ? (
        <div className="rounded-lg border border-red-200 bg-red-50 p-4 text-red-700 dark:border-red-900/40 dark:bg-red-900/10 dark:text-red-400">
          {error}
        </div>
      ) : tokens.length === 0 ? (
        <p className="py-12 text-center text-gray-500 dark:text-gray-400">{t("adminLaunchpad.noTokens")}</p>
      ) : (
        <div className="space-y-3">
          {tokens.map((token) => (
            <div
              key={token.id}
              className="rounded-xl border border-gray-200 bg-white p-4 shadow-sm dark:border-gray-700 dark:bg-gray-800"
            >
              <div className="flex flex-col gap-3 md:flex-row md:items-center md:justify-between">
                <div className="flex min-w-0 items-center gap-3">
                  <Image
                    src={token.imageUrl}
                    alt={token.name}
                    width={40}
                    height={40}
                    className="h-10 w-10 flex-shrink-0 rounded-full object-cover"
                    unoptimized
                  />
                  <div className="min-w-0">
                    <div className="flex items-center gap-2">
                      <p className="truncate font-semibold text-gray-900 dark:text-white">
                        {token.name} <span className="text-gray-400">${token.symbol}</span>
                      </p>
                      <span className={`rounded-full px-2 py-0.5 text-xs font-medium ${STATUS_STYLES[token.status]}`}>
                        {token.status}
                      </span>
                    </div>
                    {token.creator ? (
                      <AdminUserIdentity user={token.creator} />
                    ) : (
                      <p className="text-sm text-gray-400">{t("adminLaunchpad.unknownCreator")}</p>
                    )}
                    {token.status === "FAILED" && token.failureReason && (
                      <p className="mt-1 text-xs text-red-600 dark:text-red-400">{token.failureReason}</p>
                    )}
                    {token.mintAddress && (
                      <code className="mt-1 block truncate text-xs text-gray-400">{token.mintAddress}</code>
                    )}
                  </div>
                </div>
                <div className="flex flex-shrink-0 items-center gap-4 text-sm">
                  <span className="font-medium text-gray-700 dark:text-gray-300">${token.feeAmount.toFixed(2)}</span>
                  <span className="text-xs text-gray-400">{new Date(token.createdAt).toLocaleString(locale)}</span>
                </div>
              </div>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}

function StatCard({ icon: Icon, label, value }: { icon: typeof Rocket; label: string; value: string | number }) {
  return (
    <div className="rounded-xl border border-gray-200 bg-white p-3 dark:border-gray-700 dark:bg-gray-800">
      <div className="flex items-center gap-2 text-gray-400">
        <Icon className="h-4 w-4" />
        <span className="text-xs">{label}</span>
      </div>
      <p className="mt-1 text-xl font-bold text-gray-900 dark:text-white">{value}</p>
    </div>
  );
}
