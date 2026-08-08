"use client";

import { useState } from "react";
import { X, Loader2, Building, CreditCard, Wallet } from "lucide-react";
import { useSession } from "next-auth/react";

interface Props {
  plan: string;
  limits: any;
  onClose: () => void;
  onSuccess: () => void;
}

export default function UpgradeRequestModal({ plan, limits, onClose, onSuccess }: Props) {
  const { data: session } = useSession();
  const [paymentMethod, setPaymentMethod] = useState<"bank" | "paypal" | "crypto">("bank");
  const [note, setNote] = useState("");
  const [loading, setLoading] = useState(false);
  const [message, setMessage] = useState<{ type: "success" | "error"; text: string } | null>(null);

  const planLabel = plan.charAt(0).toUpperCase() + plan.slice(1);
  const price = limits.priceMonthly;

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setLoading(true);
    setMessage(null);
    try {
      const res = await fetch("/api/upgrade-requests", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          requestedPlan: plan,
          paymentMethod,
          message: note,
        }),
      });
      const data = await res.json();
      if (res.ok) {
        setMessage({ type: "success", text: "Your upgrade request has been sent. We'll contact you shortly." });
        setTimeout(() => {
          onSuccess();
          onClose();
        }, 2000);
      } else {
        setMessage({ type: "error", text: data.error || "Failed to send request." });
      }
    } catch (error) {
      setMessage({ type: "error", text: "Something went wrong." });
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-50 p-4">
      <div className="bg-white dark:bg-gray-800 rounded-xl shadow-xl max-w-md w-full p-6 relative max-h-[90vh] overflow-y-auto">
        <button
          onClick={onClose}
          className="absolute top-3 right-3 text-gray-400 hover:text-gray-600 dark:hover:text-gray-200 transition"
        >
          <X className="w-5 h-5" />
        </button>

        <h2 className="text-xl font-bold text-gray-900 dark:text-white mb-2">
          Upgrade to {planLabel}
        </h2>
        <p className="text-sm text-gray-500 dark:text-gray-400 mb-4">
          Price: <span className="font-semibold">CHF {price.toFixed(2)} / month</span>
        </p>

        <div className="bg-zrp-red/5 dark:bg-zrp-red/10 border border-zrp-red/20 dark:border-zrp-red/30 rounded-lg p-4 mb-4">
          <p className="text-sm text-zrp-red dark:text-zrp-red font-medium">Bank Transfer Instructions</p>
          <p className="text-xs text-gray-600 dark:text-gray-400 mt-1">
            Please transfer the amount to the following bank account:
          </p>
          <div className="mt-2 text-xs font-mono bg-white dark:bg-gray-700 p-2 rounded border border-zrp-red/20 dark:border-zrp-red/30">
            <p>Bank: Swissquote Bank SA</p>
            <p>Account: 1234-5678-90</p>
            <p>IBAN: CH93 1234 5678 9012 3456 7</p>
            <p>BIC: SWQBCHZZ</p>
            <p>Reference: Your email + Plan name</p>
          </div>
        </div>

        <form onSubmit={handleSubmit} className="space-y-4">
          <div>
            <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1">
              Payment Method
            </label>
            <select
              value={paymentMethod}
              onChange={(e) => setPaymentMethod(e.target.value as any)}
              className="w-full px-3 py-2 border border-gray-300 dark:border-gray-600 rounded-lg bg-white dark:bg-gray-700 text-gray-900 dark:text-white focus:ring-2 focus:ring-zrp-red focus:border-transparent"
            >
              <option value="bank">Bank Transfer</option>
              <option value="paypal">PayPal</option>
              <option value="crypto">Cryptocurrency</option>
            </select>
          </div>

          <div>
            <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1">
              Additional Note (optional)
            </label>
            <textarea
              value={note}
              onChange={(e) => setNote(e.target.value)}
              rows={3}
              placeholder="Any special requests or comments..."
              className="w-full px-3 py-2 border border-gray-300 dark:border-gray-600 rounded-lg bg-white dark:bg-gray-700 text-gray-900 dark:text-white resize-none focus:ring-2 focus:ring-zrp-red focus:border-transparent"
            />
          </div>

          {message && (
            <div className={`p-3 rounded-lg text-sm ${
              message.type === "success"
                ? "bg-green-50 text-green-700 border border-green-200 dark:bg-green-900/20 dark:text-green-400"
                : "bg-red-50 text-red-700 border border-red-200 dark:bg-red-900/20 dark:text-red-400"
            }`}>
              {message.text}
            </div>
          )}

          <div className="flex justify-end gap-2">
            <button
              type="button"
              onClick={onClose}
              className="px-4 py-2 border border-gray-300 dark:border-gray-600 rounded-lg hover:bg-gray-50 dark:hover:bg-gray-700 transition"
            >
              Cancel
            </button>
            <button
              type="submit"
              disabled={loading}
              className="px-4 py-2 bg-zrp-red text-white rounded-lg font-medium hover:bg-zrp-darkRed disabled:opacity-50 transition flex items-center gap-2"
            >
              {loading && <Loader2 className="w-4 h-4 animate-spin" />}
              {loading ? "Sending..." : "Submit Request"}
            </button>
          </div>
        </form>

        <p className="text-xs text-gray-400 dark:text-gray-500 mt-4 text-center">
          Your request will be reviewed by our team. We'll contact you via email within 24 hours.
        </p>
      </div>
    </div>
  );
}
