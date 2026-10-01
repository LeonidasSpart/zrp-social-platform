"use client";

import { useState } from "react";
import { Loader2, Search } from "lucide-react";
import { connectAndSignMessage } from "@/lib/launchpad/injected-wallet";
import { useLanguage } from "@/contexts/LanguageContext";

interface StakingPositionSummary {
  id: string;
  amountRaw: string;
  rewardClaimedRaw: string;
  claimableRewardRaw: string;
  status: string;
  unlocksAt: string;
  pool: {
    id: string;
    apyBasisPoints: number;
    lockSeconds: number;
    launchedToken: { name: string; symbol: string; decimals: number; imageUrl: string };
  };
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

export default function MyStakingPositionsPage() {
  const { t } = useLanguage();
  const [walletInput, setWalletInput] = useState("");
  const [positions, setPositions] = useState<StakingPositionSummary[] | null>(null);
  const [loading, setLoading] = useState(false);
  const [busyId, setBusyId] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [resultMessage, setResultMessage] = useState<string | null>(null);

  const lookupPositions = async () => {
    if (!walletInput.trim()) return;
    setLoading(true);
    try {
      const res = await fetch(`/api/launchpad/staking/positions?walletAddress=${encodeURIComponent(walletInput.trim())}`);
      const data = await res.json().catch(() => null);
      if (!res.ok) throw new Error(data?.error || t("launchpad.stakingPositions.errorLookupFailed"));
      setPositions(data.positions || []);
    } catch (err: unknown) {
      setError(err instanceof Error ? err.message : t("launchpad.stakingPositions.errorLookupFailed"));
      setPositions(null);
    } finally {
      setLoading(false);
    }
  };

  const handleSearch = async (e: React.FormEvent) => {
    e.preventDefault();
    setError(null);
    setResultMessage(null);
    await lookupPositions();
  };

  const handleClaim = async (position: StakingPositionSummary, unstakePrincipal: boolean) => {
    setError(null);
    setResultMessage(null);
    setBusyId(position.id);
    try {
      const challengeRes = await fetch(`/api/launchpad/staking/positions/${position.id}/claim-challenge`, { method: "POST" });
      const challenge = await challengeRes.json().catch(() => null);
      if (!challengeRes.ok || typeof challenge?.message !== "string") {
        throw new Error(challenge?.error || t("launchpad.stakingPositions.errorChallengeFailed"));
      }

      const { walletAddress, signature } = await connectAndSignMessage(challenge.message);

      const claimRes = await fetch(`/api/launchpad/staking/positions/${position.id}/claim`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ walletAddress, signature, unstakePrincipal }),
      });
      const claimData = await claimRes.json().catch(() => null);
      if (!claimRes.ok) throw new Error(claimData?.error || t("launchpad.stakingPositions.errorClaimFailed"));

