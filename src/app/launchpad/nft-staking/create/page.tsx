"use client";

import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { useSession } from "next-auth/react";
import Link from "next/link";
import { Loader2 } from "lucide-react";

interface OwnedNft {
  id: string;
  collectionName: string | null;
  creator: { id: string } | null;
}

interface OwnedToken {
  id: string;
  name: string;
  symbol: string;
  creator: { id: string } | null;
}

export default function CreateNftStakingPoolPage() {
  const { data: session, status } = useSession();
  const router = useRouter();

  const [collectionNames, setCollectionNames] = useState<string[]>([]);
  const [collectionName, setCollectionName] = useState("");
  const [ownedTokens, setOwnedTokens] = useState<OwnedToken[]>([]);
  const [rewardTokenId, setRewardTokenId] = useState("");
  const [rewardRatePerDay, setRewardRatePerDay] = useState("1");
  const [lockDays, setLockDays] = useState("0");
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (!session?.user) return;
    fetch("/api/launchpad/nfts?limit=100")
      .then((res) => res.json())
      .then((data) => {
        const mine = (data.nfts || []).filter((n: OwnedNft) => n.creator?.id === session.user.id && n.collectionName);
        const names: string[] = Array.from(new Set(mine.map((n: OwnedNft) => n.collectionName as string)));
        setCollectionNames(names);
        if (names.length > 0) setCollectionName(names[0]);
      })
      .catch(() => {});
    fetch("/api/launchpad/tokens?limit=100")
      .then((res) => res.json())
      .then((data) => {
        const mine = (data.tokens || []).filter((t: OwnedToken) => t.creator?.id === session.user.id);
        setOwnedTokens(mine);
        if (mine.length > 0) setRewardTokenId(mine[0].id);
      })
      .catch(() => {});
  }, [session]);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setError(null);

    if (!collectionName) {
      setError("Select a collection you've minted into.");
      return;
    }
    if (!rewardTokenId) {
      setError("Select a reward token you created.");
      return;
    }
    if (!/^\d+$/.test(rewardRatePerDay.trim())) {
      setError("Invalid reward rate.");
      return;
    }

    setSubmitting(true);
    try {
      const response = await fetch("/api/launchpad/nft-staking/pools", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          collectionName,
          rewardTokenId,
          rewardRatePerDay: rewardRatePerDay.trim(),
          lockDays: Number(lockDays),
        }),
      });
      const data = await response.json().catch(() => null);
      if (!response.ok) throw new Error(data?.error || "Failed to create NFT staking pool.");
      router.push(`/launchpad/nft-staking/${data.pool.id}`);
    } catch (err: unknown) {
      setError(err instanceof Error ? err.message : "Failed to create NFT staking pool.");
    } finally {
      setSubmitting(false);
    }
  };

  if (status === "loading") {
    return (
      <div className="flex justify-center py-24">
        <Loader2 className="w-8 h-8 animate-spin text-zrp-red" />
      </div>
    );
  }
  if (!session?.user) {
    return (
      <div className="max-w-md mx-auto px-4 py-16 text-center">
        <p className="text-gray-600 dark:text-gray-400">Sign in to create an NFT staking pool.</p>
      </div>
    );
  }

  return (
    <div className="max-w-2xl mx-auto px-4 py-8">
      <h1 className="text-2xl font-extrabold font-orbitron text-gray-900 dark:text-white mb-1">Create an NFT staking pool</h1>
      <p className="text-sm text-gray-500 dark:text-gray-400 mb-6">
        Anyone with a Solana wallet can stake an NFT from this collection into the pool - no ZRP account needed. You&apos;ll need to fund a
        reward reserve afterwards so real payouts are actually backed.
      </p>

      {collectionNames.length === 0 || ownedTokens.length === 0 ? (
        <p className="text-gray-500 dark:text-gray-400">
          You need at least one minted NFT (with a collection name) and one fungible token to pay rewards with.{" "}
          <Link href="/launchpad/nft/create" className="text-zrp-red hover:underline">
            Mint an NFT
          </Link>{" "}
          or{" "}
          <Link href="/launchpad/create" className="text-zrp-red hover:underline">
            create a token
          </Link>{" "}
          first.
        </p>
      ) : (
        <form onSubmit={handleSubmit} className="space-y-5">
          <div>
            <label className="mb-1 block text-sm font-medium text-gray-700 dark:text-gray-300">Collection</label>
            <select
              value={collectionName}
              onChange={(e) => setCollectionName(e.target.value)}
              disabled={submitting}
              className="flex h-10 w-full rounded-md border border-gray-300 bg-white px-3 py-2 text-sm dark:border-gray-700 dark:bg-gray-800 dark:text-white"
            >
              {collectionNames.map((name) => (
                <option key={name} value={name}>
                  {name}
                </option>
              ))}
            </select>
          </div>

          <div>
            <label className="mb-1 block text-sm font-medium text-gray-700 dark:text-gray-300">Reward token</label>
            <select
              value={rewardTokenId}
              onChange={(e) => setRewardTokenId(e.target.value)}
              disabled={submitting}
              className="flex h-10 w-full rounded-md border border-gray-300 bg-white px-3 py-2 text-sm dark:border-gray-700 dark:bg-gray-800 dark:text-white"
            >
              {ownedTokens.map((t) => (
                <option key={t.id} value={t.id}>
                  {t.name} (${t.symbol})
                </option>
              ))}
            </select>
          </div>

          <div className="grid grid-cols-2 gap-3">
            <div>
              <label className="mb-1 block text-sm font-medium text-gray-700 dark:text-gray-300">Reward per NFT / day</label>
              <input
                type="text"
                inputMode="numeric"
                value={rewardRatePerDay}
                onChange={(e) => setRewardRatePerDay(e.target.value.replace(/[^\d]/g, ""))}
                disabled={submitting}
                className="flex h-10 w-full rounded-md border border-gray-300 bg-white px-3 py-2 text-sm dark:border-gray-700 dark:bg-gray-800 dark:text-white"
              />
            </div>
            <div>
              <label className="mb-1 block text-sm font-medium text-gray-700 dark:text-gray-300">Lock (days)</label>
              <input
                type="number"
                min={0}
                value={lockDays}
                onChange={(e) => setLockDays(e.target.value)}
                disabled={submitting}
                className="flex h-10 w-full rounded-md border border-gray-300 bg-white px-3 py-2 text-sm dark:border-gray-700 dark:bg-gray-800 dark:text-white"
              />
            </div>
          </div>

          {error && <div className="rounded-md bg-red-50 p-3 text-sm text-red-600 dark:bg-red-950/30 dark:text-red-400">{error}</div>}

          <button
            type="submit"
            disabled={submitting}
            className="w-full inline-flex items-center justify-center rounded-md bg-red-600 px-4 py-3 text-sm font-semibold text-white transition-colors hover:bg-red-700 disabled:opacity-50"
          >
            {submitting ? (
              <>
                <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                Creating...
              </>
            ) : (
              "Create pool"
            )}
          </button>
        </form>
      )}
    </div>
  );
}
