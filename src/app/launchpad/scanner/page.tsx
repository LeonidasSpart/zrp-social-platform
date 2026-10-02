"use client";

import { useState } from "react";
import { ShieldAlert, ShieldCheck, Search, Loader2 } from "lucide-react";
import { useLanguage } from "@/contexts/LanguageContext";
import { localizeApiMessage } from "@/lib/api-error-i18n";
import type { TranslationKey } from "@/lib/translations";

interface TokenScanResult {
  mintAddress: string;
  tokenProgram: "TOKEN_PROGRAM" | "TOKEN_2022_PROGRAM";
  supplyRaw: string;
  decimals: number;
  mintAuthority: string | null;
  freezeAuthority: string | null;
  metadata: { name: string; symbol: string; uri: string; updateAuthority: string; isMutable: boolean } | null;
  topHolders: Array<{ address: string; amountRaw: string; percent: number }>;
  topHolderConcentrationPercent: number;
  riskFlags: string[];
}

const RISK_LABEL_KEYS: Record<string, TranslationKey> = {
  mint_authority_active: "launchpad.scanner.riskMintAuthorityActive",
  freeze_authority_active: "launchpad.scanner.riskFreezeAuthorityActive",
  metadata_mutable: "launchpad.scanner.riskMetadataMutable",
  metadata_missing: "launchpad.scanner.riskMetadataMissing",
  high_holder_concentration: "launchpad.scanner.riskHighHolderConcentration",
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
  const { t } = useLanguage();
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
      if (!res.ok) throw new Error(localizeApiMessage(data?.error, t) || t("launchpad.scanner.scanFailed"));
      setResult(data.scan);
    } catch (err: unknown) {
      setError(err instanceof Error ? err.message : t("launchpad.scanner.scanFailed"));
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="max-w-2xl mx-auto px-4 py-8">
      <h1 className="text-2xl font-extrabold font-orbitron text-gray-900 dark:text-white mb-1">{t("launchpad.scanner.title")}</h1>
      <p className="text-sm text-gray-500 dark:text-gray-400 mb-6">{t("launchpad.scanner.description")}</p>

      <form onSubmit={handleScan} className="flex gap-2 mb-6">
        <input
          type="text"
          value={mintInput}
          onChange={(e) => setMintInput(e.target.value)}
          placeholder={t("launchpad.scanner.mintPlaceholder")}
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
                {result.metadata ? `${result.metadata.name} ($${result.metadata.symbol})` : t("launchpad.scanner.unknownToken")}
              </p>
              <p className="text-xs text-gray-500 dark:text-gray-400 font-mono break-all">{result.mintAddress}</p>
              <p className="text-xs text-gray-400 dark:text-gray-500 mt-0.5">
                {result.tokenProgram === "TOKEN_2022_PROGRAM" ? "Token-2022" : "Classic SPL Token"}
              </p>
            </div>
          </div>

          {result.riskFlags.length > 0 && (
            <div className="rounded-md border border-amber-300 bg-amber-50 p-3 dark:border-amber-800 dark:bg-amber-950/30 space-y-1">
              {result.riskFlags.map((flag) => {
                const labelKey = RISK_LABEL_KEYS[flag];
                return (
                  <p key={flag} className="text-sm text-amber-800 dark:text-amber-300">
                    &bull; {labelKey ? t(labelKey) : flag}
                  </p>
                );
              })}
            </div>
          )}

          <div className="grid grid-cols-2 gap-3">
            <div className="rounded-md border border-gray-200 dark:border-gray-700 p-3">
              <p className="text-xs text-gray-500 dark:text-gray-400">{t("launchpad.scanner.supplyLabel")}</p>
              <p className="font-semibold text-gray-900 dark:text-white">{formatSupply(result.supplyRaw, result.decimals)}</p>
            </div>
            <div className="rounded-md border border-gray-200 dark:border-gray-700 p-3">
              <p className="text-xs text-gray-500 dark:text-gray-400">{t("launchpad.scanner.decimalsLabel")}</p>
              <p className="font-semibold text-gray-900 dark:text-white">{result.decimals}</p>
            </div>
            <div className="rounded-md border border-gray-200 dark:border-gray-700 p-3">
              <p className="text-xs text-gray-500 dark:text-gray-400">{t("launchpad.scanner.mintAuthorityLabel")}</p>
              <p className="font-mono text-xs break-all text-gray-900 dark:text-white">
                {result.mintAuthority ?? t("launchpad.scanner.revoked")}
              </p>
            </div>
            <div className="rounded-md border border-gray-200 dark:border-gray-700 p-3">
              <p className="text-xs text-gray-500 dark:text-gray-400">{t("launchpad.scanner.freezeAuthorityLabel")}</p>
              <p className="font-mono text-xs break-all text-gray-900 dark:text-white">
                {result.freezeAuthority ?? t("launchpad.scanner.revoked")}
              </p>
            </div>
          </div>

          {result.topHolders.length > 0 && (
            <div>
              <h2 className="font-semibold text-gray-900 dark:text-white mb-2">{t("launchpad.scanner.topHoldersTitle")}</h2>
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
