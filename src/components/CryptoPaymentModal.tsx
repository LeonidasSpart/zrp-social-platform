"use client";

import { useState } from "react";
import { X, Copy, Check } from "lucide-react";
import { useSession } from "next-auth/react";

interface Props {
  plan: string;
  amount: number;
  onClose: () => void;
  onSuccess: () => void;
}

export default function CryptoPaymentModal({ plan, amount, onClose, onSuccess }: Props) {
  const { data: session } = useSession();
  const walletAddress = process.env.NEXT_PUBLIC_SOLANA_WALLET_ADDRESS || "4Ry8cedia14SSS7UK3CRdQRqKVawdqwL61RFBE1pGsKh";
  const [transactionId, setTransactionId] = useState("");
  const [copied, setCopied] = useState(false);
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const copyAddress = () => {
    navigator.clipboard.writeText(walletAddress);
    setCopied(true);
    setTimeout(() => setCopied(false), 3000);
  };

  const handleSubmit = async () => {
    if (!transactionId.trim()) {
      setError("Please paste the transaction signature.");
      return;
    }

    setSubmitting(true);
    setError(null);
    try {
      const res = await fetch("/api/payment/crypto", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ plan, transactionId }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || "Failed to submit payment");
      alert("Payment request submitted! An admin will verify it within 24 hours.");
      onSuccess();
      onClose();
    } catch (err) {
      setError(err instanceof Error ? err.message : "Something went wrong");
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-50 p-4">
      <div className="bg-white dark:bg-zrp-deepBlack rounded-xl shadow-xl max-w-md w-full p-6 relative">
        <button
          onClick={onClose}
          className="absolute top-3 right-3 text-gray-400 hover:text-gray-600 dark:hover:text-gray-200 transition"
        >
          <X className="w-5 h-5" />
        </button>

        <h2 className="text-xl font-bold text-gray-900 dark:text-white mb-4">
          Subscribe to {plan.charAt(0).toUpperCase() + plan.slice(1)}
        </h2>

        <div className="space-y-4">
          <div>
            <p className="text-sm text-gray-600 dark:text-gray-400">
              Send exactly <span className="font-bold">{amount} USDC</span> (Solana) to the address below.
            </p>
          </div>

          <div className="bg-gray-50 dark:bg-gray-700/50 rounded-lg p-3 flex items-center justify-between">
            <code className="text-xs text-gray-800 dark:text-gray-200 break-all">
              {walletAddress}
            </code>
            <button
              onClick={copyAddress}
              className="flex-shrink-0 ml-2 text-blue-600 hover:text-blue-800 dark:text-blue-400"
              title="Copy address"
            >
              {copied ? <Check className="w-5 h-5" /> : <Copy className="w-5 h-5" />}
            </button>
          </div>

          <div>
            <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1">
              Transaction Signature (after you send)
            </label>
            <input
              type="text"
              value={transactionId}
              onChange={(e) => setTransactionId(e.target.value)}
              placeholder="Paste your transaction signature here"
              className="w-full px-4 py-2 border border-gray-300 dark:border-gray-600 rounded-lg focus:ring-2 focus:ring-zrp-red focus:border-transparent bg-white dark:bg-gray-700 text-gray-900 dark:text-white"
            />
            <p className="text-xs text-gray-400 dark:text-gray-500 mt-1">
              Paste the transaction signature from your wallet to help us verify.
            </p>
          </div>

          {error && <p className="text-red-500 text-sm">{error}</p>}

          <button
            onClick={handleSubmit}
            disabled={submitting}
            className="w-full bg-zrp-red text-white py-2 rounded-lg font-medium hover:bg-zrp-darkRed disabled:opacity-50 transition"
          >
            {submitting ? "Submitting..." : "Submit for Verification"}
          </button>

          <p className="text-xs text-gray-400 dark:text-gray-500 text-center">
            Your plan will be upgraded once an admin verifies the transaction.
          </p>
        </div>
      </div>
    </div>
  );
}
