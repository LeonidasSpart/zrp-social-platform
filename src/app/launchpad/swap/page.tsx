"use client";

import { useState } from "react";
import { ArrowDown, ExternalLink, Loader2 } from "lucide-react";
import { useLanguage } from "@/contexts/LanguageContext";
import { localizeApiMessage } from "@/lib/api-error-i18n";

interface SwapQuote {
  inputMint: string;
  outputMint: string;
  inAmountRaw: string;
  outAmountRaw: string;
  priceImpactPercent: number;
  routePlan: Array<{ label: string; percent: number }>;
}

const SOL_MINT = "So11111111111111111111111111111111111111112";
const USDC_MINT = "EPjFWdd5AufqSSqeM2qN1xzybapC8G4wEGGkZwyTDt1v";

export default function SwapAggregatorPage() {
  const { t } = useLanguage();
  const [inputMint, setInputMint] = useState(SOL_MINT);
  const [outputMint, setOutputMint] = useState(USDC_MINT);
  const [amount, setAmount] = useState("1000000000");
  const [quote, setQuote] = useState<SwapQuote | null>(null);
  const [swapLink, setSwapLink] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const handleGetQuote = async (e: React.FormEvent) => {
    e.preventDefault();
    setError(null);
    setQuote(null);
    setSwapLink(null);
    if (!inputMint.trim() || !outputMint.trim() || !amount.trim()) return;
    setLoading(true);
    try {
      const params = new URLSearchParams({ inputMint: inputMint.trim(), outputMint: outputMint.trim(), amount: amount.trim() });
      const res = await fetch(`/api/launchpad/swap/quote?${params.toString()}`);
      const data = await res.json().catch(() => null);
      if (!res.ok) throw new Error(localizeApiMessage(data?.error, t) || t("launchpad.swap.quoteFailed"));
      setQuote(data.quote);
      setSwapLink(data.swapLink);
    } catch (err: unknown) {
      setError(err instanceof Error ? err.message : t("launchpad.swap.quoteFailed"));
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="max-w-2xl mx-auto px-4 py-8">
      <h1 className="text-2xl font-extrabold font-orbitron text-gray-900 dark:text-white mb-1">{t("launchpad.swap.title")}</h1>
      <p className="text-sm text-gray-500 dark:text-gray-400 mb-6">{t("launchpad.swap.description")}</p>

      <form onSubmit={handleGetQuote} className="space-y-4">
        <div>
          <label className="mb-1 block text-sm font-medium text-gray-700 dark:text-gray-300">{t("launchpad.swap.fromLabel")}</label>
          <input
            type="text"
            value={inputMint}
            onChange={(e) => setInputMint(e.target.value)}
            disabled={loading}
            className="flex h-10 w-full rounded-md border border-gray-300 bg-white px-3 py-2 text-sm font-mono dark:border-gray-700 dark:bg-gray-800 dark:text-white"
          />
        </div>
        <div className="flex justify-center">
          <ArrowDown className="w-5 h-5 text-gray-400" />
        </div>
        <div>
          <label className="mb-1 block text-sm font-medium text-gray-700 dark:text-gray-300">{t("launchpad.swap.toLabel")}</label>
          <input
            type="text"
            value={outputMint}
            onChange={(e) => setOutputMint(e.target.value)}
            disabled={loading}
            className="flex h-10 w-full rounded-md border border-gray-300 bg-white px-3 py-2 text-sm font-mono dark:border-gray-700 dark:bg-gray-800 dark:text-white"
          />
        </div>
        <div>
          <label className="mb-1 block text-sm font-medium text-gray-700 dark:text-gray-300">{t("launchpad.swap.amountLabel")}</label>
          <input
            type="text"
            inputMode="numeric"
            value={amount}
            onChange={(e) => setAmount(e.target.value.replace(/[^\d]/g, ""))}
            disabled={loading}
            className="flex h-10 w-full rounded-md border border-gray-300 bg-white px-3 py-2 text-sm dark:border-gray-700 dark:bg-gray-800 dark:text-white"
          />
        </div>

        {error && <div className="rounded-md bg-red-50 p-3 text-sm text-red-600 dark:bg-red-950/30 dark:text-red-400">{error}</div>}

        <button
          type="submit"
          disabled={loading}
          className="w-full inline-flex items-center justify-center rounded-md bg-red-600 px-4 py-3 text-sm font-semibold text-white transition-colors hover:bg-red-700 disabled:opacity-50"
        >
          {loading ? <Loader2 className="h-4 w-4 animate-spin" /> : t("launchpad.swap.getQuoteButton")}
        </button>
      </form>

      {quote && (
        <div className="mt-6 space-y-4 rounded-xl border border-gray-200 dark:border-gray-700 p-4">
          <div className="grid grid-cols-2 gap-3">
            <div>
              <p className="text-xs text-gray-500 dark:text-gray-400">{t("launchpad.swap.youSendLabel")}</p>
              <p className="font-semibold text-gray-900 dark:text-white">{quote.inAmountRaw}</p>
            </div>
            <div>
              <p className="text-xs text-gray-500 dark:text-gray-400">{t("launchpad.swap.youReceiveLabel")}</p>
              <p className="font-semibold text-gray-900 dark:text-white">{quote.outAmountRaw}</p>
            </div>
          </div>
          <p className="text-xs text-gray-500 dark:text-gray-400">
            {t("launchpad.swap.priceImpact", { percent: quote.priceImpactPercent.toFixed(3) })}
          </p>
          {quote.routePlan.length > 0 && (
            <p className="text-xs text-gray-500 dark:text-gray-400">
              {t("launchpad.swap.routedVia", { routes: quote.routePlan.map((s) => `${s.label} (${s.percent}%)`).join(", ") })}
            </p>
          )}
          {swapLink && (
            <a
              href={swapLink}
              target="_blank"
              rel="noopener noreferrer"
              className="inline-flex items-center gap-1.5 text-sm font-semibold text-zrp-red hover:underline"
            >
              {t("launchpad.swap.tradeOnJupiter")}
              <ExternalLink className="w-3.5 h-3.5" />
            </a>
          )}
        </div>
      )}
    </div>
  );
}
