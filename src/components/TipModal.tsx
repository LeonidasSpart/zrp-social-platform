"use client";

import { useState } from "react";
import { Loader2, X, Copy, Check } from "lucide-react";
import { isNativeApp } from "@/lib/nativeAuth";
import { nativePaymentHeaders } from "@/lib/native-payment-policy";

/*
 * ============================================================
 * This component previously used @solana/wallet-adapter-react
 * to connect a browser wallet extension and sign an on-chain
 * transaction directly from the app. That pulled in the entire
 * wallet-adapter-wallets dependency tree (Trezor, Particle
 * Network, WalletConnect/Reown, Torus, Keystone, etc.) - the
 * source of the overwhelming majority of this project's npm
 * audit findings, despite this being the only place any of it
 * was actually used.
 *
 * The backend (/api/creator/tip) already independently verifies
 * the submitted transaction on-chain server-side via @/lib/solana
 * - it never blindly trusted what the browser sent. That meant
 * the client never actually needed to build/sign the transaction
 * itself; it only needed a transaction ID to hand to the backend.
 *
 * This version keeps tipping working with zero backend changes:
 * show the recipient's saved wallet address, the sender pays
 * manually from their own wallet app (Phantom, Solflare, etc.,
 * entirely outside this app), then pastes the resulting
 * transaction ID here to confirm - which the backend verifies
 * exactly as before.
 * ============================================================
 */

interface TipModalProps {
  isOpen: boolean;
  onClose: () => void;
  recipientId: string;
  recipientName: string;
  recipientWallet: string | null;
  onTipSent: () => void;
}

