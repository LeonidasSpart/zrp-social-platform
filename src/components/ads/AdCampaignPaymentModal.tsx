"use client";

import { useState } from "react";
import { Loader2, X, Copy, Check } from "lucide-react";
import { useLanguage } from "@/contexts/LanguageContext";
import { isNativeApp } from "@/lib/nativeAuth";
import { nativePaymentHeaders } from "@/lib/native-payment-policy";

/*
 * Same manual "send from your own wallet app, then paste the
 * transaction signature" flow as TipModal/ContributeModal (see TipModal
 * for why: no wallet-adapter dependency in this app). The backend
 * (/api/ads/campaigns/[id]/pay) independently verifies the transaction
 * on-chain and that it covers the full budgetTotal before activating the
 * campaign - this component never claims a payment succeeded on its own.
 */

interface AdCampaignPaymentModalProps {
  campaignId: string;
  campaignName: string;
  budgetTotal: number;
  onClose: () => void;
  onPaid: () => void;
}

export default function AdCampaignPaymentModal({
  campaignId,
  campaignName,
  budgetTotal,
  onClose,
  onPaid,
}: AdCampaignPaymentModalProps) {
  const { t } = useLanguage();
  const platformWallet = process.env.NEXT_PUBLIC_PLATFORM_WALLET || "";

  const [transactionId, setTransactionId] = useState("");
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [success, setSuccess] = useState(false);
  const [copied, setCopied] = useState(false);

  const handleCopyAddress = async () => {
    if (!platformWallet) return;
    try {
      await navigator.clipboard.writeText(platformWallet);
      setCopied(true);
      setTimeout(() => setCopied(false), 2000);
    } catch {
      // Clipboard access can fail silently - the address stays visible
      // and selectable manually either way.
    }
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setError(null);

    if (!transactionId.trim()) {
      setError(t("ads.pay.errTransactionIdRequired"));
      return;
    }

    setLoading(true);
    try {
      const response = await fetch(`/api/ads/campaigns/${campaignId}/pay`, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          ...nativePaymentHeaders(isNativeApp()),
        },
        body: JSON.stringify({ transactionId: transactionId.trim() }),
      });

      let data: { error?: string } | null = null;
      try {
        data = await response.json();
      } catch {
        data = null;
      }

      if (!response.ok) {
        throw new Error(data?.error || t("ads.pay.errFailed"));
      }

      setSuccess(true);
      setTimeout(() => {
        onPaid();
        onClose();
      }, 1500);
    } catch (err: unknown) {
      setError(err instanceof Error ? err.message : t("ads.pay.errFailed"));
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 p-4">
      <div className="w-full max-w-md rounded-lg bg-white p-6 shadow-xl dark:bg-gray-900">
        <div className="mb-4 flex items-center justify-between">
          <h2 className="text-xl font-bold text-gray-900 dark:text-white">
            {t("ads.pay.title", { name: campaignName })}
          </h2>
          <button
            type="button"
            onClick={onClose}
            disabled={loading}
            className="rounded p-1 hover:bg-gray-100 disabled:opacity-50 dark:hover:bg-gray-700"
            aria-label={t("tipModal.close")}
          >
            <X className="h-5 w-5" />
          </button>
        </div>

        {success ? (
          <div className="py-8 text-center">
            <div className="mb-2 text-4xl text-green-500">✓</div>
            <p className="font-medium text-gray-800 dark:text-gray-200">{t("ads.pay.success")}</p>
          </div>
        ) : (
          <form onSubmit={handleSubmit} className="space-y-4">
            <p className="text-sm text-gray-600 dark:text-gray-400">
              {t("ads.pay.instructions", { amount: budgetTotal })}
            </p>

            <div>
              <label className="mb-1 block text-sm font-medium text-gray-700 dark:text-gray-300">
                {t("ads.pay.amountLabel")}
              </label>
              <div className="flex h-10 w-full items-center rounded-md border border-gray-300 bg-gray-50 px-3 text-sm font-mono dark:border-gray-700 dark:bg-gray-800 dark:text-white">
                ${budgetTotal}
              </div>
            </div>

            <div>
              <label className="mb-1 block text-sm font-medium text-gray-700 dark:text-gray-300">
                {t("tipModal.step1SendTo")}
              </label>
              <div className="flex items-center gap-2 rounded-md border border-gray-300 bg-gray-50 px-3 py-2 dark:border-gray-700 dark:bg-gray-800">
                <span className="flex-1 truncate font-mono text-xs text-gray-700 dark:text-gray-300">
                  {platformWallet}
                </span>
                <button
                  type="button"
                  onClick={handleCopyAddress}
                  className="flex-shrink-0 text-gray-500 hover:text-zrp-red transition"
                  title={t("tipModal.copyAddress")}
                >
                  {copied ? <Check className="h-4 w-4 text-green-500" /> : <Copy className="h-4 w-4" />}
                </button>
              </div>
            </div>

            <div>
              <label className="mb-1 block text-sm font-medium text-gray-700 dark:text-gray-300">
                {t("ads.pay.transactionIdLabel")}
              </label>
              <input
                type="text"
                value={transactionId}
                onChange={(e) => setTransactionId(e.target.value)}
                placeholder={t("ads.pay.transactionIdPlaceholder")}
                disabled={loading}
                className="flex h-10 w-full rounded-md border border-gray-300 bg-white px-3 py-2 text-sm font-mono ring-offset-white focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-red-500 focus-visible:ring-offset-2 disabled:cursor-not-allowed disabled:opacity-50 dark:border-gray-700 dark:bg-gray-800 dark:text-white"
              />
            </div>

            {error && (
              <div className="rounded-md bg-red-50 p-3 text-sm text-red-600 dark:bg-red-950/30 dark:text-red-400">
                {error}
              </div>
            )}

            <div className="flex justify-end gap-3">
              <button
                type="button"
                onClick={onClose}
                disabled={loading}
                className="inline-flex items-center justify-center rounded-md border border-gray-300 bg-transparent px-4 py-2 text-sm font-medium hover:bg-gray-100 disabled:opacity-50 dark:hover:bg-gray-800"
              >
                {t("action.cancel")}
              </button>
              <button
                type="submit"
                disabled={loading}
                className="inline-flex items-center justify-center rounded-md bg-red-600 px-4 py-2 text-sm font-medium text-white transition-colors hover:bg-red-700 disabled:opacity-50 disabled:pointer-events-none"
              >
                {loading ? (
                  <>
                    <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                    {t("ads.pay.verifying")}
                  </>
                ) : (
                  t("ads.pay.submit")
                )}
              </button>
            </div>
          </form>
        )}
      </div>
    </div>
  );
}
