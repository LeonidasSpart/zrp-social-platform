"use client";

import { useEffect, useId, useState } from "react";
import { Loader2, X, Copy, Check, Coins } from "lucide-react";
import { useLanguage } from "@/contexts/LanguageContext";
import { useDialogA11y } from "@/hooks/useDialogA11y";
import { isNativeApp } from "@/lib/nativeAuth";
import { nativePaymentHeaders } from "@/lib/native-payment-policy";
import { localizeApiMessage } from "@/lib/api-error-i18n";
// giftDisplayName is a pure slug-humanizer (no gift-specific logic) - the
// exact same client-side "resolve a display name from an admin-authored
// `key`" pattern CoinPackage uses, so it's reused here under a clearer
// local name rather than duplicating the same three lines.
import { giftDisplayName as packageDisplayName } from "./live-api";

/*
 * ============================================================
 * Web-only USDC top-up for ZRP coins, paid through the exact same
 * on-chain-verification mechanism /api/creator/tip already uses - see
 * TipModal.tsx's own comment for why that's the pattern here too: the
 * buyer pays manually from their own wallet app, then pastes the
 * resulting transaction ID here to confirm, which the backend verifies
 * independently on-chain (never trusting the client's report of it).
 *
 * This is deliberately never real Apple/Google IAP, and never
 * crypto-on-native - /api/wallet/coins/purchase already rejects every
 * request carrying the native-app header via rejectNativePayment(),
 * same as /api/creator/tip. nativePaymentHeaders(isNativeApp()) below
 * is what makes that block actually apply when this modal somehow
 * renders inside the native app shell.
 *
 * ⚠️ CORRECTNESS: the deposit address shown below MUST be ZRP's
 * platform wallet (NEXT_PUBLIC_PLATFORM_WALLET) - every on-chain
 * payment on ZRP settles there, never to a per-creator address.
 * ============================================================
 */

interface CoinPackageOption {
  id: string;
  key: string;
  priceUsdc: string;
  coinsCredited: number;
  bonusCoins: number;
}

interface BuyCoinsModalProps {
  isOpen: boolean;
  onClose: () => void;
  onPurchased: () => void;
}