      if (unstakePrincipal) {
        setResultMessage(
          t("launchpad.stakingPositions.resultUnstaked", {
            principal: formatRaw(claimData.principal, position.pool.launchedToken.decimals),
            reward: formatRaw(claimData.reward, position.pool.launchedToken.decimals),
            symbol: position.pool.launchedToken.symbol,
          })
        );
      } else {
        setResultMessage(
          t("launchpad.stakingPositions.resultClaimed", {
            reward: formatRaw(claimData.reward, position.pool.launchedToken.decimals),
            symbol: position.pool.launchedToken.symbol,
          })
        );
      }
      await lookupPositions();
    } catch (err: unknown) {
      setError(err instanceof Error ? err.message : t("launchpad.stakingPositions.errorClaimFailed"));
    } finally {
      setBusyId(null);
    }
  };

  return (
    <div className="max-w-2xl mx-auto px-4 py-8">
      <h1 className="text-2xl font-extrabold font-orbitron text-gray-900 dark:text-white mb-1">{t("launchpad.stakingPositions.title")}</h1>
      <p className="text-sm text-gray-500 dark:text-gray-400 mb-6">{t("launchpad.stakingPositions.subtitle")}</p>

      <form onSubmit={handleSearch} className="flex gap-2 mb-6">
        <input
          type="text"
          value={walletInput}
          onChange={(e) => setWalletInput(e.target.value)}
          placeholder={t("launchpad.stakingPositions.walletPlaceholder")}
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
      {resultMessage && (
        <div className="mb-4 rounded-md bg-green-50 p-3 text-sm text-green-700 dark:bg-green-950/30 dark:text-green-400">{resultMessage}</div>
      )}

      {positions && (
        <div className="space-y-3">
          {positions.length === 0 ? (
            <p className="text-center py-8 text-gray-500 dark:text-gray-400">{t("launchpad.stakingPositions.empty")}</p>
          ) : (
            positions.map((p) => {
              const claimable = formatRaw(p.claimableRewardRaw, p.pool.launchedToken.decimals);
              const canClaimReward = p.claimableRewardRaw !== "0" && p.status === "ACTIVE";
              const unlocked = new Date(p.unlocksAt).getTime() <= Date.now();
              const canUnstake = p.status === "ACTIVE" && unlocked;
              return (
                <div key={p.id} className="rounded-xl border border-gray-200 dark:border-gray-700 p-4 bg-white dark:bg-gray-900">
                  <div className="flex items-center justify-between">
                    <p className="font-semibold text-gray-900 dark:text-white">
                      {p.pool.launchedToken.name} (${p.pool.launchedToken.symbol})
                    </p>
                    <span className="text-xs text-gray-500 dark:text-gray-400">
                      {p.status === "ACTIVE"
                        ? t("launchpad.stakingPositions.statusActive")
                        : t("launchpad.stakingPositions.statusUnstaked")}
                    </span>
                  </div>
                  <p className="text-sm text-gray-600 dark:text-gray-400 mt-2">
                    {t("launchpad.stakingPositions.stakedAtApy", {
                      amount: formatRaw(p.amountRaw, p.pool.launchedToken.decimals),
                      apy: (p.pool.apyBasisPoints / 100).toFixed(2),
                    })}
                  </p>
                  <p className="text-sm font-medium text-gray-900 dark:text-white mt-1">
                    {t("launchpad.stakingPositions.claimableReward", { amount: claimable, symbol: p.pool.launchedToken.symbol })}
                  </p>
                  {p.status === "ACTIVE" && !unlocked && (
                    <p className="text-xs text-gray-400 dark:text-gray-500 mt-1">
                      {t("launchpad.stakingPositions.unlocksAt", { date: new Date(p.unlocksAt).toLocaleString() })}
                    </p>
                  )}
                  {p.status === "ACTIVE" && (
                    <div className="mt-3 grid grid-cols-2 gap-2">
                      <button
                        type="button"
                        onClick={() => handleClaim(p, false)}
                        disabled={!canClaimReward || busyId === p.id}
                        className="inline-flex items-center justify-center rounded-md bg-red-600 px-4 py-2 text-sm font-semibold text-white hover:bg-red-700 disabled:opacity-50"
                      >
                        {busyId === p.id ? <Loader2 className="h-4 w-4 animate-spin" /> : t("launchpad.stakingPositions.claimRewardButton")}
                      </button>
                      <button
                        type="button"
                        onClick={() => handleClaim(p, true)}
                        disabled={!canUnstake || busyId === p.id}
                        className="inline-flex items-center justify-center rounded-md bg-gray-900 dark:bg-gray-700 px-4 py-2 text-sm font-semibold text-white hover:opacity-90 disabled:opacity-50"
                      >
                        {busyId === p.id ? (
                          <Loader2 className="h-4 w-4 animate-spin" />
                        ) : canUnstake ? (
                          t("launchpad.stakingPositions.unstakeButton")
                        ) : (
                          t("launchpad.stakingPositions.lockedButton")
                        )}
                      </button>
                    </div>
                  )}
                </div>
              );
            })
          )}
        </div>
      )}
    </div>
  );
}
