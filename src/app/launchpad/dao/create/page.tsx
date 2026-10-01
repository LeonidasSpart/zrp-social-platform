"use client";

import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { useSession } from "next-auth/react";
import { Loader2 } from "lucide-react";

interface OwnedToken {
  id: string;
  name: string;
  symbol: string;
  creator: { id: string } | null;
}

export default function CreateDaoPage() {
  const { data: session, status } = useSession();
  const router = useRouter();

  const [ownedTokens, setOwnedTokens] = useState<OwnedToken[]>([]);
  const [launchedTokenId, setLaunchedTokenId] = useState("");
  const [name, setName] = useState("");
  const [description, setDescription] = useState("");
  const [quorum, setQuorum] = useState("1000");
  const [proposalThreshold, setProposalThreshold] = useState("100");
  const [votingPeriodDays, setVotingPeriodDays] = useState("3");
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (!session?.user) return;
    fetch("/api/launchpad/tokens?limit=100")
      .then((res) => res.json())
      .then((data) => {
        const mine = (data.tokens || []).filter((t: OwnedToken) => t.creator?.id === session.user.id);
        setOwnedTokens(mine);
        if (mine.length > 0) setLaunchedTokenId(mine[0].id);
      })
      .catch(() => {});
  }, [session]);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setError(null);

    if (!launchedTokenId) {
      setError("Select a token you created.");
      return;
    }
    if (!name.trim() || name.trim().length > 60) {
      setError("DAO name is required (max 60 characters).");
      return;
    }
    if (!/^\d+$/.test(quorum.trim())) {
      setError("Invalid quorum.");
      return;
    }
    if (!/^\d+$/.test(proposalThreshold.trim())) {
      setError("Invalid proposal threshold.");
      return;
    }

    setSubmitting(true);
    try {
      const response = await fetch("/api/launchpad/dao", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          launchedTokenId,
          name: name.trim(),
          description: description.trim() || undefined,
          quorum: quorum.trim(),
          proposalThreshold: proposalThreshold.trim(),
          votingPeriodDays: Number(votingPeriodDays),
        }),
      });
      const data = await response.json().catch(() => null);
      if (!response.ok) throw new Error(data?.error || "Failed to create DAO.");
      router.push(`/launchpad/dao/${data.dao.id}`);
    } catch (err: unknown) {
      setError(err instanceof Error ? err.message : "Failed to create DAO.");
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
        <p className="text-gray-600 dark:text-gray-400">Sign in to start a DAO.</p>
      </div>
    );
  }

  return (
    <div className="max-w-2xl mx-auto px-4 py-8">
      <h1 className="text-2xl font-extrabold font-orbitron text-gray-900 dark:text-white mb-1">Start a DAO</h1>
      <p className="text-sm text-gray-500 dark:text-gray-400 mb-6">
        Only the creator of a token can set up its DAO. Voting is token-weighted and fully wallet-native - voters never need a ZRP
        account. There is no treasury: a passed proposal is a signal your team acts on manually.
      </p>

      <form onSubmit={handleSubmit} className="space-y-5">
        {ownedTokens.length === 0 ? (
          <p className="text-sm text-gray-500 dark:text-gray-400">
            You need a token you created to govern. Create one on the Launchpad first.
          </p>
        ) : (
          <div>
            <label className="mb-1 block text-sm font-medium text-gray-700 dark:text-gray-300">Governance token</label>
            <select
              value={launchedTokenId}
              onChange={(e) => setLaunchedTokenId(e.target.value)}
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
        )}

        <div>
          <label className="mb-1 block text-sm font-medium text-gray-700 dark:text-gray-300">DAO name</label>
          <input
            type="text"
            value={name}
            onChange={(e) => setName(e.target.value)}
            maxLength={60}
            disabled={submitting}
            className="flex h-10 w-full rounded-md border border-gray-300 bg-white px-3 py-2 text-sm dark:border-gray-700 dark:bg-gray-800 dark:text-white"
          />
        </div>

        <div>
          <label className="mb-1 block text-sm font-medium text-gray-700 dark:text-gray-300">Description (optional)</label>
          <textarea
            value={description}
            onChange={(e) => setDescription(e.target.value)}
            maxLength={2000}
            rows={3}
            disabled={submitting}
            className="flex w-full rounded-md border border-gray-300 bg-white px-3 py-2 text-sm dark:border-gray-700 dark:bg-gray-800 dark:text-white"
          />
        </div>

        <div className="grid grid-cols-3 gap-3">
          <div>
            <label className="mb-1 block text-sm font-medium text-gray-700 dark:text-gray-300">Quorum (tokens)</label>
            <input
              type="text"
              inputMode="numeric"
              value={quorum}
              onChange={(e) => setQuorum(e.target.value.replace(/[^\d]/g, ""))}
              disabled={submitting}
              className="flex h-10 w-full rounded-md border border-gray-300 bg-white px-3 py-2 text-sm dark:border-gray-700 dark:bg-gray-800 dark:text-white"
            />
          </div>
          <div>
            <label className="mb-1 block text-sm font-medium text-gray-700 dark:text-gray-300">Proposal threshold</label>
            <input
              type="text"
              inputMode="numeric"
              value={proposalThreshold}
              onChange={(e) => setProposalThreshold(e.target.value.replace(/[^\d]/g, ""))}
              disabled={submitting}
              className="flex h-10 w-full rounded-md border border-gray-300 bg-white px-3 py-2 text-sm dark:border-gray-700 dark:bg-gray-800 dark:text-white"
            />
          </div>
          <div>
            <label className="mb-1 block text-sm font-medium text-gray-700 dark:text-gray-300">Voting period (days)</label>
            <input
              type="number"
              min={0.05}
              step="0.5"
              value={votingPeriodDays}
              onChange={(e) => setVotingPeriodDays(e.target.value)}
              disabled={submitting}
              className="flex h-10 w-full rounded-md border border-gray-300 bg-white px-3 py-2 text-sm dark:border-gray-700 dark:bg-gray-800 dark:text-white"
            />
          </div>
        </div>

        {error && <div className="rounded-md bg-red-50 p-3 text-sm text-red-600 dark:bg-red-950/30 dark:text-red-400">{error}</div>}

        <button
          type="submit"
          disabled={submitting || ownedTokens.length === 0}
          className="w-full inline-flex items-center justify-center rounded-md bg-red-600 px-4 py-3 text-sm font-semibold text-white transition-colors hover:bg-red-700 disabled:opacity-50"
        >
          {submitting ? (
            <>
              <Loader2 className="mr-2 h-4 w-4 animate-spin" />
              Creating...
            </>
          ) : (
            "Start DAO"
          )}
        </button>
      </form>
    </div>
  );
}