export default function BuyCoinsModal({ isOpen, onClose, onPurchased }: BuyCoinsModalProps) {
  const { t } = useLanguage();
  const platformWallet = process.env.NEXT_PUBLIC_PLATFORM_WALLET || "";

  const [packages, setPackages] = useState<CoinPackageOption[] | null>(null);
  const [packagesError, setPackagesError] = useState<string | null>(null);
  const [selectedKey, setSelectedKey] = useState<string | null>(null);
  const [transactionId, setTransactionId] = useState("");
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [success, setSuccess] = useState(false);
  const [copied, setCopied] = useState(false);

  const titleId = useId();
  const dialogRef = useDialogA11y(isOpen, onClose, !loading);

  useEffect(() => {
    if (!isOpen) return;
    setPackagesError(null);
    (async () => {
      try {
        const res = await fetch("/api/wallet/coins/packages");
        const data = await res.json().catch(() => null);
        if (!res.ok) throw new Error(localizeApiMessage(data?.error, t) || t("tipModal.errGeneric"));
        const list: CoinPackageOption[] = data?.packages ?? [];
        setPackages(list);
        if (list.length > 0) setSelectedKey((prev) => prev ?? list[0].key);
      } catch (err) {
        setPackagesError(err instanceof Error ? err.message : t("tipModal.errGeneric"));
        setPackages([]);
      }
    })();
  }, [isOpen, t]);

  if (!isOpen) return null;

  const handleCopyAddress = async () => {
    if (!platformWallet) return;
    try {
      await navigator.clipboard.writeText(platformWallet);
      setCopied(true);
      setTimeout(() => setCopied(false), 2000);
    } catch {
      // Clipboard access can fail silently on some browsers/permissions -
      // the address is still visible and selectable manually either way.
    }
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setError(null);

    if (!selectedKey) {
      setError(t("buyCoins.errSelectPackage"));
      return;
    }
    if (!transactionId.trim()) {
      setError(t("tipModal.errTransactionIdRequired"));
      return;
    }

    setLoading(true);
    try {
      const response = await fetch("/api/wallet/coins/purchase", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          ...nativePaymentHeaders(isNativeApp()),
        },
        body: JSON.stringify({
          packageKey: selectedKey,
          transactionId: transactionId.trim(),
        }),
      });

      let data: { error?: string; success?: boolean } | null = null;
      try {
        data = await response.json();
      } catch {
        data = null;
      }

      if (!response.ok) {
        throw new Error(localizeApiMessage(data?.error, t) || t("buyCoins.errSubmitFailed"));
      }

      setSuccess(true);
      setTimeout(() => {
        onPurchased();
        onClose();
        setSuccess(false);
        setTransactionId("");
        setError(null);
      }, 1500);
    } catch (err: unknown) {
      console.error("Coin purchase submission error:", err);
      setError(err instanceof Error ? err.message : t("tipModal.errGeneric"));
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 p-4">
      <div
        className="focus:outline-none w-full max-w-md rounded-lg bg-white p-6 shadow-xl dark:bg-gray-900"
        ref={dialogRef}
        role="dialog"
        aria-modal="true"
        aria-labelledby={titleId}
        tabIndex={-1}
      >
        <div className="mb-4 flex items-center justify-between">
          <h2 id={titleId} className="text-xl font-bold text-gray-900 dark:text-white">
            {t("buyCoins.title")}
          </h2>
          <button
            type="button"
            onClick={onClose}
            disabled={loading}
            className="rounded p-3 hover:bg-gray-100 disabled:opacity-50 dark:hover:bg-gray-700"
            aria-label={t("tipModal.close")}
          >
            <X className="h-5 w-5" />
          </button>
        </div>

        {success ? (
          <div className="py-8 text-center">
            <div className="mb-2 text-4xl text-green-500">✓</div>
            <p className="font-medium text-gray-800 dark:text-gray-200">{t("buyCoins.submitted")}</p>
            <p className="mt-1 text-sm text-gray-500 dark:text-gray-400">{t("buyCoins.verifyingOnChain")}</p>
          </div>
        ) : !platformWallet ? (
          <div className="py-6 text-center">
            <p className="text-sm text-gray-600 dark:text-gray-400">{t("buyCoins.walletNotConfigured")}</p>
          </div>
        ) : (
          <form onSubmit={handleSubmit} className="space-y-4">
            <div>
              <label className="mb-1 block text-sm font-medium text-gray-700 dark:text-gray-300">{t("tipModal.step1SendTo")}</label>
              <div className="flex items-center gap-2 rounded-md border border-gray-300 bg-gray-50 px-3 py-2 dark:border-gray-700 dark:bg-gray-800">
                <span className="flex-1 truncate font-mono text-xs text-gray-700 dark:text-gray-300">{platformWallet}</span>
                <button
                  type="button"
                  onClick={handleCopyAddress}
                  className="flex-shrink-0 text-gray-500 hover:text-zrp-red transition"
                  title={t("tipModal.copyAddress")}
                >
                  {copied ? <Check className="h-4 w-4 text-green-500" /> : <Copy className="h-4 w-4" />}
                </button>
              </div>
              <p className="mt-1 text-xs text-gray-400 dark:text-gray-500">{t("tipModal.walletHint")}</p>
            </div>

            <div>
              <label className="mb-1 block text-sm font-medium text-gray-700 dark:text-gray-300">{t("buyCoins.choosePackage")}</label>
              {packagesError ? (
                <p className="text-sm text-zrp-red">{packagesError}</p>
              ) : packages === null ? (
                <div className="grid grid-cols-2 gap-2" aria-busy="true">
                  {[0, 1].map((i) => (
                    <div key={i} className="h-16 rounded-md bg-gray-100 dark:bg-white/5 animate-pulse" />
                  ))}
                </div>
              ) : packages.length === 0 ? (
                <p className="text-sm text-gray-500 dark:text-gray-400">{t("buyCoins.noPackages")}</p>
              ) : (
                <div className="grid grid-cols-2 gap-2">
                  {packages.map((pkg) => {
                    const isSelected = pkg.key === selectedKey;
                    return (
                      <button
                        key={pkg.id}
                        type="button"
                        onClick={() => setSelectedKey(pkg.key)}
                        aria-pressed={isSelected}
                        disabled={loading}
                        className={`flex flex-col items-start gap-0.5 rounded-md border p-3 text-left transition ${
                          isSelected
                            ? "border-zrp-red bg-zrp-red/5"
                            : "border-gray-200 dark:border-gray-700 hover:border-zrp-red/50"
                        }`}
                      >
                        <span className="flex items-center gap-1 text-sm font-semibold text-gray-900 dark:text-white">
                          <Coins className="h-3.5 w-3.5 text-zrp-red" aria-hidden="true" />
                          {packageDisplayName(pkg.key)}
                        </span>
                        <span className="text-xs text-gray-600 dark:text-gray-300 tabular-nums">
                          {t("buyCoins.packageCoins", { coins: pkg.coinsCredited })}
                        </span>
                        {pkg.bonusCoins > 0 && (
                          <span className="text-xs font-medium text-green-600 dark:text-green-400">
                            {t("buyCoins.packageBonus", { bonus: pkg.bonusCoins })}
                          </span>
                        )}
                        <span className="text-xs text-gray-500 dark:text-gray-400">${pkg.priceUsdc} USDC</span>
                      </button>
                    );
                  })}
                </div>
              )}
            </div>

            <div>
              <label className="mb-1 block text-sm font-medium text-gray-700 dark:text-gray-300">{t("buyCoins.step3TransactionId")}</label>
              <input
                type="text"
                value={transactionId}
                onChange={(e) => setTransactionId(e.target.value)}
                placeholder={t("tipModal.transactionIdPlaceholder")}
                disabled={loading}
                className="flex h-10 w-full rounded-md border border-gray-300 bg-white px-3 py-2 text-sm font-mono ring-offset-white focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-red-500 focus-visible:ring-offset-2 disabled:cursor-not-allowed disabled:opacity-50 dark:border-gray-700 dark:bg-gray-800 dark:text-white"
              />
              <p className="mt-1 text-xs text-gray-400 dark:text-gray-500">{t("buyCoins.transactionIdHint")}</p>
            </div>

            {error && (
              <div className="rounded-md bg-red-50 p-3 text-sm text-red-600 dark:bg-red-950/30 dark:text-red-400">{error}</div>
            )}

            <div className="flex justify-end gap-3">
              <button
                type="button"
                onClick={onClose}
                disabled={loading}
                className="inline-flex items-center justify-center rounded-md border border-gray-300 bg-transparent px-4 py-2 text-sm font-medium hover:bg-gray-100 disabled:opacity-50 dark:hover:bg-gray-800"
              >
                {t("tipModal.cancel")}
              </button>
              <button
                type="submit"
                disabled={loading || !selectedKey}
                className="inline-flex items-center justify-center rounded-md bg-red-600 px-4 py-2 text-sm font-medium text-white transition-colors hover:bg-red-700 disabled:opacity-50 disabled:pointer-events-none"
              >
                {loading ? (
                  <>
                    <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                    {t("tipModal.verifying")}
                  </>
                ) : (
                  t("buyCoins.confirmPurchase")
                )}
              </button>
            </div>
          </form>
        )}
      </div>
    </div>
  );
}
