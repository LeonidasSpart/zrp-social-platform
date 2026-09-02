"use client";

import { useState, useEffect } from "react";
import Link from "next/link";
import { Loader2, CheckCircle, XCircle, Clock, ExternalLink } from "lucide-react";
import { useLanguage } from "@/contexts/LanguageContext";

interface HelpWithdrawal {
  id: string;
  amount: number;
  currency: string;
  walletAddress: string;
  status: string;
  createdAt: string;
  organizer: { username: string; name: string | null; email: string };
  campaign: { id: string; title: string };
}

const LOCALE_MAP: Record<string, string> = {
  en: "en-US", fr: "fr-FR", de: "de-DE", it: "it-IT", sq: "sq-AL",
  es: "es-ES", ru: "ru-RU", ar: "ar-SA", zh: "zh-CN", tr: "tr-TR", id: "id-ID",
};

export default function AdminHelpWithdrawalsPage() {
  const { t, language } = useLanguage();
  const locale = LOCALE_MAP[language] || "en-US";
  const [withdrawals, setWithdrawals] = useState<HelpWithdrawal[]>([]);
  const [loading, setLoading] = useState(true);
  const [processing, setProcessing] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  const fetchWithdrawals = async () => {
    setLoading(true);
    setError(null);
    try {
      const res = await fetch("/api/admin/help-withdrawals");
      if (!res.ok) throw new Error("Failed to fetch withdrawals");
      const data = await res.json();
      setWithdrawals(data);
    } catch (err) {
      setError(err instanceof Error ? err.message : t("adminHelpWithdrawals.errSomethingWrong"));
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
      const res = await fetch(`/api/admin/help-withdrawals/${id}/${action}`, { method: "POST" });
      if (!res.ok) {
        const err = await res.json();
        throw new Error(err.error || t("adminHelpWithdrawals.errActionFailed"));
      }
      await fetchWithdrawals();
    } catch (err) {
      alert(err instanceof Error ? err.message : t("adminHelpWithdrawals.errActionFailed"));
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
        <h1 className="text-2xl font-bold text-gray-900 dark:text-white">{t("adminHelpWithdrawals.title")}</h1>
        <span className="text-sm text-gray-500">{t("adminHelpWithdrawals.pendingCount", { n: withdrawals.length })}</span>
      </div>

      {withdrawals.length === 0 ? (
        <div className="text-center py-12 text-gray-500 dark:text-gray-400">
          <CheckCircle className="w-12 h-12 mx-auto text-green-500 mb-3" />
          <p>{t("adminHelpWithdrawals.noPending")}</p>
        </div>
      ) : (
        <div className="space-y-4">
          {withdrawals.map((withdrawal) => (
            <div key={withdrawal.id} className="bg-white dark:bg-gray-800 rounded-xl shadow-sm border border-gray-200 dark:border-gray-700 p-4 hover:shadow-md transition">
              <div className="flex flex-col md:flex-row md:items-center justify-between gap-4">
                <div className="flex-1 min-w-0">
                  <div className="flex items-center gap-2 flex-wrap">
                    <span className="font-semibold text-gray-900 dark:text-white">{withdrawal.organizer.name || withdrawal.organizer.username}</span>
                    <span className="text-sm text-gray-500">@{withdrawal.organizer.username}</span>
                    <span className="text-xs bg-blue-100 dark:bg-blue-900/30 text-blue-700 dark:text-blue-400 px-2 py-0.5 rounded-full">
                      {withdrawal.amount} {withdrawal.currency}
                    </span>
                  </div>
                  <Link
                    href={`/aid/campaign/${withdrawal.campaign.id}`}
                    target="_blank"
                    rel="noopener noreferrer"
                    className="inline-flex items-center gap-1 text-xs text-blue-600 hover:text-blue-800 dark:text-blue-400 mt-1"
                  >
                    <ExternalLink className="w-3 h-3" />
                    {withdrawal.campaign.title}
                  </Link>
                  <div className="mt-1 text-sm text-gray-600 dark:text-gray-300">
                    <span className="font-medium">{t("adminHelpWithdrawals.wallet")}</span>{" "}
                    <code className="text-xs bg-gray-100 dark:bg-gray-700 px-1 rounded">{withdrawal.walletAddress}</code>
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
                    {t("adminHelpWithdrawals.approve")}
                  </button>
                  <button
                    onClick={() => runAction(withdrawal.id, "reject")}
                    disabled={processing === withdrawal.id}
                    className="px-4 py-2 bg-red-600 text-white rounded-lg font-medium hover:bg-red-700 transition disabled:opacity-50 flex items-center gap-2"
                  >
                    <XCircle className="w-4 h-4" />
                    {t("adminHelpWithdrawals.reject")}
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
