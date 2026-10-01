"use client";

import { useState } from "react";
import { Loader2, Search } from "lucide-react";
import { connectAndSignMessage } from "@/lib/launchpad/injected-wallet";
import { useLanguage } from "@/contexts/LanguageContext";

interface VestingContractSummary {
  id: string;
  beneficiaryWalletAddress: string;
  totalAmount: string;
  totalReleased: string;
  status: string;
  claimableRaw: string;
  launchedToken: { name: string; symbol: string; decimals: number; imageUrl: string };
}

function formatRaw(raw: string, decimals: number): string {
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

export default function ClaimVestingPage() {
  const { t } = useLanguage();
  const [walletInput, setWalletInput] = useState("");
  const [contracts, setContracts] = useState<VestingContractSummary[] | null>(null);
  const [loading, setLoading] = useState(false);
  const [claimingId, setClaimingId] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [claimedMessage, setClaimedMessage] = useState<string | null>(null);

  const lookupContracts = async () => {
    if (!walletInput.trim()) return;
    setLoading(true);
    try {
      const res = await fetch(`/api/launchpad/vesting?beneficiaryWalletAddress=${encodeURIComponent(walletInput.trim())}`);
      const data = await res.json().catch(() => null);
      if (!res.ok) throw new Error(data?.error || t("launchpad.vestingClaim.errorLookupFailed"));
      setContracts(data.contracts || []);
    } catch (err: unknown) {
      setError(err instanceof Error ? err.message : t("launchpad.vestingClaim.errorLookupFailed"));
      setContracts(null);
    } finally {
      setLoading(false);
    }
  };

  const handleSearch = async (e: React.FormEvent) => {
    e.preventDefault();
    setError(null);
    setClaimedMessage(null);
    await lookupContracts();
  };

  const handleClaim = async (contract: VestingContractSummary) => {
    setError(null);
    setClaimedMessage(null);
    setClaimingId(contract.id);
    try {
      const challengeRes = await fetch(`/api/launchpad/vesting/${contract.id}/claim-challenge`, { method: "POST" });
      const challenge = await challengeRes.json().catch(() => null);
      if (!challengeRes.ok || typeof challenge?.message !== "string") {
        throw new Error(challenge?.error || t("launchpad.vestingClaim.errorChallengeFailed"));
      }

      const { walletAddress, signature } = await connectAndSignMessage(challenge.message);
      if (walletAddress !== contract.beneficiaryWalletAddress) {
        throw new Error(t("launchpad.vestingClaim.errorWalletMismatch"));
      }

      const claimRes = await fetch(`/api/launchpad/vesting/${contract.id}/claim`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ walletAddress, signature }),
      });
      const claimData = await claimRes.json().catch(() => null);
      if (!claimRes.ok) throw new Error(claimData?.error || t("launchpad.vestingClaim.errorClaimFailed"));

      setClaimedMessage(
        t("launchpad.vestingClaim.claimedSuccess", {
          amount: formatRaw(claimData.amount, contract.launchedToken.decimals),
          symbol: contract.launchedToken.symbol,
        })
      );
      // Refresh the list so claimable/released amounts reflect the claim.
      await lookupContracts();
    } catch (err: unknown) {
      setError(err instanceof Error ? err.message : t("launchpad.vestingClaim.errorClaimFailed"));
    } finally {
      setClaimingId(null);
    }
  };

  return (
    <div className="max-w-2xl mx-auto px-4 py-8">
      <h1 className="text-2xl font-extrabold font-orbitron text-gray-900 dark:text-white mb-1">{t("launchpad.vestingClaim.title")}</h1>
      <p className="text-sm text-gray-500 dark:text-gray-400 mb-6">{t("launchpad.vestingClaim.description")}</p>

      <form onSubmit={handleSearch} className="flex gap-2 mb-6">
        <input
          type="text"
          value={walletInput}
          onChange={(e) => setWalletInput(e.target.value)}
          placeholder={t("launchpad.vestingClaim.walletPlaceholder")}
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
      {claimedMessage && (
        <div className="mb-4 rounded-md bg-green-50 p-3 text-sm text-green-700 dark:bg-green-950/30 dark:text-green-400">{claimedMessage}</div>
      )}

      {contracts && (
        <div className="space-y-3">
          {contracts.length === 0 ? (
            <p className="text-center py-8 text-gray-500 dark:text-gray-400">{t("launchpad.vestingClaim.noContractsFound")}</p>
          ) : (
            contracts.map((c) => {
              const claimable = formatRaw(c.claimableRaw, c.launchedToken.decimals);
              const canClaim = c.claimableRaw !== "0";
              return (
                <div key={c.id} className="rounded-xl border border-gray-200 dark:border-gray-700 p-4 bg-white dark:bg-gray-900">
                  <div className="flex items-center justify-between">
                    <p className="font-semibold text-gray-900 dark:text-white">
                      {c.launchedToken.name} (${c.launchedToken.symbol})
                    </p>
                    <span className="text-xs text-gray-500 dark:text-gray-400">
                      {c.status === "COMPLETED" ? t("launchpad.vestingClaim.statusCompleted") : t("launchpad.vestingClaim.statusActive")}
                    </span>
                  </div>
                  <p className="text-sm text-gray-600 dark:text-gray-400 mt-2">
                    {t("launchpad.vestingClaim.releasedProgress", {
                      released: formatRaw(c.totalReleased, c.launchedToken.decimals),
                      total: formatRaw(c.totalAmount, c.launchedToken.decimals),
                    })}
                  </p>
                  <p className="text-sm font-medium text-gray-900 dark:text-white mt-1">
                    {t("launchpad.vestingClaim.claimableNow", { amount: claimable, symbol: c.launchedToken.symbol })}
                  </p>
                  <button
                    type="button"
                    onClick={() => handleClaim(c)}
                    disabled={!canClaim || claimingId === c.id}
                    className="mt-3 w-full inline-flex items-center justify-center rounded-md bg-red-600 px-4 py-2 text-sm font-semibold text-white hover:bg-red-700 disabled:opacity-50"
                  >
                    {claimingId === c.id ? (
                      <Loader2 className="h-4 w-4 animate-spin" />
                    ) : canClaim ? (
                      t("launchpad.vestingClaim.claimButton")
                    ) : (
                      t("launchpad.vestingClaim.nothingClaimableYet")
                    )}
                  </button>
                </div>
              );
            })
          )}
        </div>
      )}
    </div>
  );
}
