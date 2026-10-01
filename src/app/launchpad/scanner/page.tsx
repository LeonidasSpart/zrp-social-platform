"use client";

import { useState } from "react";
import { ShieldAlert, ShieldCheck, Search, Loader2 } from "lucide-react";

interface TokenScanResult {
  mintAddress: string;
  supplyRaw: string;
  decimals: number;
  mintAuthority: string | null;
  freezeAuthority: string | null;
  metadata: { name: string; symbol: string; uri: string; updateAuthority: string; isMutable: boolean } | null;
  topHolders: Array<{ address: string; amountRaw: string; percent: number }>;
  topHolderConcentrationPercent: number;
  riskFlags: string[];
}

const RISK_LABELS: Record<string, string> = {
  mint_authority_active: "Mint authority is still active - supply can be inflated at any time",
  freeze_authority_active: "Freeze authority is still active - token accounts can be frozen",
  metadata_mutable: "Metadata is mutable - name/image can be changed after launch",
  metadata_missing: "No on-chain metadata found for this mint",
  high_holder_concentration: "A single wallet holds a large share of supply",
};

function formatSupply(raw: string, decimals: number): string {
  try {
    const value = BigInt(raw);
    if (decimals === 0) return value.toLocaleString();
    let divisor = BigInt(1);
    for (let i = 0; i < decimals; i += 1) divisor *= BigInt(10);
    return (value / divisor).toLocaleString();
  } catch {
    return raw;
  }
}

export default function TokenScannerPage() {
  const [mintInput, setMintInput] = useState("");
  const [result, setResult] = useState<TokenScanResult | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const handleScan = async (e: React.FormEvent) => {
    e.preventDefault();
    setError(null);
    setResult(null);
    if (!mintInput.trim()) return;
    setLoading(true);
    try {
      const res = await fetch(`/api/launchpad/scanner/${mintInput.trim()}`);
      const data = await res.json().catch(() => null);
      if (!res.ok) throw new Error(data?.error || "Failed to scan this token.");
      setResult(data.scan);
    } catch (err: unknown) {
      setError(err instanceof Error ? err.message : "Failed to scan this token.");
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="max-w-2xl mx-auto px-4 py-8">
      <h1 className="text-2xl font-extrabold font-orbitron text-gray-900 dark:text-white mb-1">Token scanner</h1>
      <p className="text-sm text-gray-500 dark:text-gray-400 mb-6">
        Check any Solana SPL token&apos;s mint/freeze authorities, metadata, and holder concentration directly on-chain. Read-only -
        nothing here moves funds or requires a wallet.
      </p>

      <form onSubmit={handleScan} className="flex gap-2 mb-6">
        <input
          type="text"
          value={mintInput}
          onChange={(e) => setMintInput(e.target.value)}
          placeholder="Token mint address"
          className="flex-1 h-10 rounded-md border border-gray-300 bg-white px-3 py-2 text-sm font-mono dark:border-gray-700 dark:bg-gray-800 dark:text-white"
        />
        <button
          type="submit"
          disabled={loading}
          className="inline-flex items-center justify-center rounded-md bg-red-600 px-4 text-sm font-semibold text-white hover:bg-red-700 disabled:opacity-50"
        >
          {loading ? <Loader2 className="h-4 w-4 animate-spin" /> : <Search className="h-4 w-4" />}
        </button>
      </form>

      {error && <div className="mb-4 rounded-md bg-red-50 p-3 text-sm text-red-600 dark:bg-red-950/30 dark:text-red-400">{error}</div>}

      {result && (
        <div className="space-y-6">
          <div className="flex items-center gap-3">
            {result.riskFlags.length === 0 ? (
              <ShieldCheck className="w-8 h-8 text-green-600 dark:text-green-400 flex-shrink-0" />
            ) : (
              <ShieldAlert className="w-8 h-8 text-amber-500 flex-shrink-0" />
            )}
            <div>
              <p className="font-semibold text-gray-900 dark:text-white">
                {result.metadata ? `${result.metadata.name} ($${result.metadata.symbol})` : "Unknown token"}
              </p>
              <p className="text-xs text-gray-500 dark:text-gray-400 font-mono break-all">{result.mintAddress}</p>
            </div>
          </div>

          {result.riskFlags.length > 0 && (
            <div className="rounded-md border border-amber-300 bg-amber-50 p-3 dark:border-amber-800 dark:bg-amber-950/30 space-y-1">
              {result.riskFlags.map((flag) => (
                <p key={flag} className="text-sm text-amber-800 dark:text-amber-300">
                  &bull; {RISK_LABELS[flag] ?? flag}
                </p>
              ))}
            </div>
          )}

          <div className="grid grid-cols-2 gap-3">
            <div className="rounded-md border border-gray-200 dark:border-gray-700 p-3">
              <p className="text-xs text-gray-500 dark:text-gray-400">Supply</p>
              <p className="font-semibold text-gray-900 dark:text-white">{formatSupply(result.supplyRaw, result.decimals)}</p>
            </div>
            <div className="rounded-md border border-gray-200 dark:border-gray-700 p-3">
              <p className="text-xs text-gray-500 dark:text-gray-400">Decimals</p>
              <p className="font-semibold text-gray-900 dark:text-white">{result.decimals}</p>
            </div>
            <div className="rounded-md border border-gray-200 dark:border-gray-700 p-3">
              <p className="text-xs text-gray-500 dark:text-gray-400">Mint authority</p>
              <p className="font-mono text-xs break-all text-gray-900 dark:text-white">{result.mintAuthority ?? "Revoked"}</p>
            </div>
            <div className="rounded-md border border-gray-200 dark:border-gray-700 p-3">
              <p className="text-xs text-gray-500 dark:text-gray-400">Freeze authority</p>
              <p className="font-mono text-xs break-all text-gray-900 dark:text-white">{result.freezeAuthority ?? "Revoked"}</p>
            </div>
          </div>

          {result.topHolders.length > 0 && (
            <div>
              <h2 className="font-semibold text-gray-900 dark:text-white mb-2">Top holders</h2>
              <div className="space-y-1">
                {result.topHolders.map((holder) => (
                  <div key={holder.address} className="flex items-center justify-between text-sm">
                    <span className="font-mono text-xs text-gray-600 dark:text-gray-400 truncate">
                      {holder.address.slice(0, 6)}...{holder.address.slice(-4)}
                    </span>
                    <span className="text-gray-900 dark:text-white font-medium">{holder.percent.toFixed(2)}%</span>
                  </div>
                ))}
              </div>
            </div>
          )}
        </div>
      )}
    </div>
  );
}
