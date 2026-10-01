"use client";

import { useState } from "react";
import Image from "next/image";
import { Loader2, Search } from "lucide-react";
import { connectAndSignMessage } from "@/lib/launchpad/injected-wallet";

interface NftStakingPositionSummary {
  id: string;
  rewardClaimedRaw: string;
  claimableRewardRaw: string;
  status: string;
  unlocksAt: string;
  nft: { id: string; name: string; imageUrl: string; mintAddress: string | null; collectionName: string | null };
  pool: {
    id: string;
    lockSeconds: number;
    rewardRatePerDayRaw: string;
    rewardToken: { name: string; symbol: string; decimals: number; imageUrl: string };
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

export default function MyNftStakingPositionsPage() {
  const [walletInput, setWalletInput] = useState("");
  const [positions, setPositions] = useState<NftStakingPositionSummary[] | null>(null);
  const [loading, setLoading] = useState(false);
  const [busyId, setBusyId] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [resultMessage, setResultMessage] = useState<string | null>(null);

  const lookupPositions = async () => {
    if (!walletInput.trim()) return;
    setLoading(true);
    try {
      const res = await fetch(`/api/launchpad/nft-staking/positions?walletAddress=${encodeURIComponent(walletInput.trim())}`);
      const data = await res.json().catch(() => null);
      if (!res.ok) throw new Error(data?.error || "Failed to look up positions.");
      setPositions(data.positions || []);
    } catch (err: unknown) {
      setError(err instanceof Error ? err.message : "Failed to look up positions.");
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

  const handleClaim = async (position: NftStakingPositionSummary, unstakeNft: boolean) => {
    setError(null);
    setResultMessage(null);
    setBusyId(position.id);
    try {
      const challengeRes = await fetch(`/api/launchpad/nft-staking/positions/${position.id}/claim-challenge`, { method: "POST" });
      const challenge = await challengeRes.json().catch(() => null);
      if (!challengeRes.ok || typeof challenge?.message !== "string") {
        throw new Error(challenge?.error || "Failed to request a claim challenge.");
      }

      const { walletAddress, signature } = await connectAndSignMessage(challenge.message);

      const claimRes = await fetch(`/api/launchpad/nft-staking/positions/${position.id}/claim`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ walletAddress, signature, unstakeNft }),
      });
      const claimData = await claimRes.json().catch(() => null);
      if (!claimRes.ok) throw new Error(claimData?.error || "Claim failed.");

      if (unstakeNft) {
        setResultMessage(
          `Unstaked ${position.nft.name} + ${formatRaw(claimData.reward, position.pool.rewardToken.decimals)} ${position.pool.rewardToken.symbol} reward.`
        );
      } else {
        setResultMessage(`Claimed ${formatRaw(claimData.reward, position.pool.rewardToken.decimals)} ${position.pool.rewardToken.symbol} reward.`);
      }
      await lookupPositions();
    } catch (err: unknown) {
      setError(err instanceof Error ? err.message : "Claim failed.");
    } finally {
      setBusyId(null);
    }
  };

  return (
    <div className="max-w-2xl mx-auto px-4 py-8">
      <h1 className="text-2xl font-extrabold font-orbitron text-gray-900 dark:text-white mb-1">My NFT staking positions</h1>
      <p className="text-sm text-gray-500 dark:text-gray-400 mb-6">
        No ZRP account needed - just the wallet you staked from. You&apos;ll be asked to sign a message with your wallet extension to prove
        ownership; this never authorizes a transaction.
      </p>

      <form onSubmit={handleSearch} className="flex gap-2 mb-6">
        <input
          type="text"
          value={walletInput}
          onChange={(e) => setWalletInput(e.target.value)}
          placeholder="Your Solana wallet address"
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
            <p className="text-center py-8 text-gray-500 dark:text-gray-400">No NFT staking positions found for that wallet.</p>
          ) : (
            positions.map((p) => {
              const claimable = formatRaw(p.claimableRewardRaw, p.pool.rewardToken.decimals);
              const canClaimReward = p.claimableRewardRaw !== "0" && p.status === "ACTIVE";
              const unlocked = new Date(p.unlocksAt).getTime() <= Date.now();
              const canUnstake = p.status === "ACTIVE" && unlocked;
              return (
                <div key={p.id} className="rounded-xl border border-gray-200 dark:border-gray-700 p-4 bg-white dark:bg-gray-900">
                  <div className="flex items-center justify-between">
                    <div className="flex items-center gap-3">
                      <Image src={p.nft.imageUrl} alt={p.nft.name} width={40} height={40} className="w-10 h-10 rounded-md object-cover flex-shrink-0" unoptimized />
                      <div>
                        <p className="font-semibold text-gray-900 dark:text-white">{p.nft.name}</p>
                        {p.nft.collectionName && <p className="text-xs text-gray-500 dark:text-gray-400">{p.nft.collectionName}</p>}
                      </div>
                    </div>
                    <span className="text-xs text-gray-500 dark:text-gray-400">{p.status}</span>
                  </div>
                  <p className="text-sm font-medium text-gray-900 dark:text-white mt-3">
                    Claimable reward: {claimable} {p.pool.rewardToken.symbol}
                  </p>
                  {p.status === "ACTIVE" && !unlocked && (
                    <p className="text-xs text-gray-400 dark:text-gray-500 mt-1">Unlocks {new Date(p.unlocksAt).toLocaleString()}</p>
                  )}
                  {p.status === "ACTIVE" && (
                    <div className="mt-3 grid grid-cols-2 gap-2">
                      <button
                        type="button"
                        onClick={() => handleClaim(p, false)}
                        disabled={!canClaimReward || busyId === p.id}
                        className="inline-flex items-center justify-center rounded-md bg-red-600 px-4 py-2 text-sm font-semibold text-white hover:bg-red-700 disabled:opacity-50"
                      >
                        {busyId === p.id ? <Loader2 className="h-4 w-4 animate-spin" /> : "Claim reward"}
                      </button>
                      <button
                        type="button"
                        onClick={() => handleClaim(p, true)}
                        disabled={!canUnstake || busyId === p.id}
                        className="inline-flex items-center justify-center rounded-md bg-gray-900 dark:bg-gray-700 px-4 py-2 text-sm font-semibold text-white hover:opacity-90 disabled:opacity-50"
                      >
                        {busyId === p.id ? <Loader2 className="h-4 w-4 animate-spin" /> : canUnstake ? "Unstake NFT" : "Locked"}
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