export default function TipModal({
  isOpen,
  onClose,
  recipientId,
  recipientName,
  recipientWallet,
  onTipSent,
}: TipModalProps) {
  const [amount, setAmount] = useState("5");
  const [message, setMessage] = useState("");
  const [transactionId, setTransactionId] = useState("");
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [success, setSuccess] = useState(false);
  const [copied, setCopied] = useState(false);

  if (!isOpen) return null;

  const handleCopyAddress = async () => {
    if (!recipientWallet) return;
    try {
      await navigator.clipboard.writeText(recipientWallet);
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

    const parsedAmount = Number.parseFloat(amount);
    if (!Number.isFinite(parsedAmount) || parsedAmount <= 0) {
      setError("Please enter a valid USDC amount.");
      return;
    }
    if (parsedAmount > 1_000_000) {
      setError("The maximum tip amount is 1,000,000 USDC.");
      return;
    }
    if (!transactionId.trim()) {
      setError("Enter the transaction ID from your wallet after sending.");
      return;
    }

    setLoading(true);
    try {
      const response = await fetch("/api/creator/tip", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          ...nativePaymentHeaders(isNativeApp()),
        },
        body: JSON.stringify({
          recipientId,
          amount: parsedAmount,
          message: message.trim() || undefined,
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
        throw new Error(data?.error || "Couldn't verify or record this tip.");
      }

      setSuccess(true);
      setTimeout(() => {
        onTipSent();
        onClose();
        setSuccess(false);
        setMessage("");
        setAmount("5");
        setTransactionId("");
        setError(null);
      }, 1500);
    } catch (err: unknown) {
      console.error("Tip submission error:", err);
      setError(err instanceof Error ? err.message : "Something went wrong.");
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 p-4">
      <div className="w-full max-w-md rounded-lg bg-white p-6 shadow-xl dark:bg-gray-900">
        <div className="mb-4 flex items-center justify-between">
          <h2 className="text-xl font-bold text-gray-900 dark:text-white">
            Send Tip to {recipientName}
          </h2>
          <button
            type="button"
            onClick={onClose}
            disabled={loading}
            className="rounded p-1 hover:bg-gray-100 disabled:opacity-50 dark:hover:bg-gray-700"
            aria-label="Close"
          >
            <X className="h-5 w-5" />
          </button>
        </div>

        {success ? (
          <div className="py-8 text-center">
            <div className="mb-2 text-4xl text-green-500">✓</div>
            <p className="font-medium text-gray-800 dark:text-gray-200">
              Tip submitted!
            </p>
            <p className="mt-1 text-sm text-gray-500 dark:text-gray-400">
              We're verifying it on-chain now. Thank you for supporting {recipientName}.
            </p>
          </div>
        ) : !recipientWallet ? (
          <div className="py-6 text-center">
            <p className="text-sm text-gray-600 dark:text-gray-400">
              {recipientName} hasn't set up a wallet to receive tips yet.
            </p>
          </div>
        ) : (
          <form onSubmit={handleSubmit} className="space-y-4">
            <div>
              <label className="mb-1 block text-sm font-medium text-gray-700 dark:text-gray-300">
                1. Send USDC to this address
              </label>
              <div className="flex items-center gap-2 rounded-md border border-gray-300 bg-gray-50 px-3 py-2 dark:border-gray-700 dark:bg-gray-800">
                <span className="flex-1 truncate font-mono text-xs text-gray-700 dark:text-gray-300">
                  {recipientWallet}
                </span>
                <button
                  type="button"
                  onClick={handleCopyAddress}
                  className="flex-shrink-0 text-gray-500 hover:text-zrp-red transition"
                  title="Copy address"
                >
                  {copied ? <Check className="h-4 w-4 text-green-500" /> : <Copy className="h-4 w-4" />}
                </button>
              </div>
              <p className="mt-1 text-xs text-gray-400 dark:text-gray-500">
                Use your own wallet app (Phantom, Solflare, etc.) to send from outside ZRP.
              </p>
            </div>

            <div>
              <label className="mb-1 block text-sm font-medium text-gray-700 dark:text-gray-300">
                Amount (USDC)
              </label>
              <input
                type="number"
                step="0.01"
                min="0.01"
                value={amount}
                onChange={(e) => setAmount(e.target.value)}
                placeholder="Enter amount"
                disabled={loading}
                className="flex h-10 w-full rounded-md border border-gray-300 bg-white px-3 py-2 text-sm ring-offset-white focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-red-500 focus-visible:ring-offset-2 disabled:cursor-not-allowed disabled:opacity-50 dark:border-gray-700 dark:bg-gray-800 dark:text-white"
              />
            </div>

            <div>
              <label className="mb-1 block text-sm font-medium text-gray-700 dark:text-gray-300">
                2. Transaction ID
              </label>
              <input
                type="text"
                value={transactionId}
                onChange={(e) => setTransactionId(e.target.value)}
                placeholder="Paste the signature from your wallet"
                disabled={loading}
                className="flex h-10 w-full rounded-md border border-gray-300 bg-white px-3 py-2 text-sm font-mono ring-offset-white focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-red-500 focus-visible:ring-offset-2 disabled:cursor-not-allowed disabled:opacity-50 dark:border-gray-700 dark:bg-gray-800 dark:text-white"
              />
              <p className="mt-1 text-xs text-gray-400 dark:text-gray-500">
                We verify this on-chain before crediting the tip.
              </p>
            </div>

            <div>
              <label className="mb-1 block text-sm font-medium text-gray-700 dark:text-gray-300">
                Message (optional)
              </label>
              <textarea
                value={message}
                onChange={(e) => setMessage(e.target.value)}
                placeholder="Supportive message..."
                disabled={loading}
                maxLength={1000}
                className="flex min-h-[80px] w-full rounded-md border border-gray-300 bg-white px-3 py-2 text-sm ring-offset-white focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-red-500 focus-visible:ring-offset-2 disabled:cursor-not-allowed disabled:opacity-50 dark:border-gray-700 dark:bg-gray-800 dark:text-white"
              />
              <p className="mt-1 text-right text-xs text-gray-400 dark:text-gray-500">
                {message.length}/1000
              </p>
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
                Cancel
              </button>
              <button
                type="submit"
                disabled={loading}
                className="inline-flex items-center justify-center rounded-md bg-red-600 px-4 py-2 text-sm font-medium text-white transition-colors hover:bg-red-700 disabled:opacity-50 disabled:pointer-events-none"
              >
                {loading ? (
                  <>
                    <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                    Verifying...
                  </>
                ) : (
                  "Confirm Tip"
                )}
              </button>
            </div>

            <p className="text-center text-xs text-gray-400 dark:text-gray-500">
              10% platform fee · 35% of platform fees go to charity
            </p>
          </form>
        )}
      </div>
    </div>
  );
}
