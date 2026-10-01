"use client";

import { useState } from "react";
import { ArrowDown, ExternalLink, Loader2, CheckCircle2, AlertTriangle } from "lucide-react";
import { executeSwapFromBrowser, AmbiguousSwapError } from "@/lib/launchpad/client-swap";

interface SwapQuote {
  inputMint: string;
  outputMint: string;
  inAmountRaw: string;
  outAmountRaw: string;
  priceImpactPercent: number;
  routePlan: Array<{ label: string; percent: number }>;
  raw: unknown;
}

const SOL_MINT = "So11111111111111111111111111111111111111112";
const USDC_MINT = "EPjFWdd5AufqSSqeM2qN1xzybapC8G4wEGGkZwyTDt1v";

export default function SwapAggregatorPage() {
  const [inputMint, setInputMint] = useState(SOL_MINT);
  const [outputMint, setOutputMint] = useState(USDC_MINT);
  const [amount, setAmount] = useState("1000000000");
  const [quote, setQuote] = useState<SwapQuote | null>(null);
  const [swapLink, setSwapLink] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [swapping, setSwapping] = useState(false);
  const [swapSignature, setSwapSignature] = useState<string | null>(null);
  const [ambiguousSignature, setAmbiguousSignature] = useState<string | null>(null);

  const rpcUrl = process.env.NEXT_PUBLIC_SOLANA_RPC_URL || "";

  const handleGetQuote = async (e: React.FormEvent) => {
    e.preventDefault();
    setError(null);
    setQuote(null);
    setSwapLink(null);
    setSwapSignature(null);
    setAmbiguousSignature(null);
    if (!inputMint.trim() || !outputMint.trim() || !amount.trim()) return;
    setLoading(true);
    try {
      const params = new URLSearchParams({ inputMint: inputMint.trim(), outputMint: outputMint.trim(), amount: amount.trim() });
      const res = await fetch(`/api/launchpad/swap/quote?${params.toString()}`);
      const data = await res.json().catch(() => null);
      if (!res.ok) throw new Error(data?.error || "Failed to fetch a quote.");
      setQuote(data.quote);
      setSwapLink(data.swapLink);
    } catch (err: unknown) {
      setError(err instanceof Error ? err.message : "Failed to fetch a quote.");
    } finally {
      setLoading(false);
    }
  };

  const handleSwap = async () => {
    if (!quote || !rpcUrl) return;
    setError(null);
    setSwapping(true);
    try {
      const result = await executeSwapFromBrowser({ rpcUrl, quoteResponse: quote.raw });
      setSwapSignature(result.signature);
    } catch (err: unknown) {
      if (err instanceof AmbiguousSwapError) {
        setAmbiguousSignature(err.signature);
      } else {
        setError(err instanceof Error ? err.message : "Failed to execute the swap.");
      }
    } finally {
      setSwapping(false);
    }
  };

  return (
    <div className="max-w-2xl mx-auto px-4 py-8">
      <h1 className="text-2xl font-extrabold font-orbitron text-gray-900 dark:text-white mb-1">Swap aggregator</h1>
      <p className="text-sm text-gray-500 dark:text-gray-400 mb-6">
        Best-price quote across Solana DEXs, powered by Jupiter. Swap directly with your connected wallet - ZRP never holds your
        funds, a key, or even a signed copy of the transaction; it only relays the quote and the unsigned transaction between your
        wallet and Jupiter.
      </p>

      <form onSubmit={handleGetQuote} className="space-y-4">
        <div>
          <label className="mb-1 block text-sm font-medium text-gray-700 dark:text-gray-300">From (mint address)</label>
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
          <label className="mb-1 block text-sm font-medium text-gray-700 dark:text-gray-300">To (mint address)</label>
          <input
            type="text"
            value={outputMint}
            onChange={(e) => setOutputMint(e.target.value)}
            disabled={loading}
            className="flex h-10 w-full rounded-md border border-gray-300 bg-white px-3 py-2 text-sm font-mono dark:border-gray-700 dark:bg-gray-800 dark:text-white"
          />
        </div>
        <div>
          <label className="mb-1 block text-sm font-medium text-gray-700 dark:text-gray-300">Amount (raw base units)</label>
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
          {loading ? <Loader2 className="h-4 w-4 animate-spin" /> : "Get quote"}
        </button>
      </form>

      {quote && (
        <div className="mt-6 space-y-4 rounded-xl border border-gray-200 dark:border-gray-700 p-4">
          <div className="grid grid-cols-2 gap-3">
            <div>
              <p className="text-xs text-gray-500 dark:text-gray-400">You send</p>
              <p className="font-semibold text-gray-900 dark:text-white">{quote.inAmountRaw}</p>
            </div>
            <div>
              <p className="text-xs text-gray-500 dark:text-gray-400">You receive (estimated)</p>
              <p className="font-semibold text-gray-900 dark:text-white">{quote.outAmountRaw}</p>
            </div>
          </div>
          <p className="text-xs text-gray-500 dark:text-gray-400">Price impact: {quote.priceImpactPercent.toFixed(3)}%</p>
          {quote.routePlan.length > 0 && (
            <p className="text-xs text-gray-500 dark:text-gray-400">
              Routed via {quote.routePlan.map((s) => `${s.label} (${s.percent}%)`).join(", ")}
            </p>
          )}
          {ambiguousSignature ? (
            <div className="flex items-start gap-2 rounded-md bg-amber-50 p-3 text-sm text-amber-800 dark:bg-amber-950/30 dark:text-amber-300">
              <AlertTriangle className="mt-0.5 h-4 w-4 shrink-0" />
              <div>
                <p className="font-medium">This swap&apos;s outcome couldn&apos;t be confirmed.</p>
                <p className="mt-1">
                  It may have already gone through - do not retry. Check it yourself before doing anything else:
                </p>
                <a
                  href={`https://solscan.io/tx/${ambiguousSignature}`}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="mt-1 inline-flex items-center gap-1 font-mono text-xs font-semibold underline"
                >
                  {ambiguousSignature}
                  <ExternalLink className="h-3 w-3" />
                </a>
              </div>
            </div>
          ) : swapSignature ? (
            <div className="flex items-start gap-2 rounded-md bg-green-50 p-3 text-sm text-green-800 dark:bg-green-950/30 dark:text-green-300">
              <CheckCircle2 className="mt-0.5 h-4 w-4 shrink-0" />
              <div>
                <p className="font-medium">Swap confirmed.</p>
                <a
                  href={`https://solscan.io/tx/${swapSignature}`}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="mt-1 inline-flex items-center gap-1 font-mono text-xs font-semibold underline"
                >
                  {swapSignature}
                  <ExternalLink className="h-3 w-3" />
                </a>
              </div>
            </div>
          ) : (
            <div className="space-y-2">
              <button
                type="button"
                onClick={handleSwap}
                disabled={swapping || !rpcUrl}
                className="w-full inline-flex items-center justify-center gap-2 rounded-md bg-zrp-red px-4 py-3 text-sm font-semibold text-white transition-colors hover:opacity-90 disabled:opacity-50"
              >
                {swapping ? <Loader2 className="h-4 w-4 animate-spin" /> : "Swap now (sign with wallet)"}
              </button>
              {swapLink && (
                <a
                  href={swapLink}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="inline-flex items-center gap-1.5 text-sm font-semibold text-zrp-red hover:underline"
                >
                  Or trade on Jupiter&apos;s app instead
                  <ExternalLink className="w-3.5 h-3.5" />
                </a>
              )}
            </div>
          )}
        </div>
      )}
    </div>
  );
}
