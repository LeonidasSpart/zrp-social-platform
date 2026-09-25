"use client";

import { useState, useEffect } from "react";
import { Loader2, CheckCircle, XCircle, Clock } from "lucide-react";
import { useLanguage } from "@/contexts/LanguageContext";
import { getDateLocale } from "@/lib/dateLocale";
import AdminUserIdentity from "@/components/admin/AdminUserIdentity";
import { localizeApiMessage } from "@/lib/api-error-i18n";

/*
 * Creator payout review queue.
 *
 * ⚠️ CONNECTIVITY: GET /api/admin/withdrawals and POST
 * /api/admin/withdrawals/[id]/approve|reject (see src/app/api/admin/withdrawals/)
 * already existed, fully built - real on-chain USDC transfer on approve
 * (src/lib/solana.ts's sendUsdc), idempotent/crash-safe finalization
 * (src/lib/withdrawals.ts), and a real balance refund on reject - but no
 * admin page anywhere ever called them. A creator could submit a
 * withdrawal (POST /api/creator/withdraw, see the creator dashboard) and
 * it would sit at PENDING forever with no way for an admin to see or
 * action it. Modeled directly on the equivalent, already-wired HELP
 * withdrawals queue (src/app/admin/help-withdrawals/page.tsx).
 */

interface CreatorWithdrawal {
  id: string;
  amount: number;
  currency: string;
  walletAddress: string;
  status: string;
  createdAt: string;
  user: {
    username: string;
    name: string | null;
    email: string;
    avatarUrl?: string | null;
    badgeType?: string | null;
  };
}

export default function AdminWithdrawalsPage() {
  const { t, language } = useLanguage();
  const locale = getDateLocale(language);
  const [withdrawals, setWithdrawals] = useState<CreatorWithdrawal[]>([]);
  const [loading, setLoading] = useState(true);
  const [processing, setProcessing] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  const fetchWithdrawals = async () => {
    setLoading(true);
    setError(null);
    try {
      const res = await fetch("/api/admin/withdrawals?status=PENDING");
      if (!res.ok) throw new Error("Failed to fetch withdrawals");
      const data = await res.json();
      setWithdrawals(data);
    } catch (err) {
      setError(err instanceof Error ? err.message : t("adminWithdrawals.errSomethingWrong"));
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    fetchWithdrawals();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const runAction = async (id: string, action: "approve" | "reject") => {
    setProcessing(id);
    try {
      const res = await fetch(`/api/admin/withdrawals/${id}/${action}`, { method: "POST" });
      if (!res.ok || res.status === 202) {
        // 202 = the transfer was broadcast but its outcome isn't
        // confirmed yet. res.ok is true for it, so it must be surfaced
        // explicitly or the admin sees a silent "success".
        const err = await res.json().catch(() => ({}));
        throw new Error(localizeApiMessage(err.error, t) || t("adminWithdrawals.errActionFailed"));
      }
      await fetchWithdrawals();
    } catch (err) {
      alert(err instanceof Error ? err.message : t("adminWithdrawals.errActionFailed"));
      // A 202 ("ambiguous, resolving automatically") or a genuine failure
      // both still need the list refreshed - the row's real status (not
      // this UI's own guess) may already have changed server-side.
      await fetchWithdrawals();
    } finally {
      setProcessing(null);
    }
  };

  if (loading) {
    return (
      <div className="flex items-center justify-center h-64">
        <Loader2 className="w-8 h-8 animate-spin text-zrp-red" />
      </div>
    );
  }

  if (error) {
    return (
      <div className="max-w-4xl mx-auto py-8 px-4">
        <div className="bg-red-50 border border-red-200 rounded-lg p-4 text-red-700">{error}</div>
      </div>
    );
  }

  return (
    <div>
      <div className="flex items-center justify-between mb-6">
        <h1 className="text-2xl font-bold text-gray-900 dark:text-white">{t("adminWithdrawals.title")}</h1>
        <span className="text-sm text-gray-500">{t("adminWithdrawals.pendingCount", { n: withdrawals.length })}</span>
      </div>

      {withdrawals.length === 0 ? (
        <div className="text-center py-12 text-gray-500 dark:text-gray-400">
          <CheckCircle className="w-12 h-12 mx-auto text-green-500 mb-3" />
          <p>{t("adminWithdrawals.noPending")}</p>
        </div>
      ) : (
        <div className="space-y-4">
          {withdrawals.map((withdrawal) => (
            <div key={withdrawal.id} className="bg-white dark:bg-gray-800 rounded-xl shadow-sm border border-gray-200 dark:border-gray-700 p-4 hover:shadow-md transition">
              <div className="flex flex-col md:flex-row md:items-center justify-between gap-4">
                <div className="flex-1 min-w-0">
                  <AdminUserIdentity
                    user={withdrawal.user}
                    extra={
                      <span className="text-xs bg-blue-100 dark:bg-blue-900/30 text-blue-700 dark:text-blue-400 px-2 py-0.5 rounded-full">
                        {withdrawal.amount} {withdrawal.currency}
                      </span>
                    }
                  />
                  <div className="mt-1 text-sm text-gray-600 dark:text-gray-300">
                    <span className="font-medium">{t("adminWithdrawals.wallet")}</span>{" "}
                    <code className="text-xs bg-gray-100 dark:bg-gray-700 px-1 rounded break-all">{withdrawal.walletAddress}</code>
                  </div>
                  <div className="mt-1 flex items-center gap-2 text-xs text-gray-400">
                    <Clock className="w-3 h-3" />
                    <span>{new Date(withdrawal.createdAt).toLocaleString(locale)}</span>
                  </div>
                </div>
                <div className="flex gap-2 flex-shrink-0">
                  <button
                    onClick={() => runAction(withdrawal.id, "approve")}
                    disabled={processing === withdrawal.id}
                    className="px-4 py-2 bg-green-600 text-white rounded-lg font-medium hover:bg-green-700 transition disabled:opacity-50 flex items-center gap-2"
                  >
                    {processing === withdrawal.id ? <Loader2 className="w-4 h-4 animate-spin" /> : <CheckCircle className="w-4 h-4" />}
                    {t("adminWithdrawals.approve")}
                  </button>
                  <button
                    onClick={() => runAction(withdrawal.id, "reject")}
                    disabled={processing === withdrawal.id}
                    className="px-4 py-2 bg-red-600 text-white rounded-lg font-medium hover:bg-red-700 transition disabled:opacity-50 flex items-center gap-2"
                  >
                    <XCircle className="w-4 h-4" />
                    {t("adminWithdrawals.reject")}
                  </button>
                </div>
              </div>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
