"use client";

import { useState } from "react";
import { Loader2, X, Copy, Check } from "lucide-react";
import { useLanguage } from "@/contexts/LanguageContext";
import { isNativeApp } from "@/lib/nativeAuth";
import { nativePaymentHeaders } from "@/lib/native-payment-policy";

/*
 * Same manual "send from your own wallet app, then paste the
 * transaction signature" flow as TipModal (see that file for why:
 * no wallet-adapter dependency in this app). The deposit address
 * shown here is ZRP's platform wallet - the same address every
 * on-chain payment on ZRP settles to (tips, premium purchases, and
 * now HELP contributions) - never a per-campaign address. The
 * backend verifies the transaction landed there before crediting
 * anything, exactly like /api/creator/tip.
 */

interface ContributeModalProps {
  campaignId: string;
  campaignTitle: string;
  onClose: () => void;
  onContributed: () => void;
}

export default function ContributeModal({ campaignId, campaignTitle, onClose, onContributed }: ContributeModalProps) {
  const { t } = useLanguage();
  const platformWallet = process.env.NEXT_PUBLIC_PLATFORM_WALLET || "";

  const [amount, setAmount] = useState("10");
  const [message, setMessage] = useState("");
  const [isAnonymous, setIsAnonymous] = useState(false);
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
      // Clipboard access can fail silently - address is still visible.
    }
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setError(null);

    const parsedAmount = Number.parseFloat(amount);
    if (!Number.isFinite(parsedAmount) || parsedAmount <= 0) {
      setError(t("help.errInvalidAmount"));
      return;
    }
    if (!transactionId.trim()) {
      setError(t("help.errTransactionIdRequired"));
      return;
    }

    setLoading(true);
    try {
      const response = await fetch(`/api/help/${campaignId}/contribute`, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          ...nativePaymentHeaders(isNativeApp()),
        },
        body: JSON.stringify({
          amount: parsedAmount,
          message: message.trim() || undefined,
          isAnonymous,
          transactionId: transactionId.trim(),
        }),
      });

      const data = await response.json().catch(() => null);
      if (!response.ok) {
        throw new Error(data?.error || t("help.errContributeFailed"));
      }

      setSuccess(true);
      setTimeout(() => {
        onContributed();
        onClose();
      }, 1500);
    } catch (err: unknown) {
      setError(err instanceof Error ? err.message : t("help.errContributeFailed"));
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 p-4">
      <div className="w-full max-w-md rounded-xl bg-white p-6 shadow-xl dark:bg-zrp-deepBlack">
        <div className="mb-4 flex items-center justify-between">
          <h2 className="text-lg font-bold text-gray-900 dark:text-white">{t("help.contributeTitle", { title: campaignTitle })}</h2>
          <button type="button" onClick={onClose} disabled={loading} className="rounded p-1 hover:bg-gray-100 disabled:opacity-50 dark:hover:bg-gray-800" aria-label={t("help.close")}>
            <X className="h-5 w-5" />
          </button>
        </div>

        {success ? (
          <div className="py-8 text-center">
            <div className="mb-2 text-4xl text-green-500">✓</div>
            <p className="font-medium text-gray-800 dark:text-gray-200">{t("help.contributionSubmitted")}</p>
            <p className="mt-1 text-sm text-gray-500 dark:text-gray-400">{t("help.contributionVerifying")}</p>
          </div>
        ) : !platformWallet ? (
          <p className="py-6 text-center text-sm text-gray-500 dark:text-gray-400">{t("help.walletNotConfigured")}</p>
        ) : (
          <form onSubmit={handleSubmit} className="space-y-4">
            <div>
              <label className="mb-1 block text-sm font-medium text-gray-700 dark:text-gray-300">{t("help.step1SendTo")}</label>
              <div className="flex items-center gap-2 rounded-md border border-gray-300 bg-gray-50 px-3 py-2 dark:border-gray-700 dark:bg-gray-800">
                <span className="flex-1 truncate font-mono text-xs text-gray-700 dark:text-gray-300">{platformWallet}</span>
                <button type="button" onClick={handleCopyAddress} className="flex-shrink-0 text-gray-500 hover:text-zrp-red transition" title={t("help.copyAddress")}>
                  {copied ? <Check className="h-4 w-4 text-green-500" /> : <Copy className="h-4 w-4" />}
                </button>
              </div>
              <p className="mt-1 text-xs text-gray-400 dark:text-gray-500">{t("help.walletHint")}</p>
            </div>

            <div>
              <label className="mb-1 block text-sm font-medium text-gray-700 dark:text-gray-300">{t("help.amountLabel")}</label>
              <input
                type="number"
                step="0.01"
                min="0.01"
                value={amount}
                onChange={(e) => setAmount(e.target.value)}
                disabled={loading}
                className="flex h-10 w-full rounded-md border border-gray-300 bg-white px-3 py-2 text-sm focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-red-500 disabled:opacity-50 dark:border-gray-700 dark:bg-gray-800 dark:text-white"
              />
            </div>

            <div>
              <label className="mb-1 block text-sm font-medium text-gray-700 dark:text-gray-300">{t("help.step2TransactionId")}</label>
              <input
                type="text"
                value={transactionId}
                onChange={(e) => setTransactionId(e.target.value)}
                placeholder={t("help.transactionIdPlaceholder")}
                disabled={loading}
                className="flex h-10 w-full rounded-md border border-gray-300 bg-white px-3 py-2 text-sm font-mono focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-red-500 disabled:opacity-50 dark:border-gray-700 dark:bg-gray-800 dark:text-white"
              />
            </div>

            <div>
              <label className="mb-1 block text-sm font-medium text-gray-700 dark:text-gray-300">{t("help.messageLabel")}</label>
              <textarea
                value={message}
                onChange={(e) => setMessage(e.target.value)}
                disabled={loading}
                maxLength={1000}
                className="flex min-h-[70px] w-full rounded-md border border-gray-300 bg-white px-3 py-2 text-sm focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-red-500 disabled:opacity-50 dark:border-gray-700 dark:bg-gray-800 dark:text-white"
              />
            </div>

            <label className="inline-flex items-center gap-2 text-sm text-gray-700 dark:text-gray-300">
              <input type="checkbox" checked={isAnonymous} onChange={(e) => setIsAnonymous(e.target.checked)} disabled={loading} />
              {t("help.contributeAnonymously")}
            </label>

            {error && <div className="rounded-md bg-red-50 p-3 text-sm text-red-600 dark:bg-red-950/30 dark:text-red-400">{error}</div>}

            <div className="flex justify-end gap-3">
              <button type="button" onClick={onClose} disabled={loading} className="inline-flex items-center justify-center rounded-md border border-gray-300 bg-transparent px-4 py-2 text-sm font-medium hover:bg-gray-100 disabled:opacity-50 dark:hover:bg-gray-800">
                {t("help.cancel")}
              </button>
              <button type="submit" disabled={loading} className="inline-flex items-center justify-center rounded-md bg-zrp-red px-4 py-2 text-sm font-medium text-white transition-colors hover:bg-red-600 disabled:opacity-50">
                {loading ? (
                  <>
                    <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                    {t("help.verifying")}
                  </>
                ) : (
                  t("help.confirmContribution")
                )}
              </button>
            </div>

            <p className="text-center text-xs text-gray-400 dark:text-gray-500">{t("help.noFeeNote")}</p>
          </form>
        )}
      </div>
    </div>
  );
}
