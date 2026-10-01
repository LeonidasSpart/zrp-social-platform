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

export default function CreateIdoCampaignPage() {
  const { data: session, status } = useSession();
  const router = useRouter();

  const [ownedTokens, setOwnedTokens] = useState<OwnedToken[]>([]);
  const [launchedTokenId, setLaunchedTokenId] = useState("");
  const [title, setTitle] = useState("");
  const [description, setDescription] = useState("");
  const [tokenPriceUsdc, setTokenPriceUsdc] = useState("0.05");
  const [softCapUsdc, setSoftCapUsdc] = useState("10000");
  const [hardCapUsdc, setHardCapUsdc] = useState("50000");
  const [requiresWhitelist, setRequiresWhitelist] = useState(true);
  const [participationInstructions, setParticipationInstructions] = useState("");
  const [saleStartsAt, setSaleStartsAt] = useState("");
  const [saleDurationDays, setSaleDurationDays] = useState("7");
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
    if (!title.trim() || title.trim().length > 120) {
      setError("Title is required (max 120 characters).");
      return;
    }
    if (!description.trim()) {
      setError("Description is required.");
      return;
    }
    if (!participationInstructions.trim()) {
      setError("Explain how an approved participant actually takes part (off-platform).");
      return;
    }
    if (!saleStartsAt) {
      setError("Sale start date/time is required.");
      return;
    }
    const price = Number(tokenPriceUsdc);
    const softCap = Number(softCapUsdc);
    const hardCap = Number(hardCapUsdc);
    if (!Number.isFinite(price) || price <= 0) {
      setError("Invalid token price.");
      return;
    }
    if (!Number.isFinite(hardCap) || hardCap < softCap) {
      setError("Hard cap must be at least the soft cap.");
      return;
    }

    setSubmitting(true);
    try {
      const response = await fetch("/api/launchpad/ido", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          launchedTokenId,
          title: title.trim(),
          description: description.trim(),
          tokenPriceUsdc,
          softCapUsdc,
          hardCapUsdc,
          requiresWhitelist,
          participationInstructions: participationInstructions.trim(),
          saleStartsAt: new Date(saleStartsAt).toISOString(),
          saleDurationDays: Number(saleDurationDays),
        }),
      });
      const data = await response.json().catch(() => null);
      if (!response.ok) throw new Error(data?.error || "Failed to create IDO campaign.");
      router.push(`/launchpad/ido/${data.campaign.id}`);
    } catch (err: unknown) {
      setError(err instanceof Error ? err.message : "Failed to create IDO campaign.");
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
        <p className="text-gray-600 dark:text-gray-400">Sign in to open an IDO campaign.</p>
      </div>
    );
  }

  return (
    <div className="max-w-2xl mx-auto px-4 py-8">
      <h1 className="text-2xl font-extrabold font-orbitron text-gray-900 dark:text-white mb-1">Open an IDO campaign</h1>
      <div className="mb-6 rounded-md border border-amber-300 bg-amber-50 p-3 text-sm text-amber-800 dark:border-amber-800 dark:bg-amber-950/30 dark:text-amber-300">
        ZRP never pools, holds, or distributes contribution funds. This only publishes campaign terms and manages a whitelist - how
        approved participants actually contribute is entirely up to you, described in your own participation instructions below.
      </div>

      <form onSubmit={handleSubmit} className="space-y-5">
        {ownedTokens.length === 0 ? (
          <p className="text-sm text-gray-500 dark:text-gray-400">
            You need a token you created to run a sale for. Create one on the Launchpad first.
          </p>
        ) : (
          <div>
            <label className="mb-1 block text-sm font-medium text-gray-700 dark:text-gray-300">Token</label>
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
          <label className="mb-1 block text-sm font-medium text-gray-700 dark:text-gray-300">Campaign title</label>
          <input
            type="text"
            value={title}
            onChange={(e) => setTitle(e.target.value)}
            maxLength={120}
            disabled={submitting}
            className="flex h-10 w-full rounded-md border border-gray-300 bg-white px-3 py-2 text-sm dark:border-gray-700 dark:bg-gray-800 dark:text-white"
          />
        </div>

        <div>
          <label className="mb-1 block text-sm font-medium text-gray-700 dark:text-gray-300">Description</label>
          <textarea
            value={description}
            onChange={(e) => setDescription(e.target.value)}
            maxLength={5000}
            rows={4}
            disabled={submitting}
            className="flex w-full rounded-md border border-gray-300 bg-white px-3 py-2 text-sm dark:border-gray-700 dark:bg-gray-800 dark:text-white"
          />
        </div>

        <div className="grid grid-cols-3 gap-3">
          <div>
            <label className="mb-1 block text-sm font-medium text-gray-700 dark:text-gray-300">Price (USDC)</label>
            <input
              type="number"
              min={0}
              step="0.000001"
              value={tokenPriceUsdc}
              onChange={(e) => setTokenPriceUsdc(e.target.value)}
              disabled={submitting}
              className="flex h-10 w-full rounded-md border border-gray-300 bg-white px-3 py-2 text-sm dark:border-gray-700 dark:bg-gray-800 dark:text-white"
            />
          </div>
          <div>
            <label className="mb-1 block text-sm font-medium text-gray-700 dark:text-gray-300">Soft cap (USDC)</label>
            <input
              type="number"
              min={0}
              step="0.01"
              value={softCapUsdc}
              onChange={(e) => setSoftCapUsdc(e.target.value)}
              disabled={submitting}
              className="flex h-10 w-full rounded-md border border-gray-300 bg-white px-3 py-2 text-sm dark:border-gray-700 dark:bg-gray-800 dark:text-white"
            />
          </div>
          <div>
            <label className="mb-1 block text-sm font-medium text-gray-700 dark:text-gray-300">Hard cap (USDC)</label>
            <input
              type="number"
              min={0}
              step="0.01"
              value={hardCapUsdc}
              onChange={(e) => setHardCapUsdc(e.target.value)}
              disabled={submitting}
              className="flex h-10 w-full rounded-md border border-gray-300 bg-white px-3 py-2 text-sm dark:border-gray-700 dark:bg-gray-800 dark:text-white"
            />
          </div>
        </div>

        <div className="grid grid-cols-2 gap-3">
          <div>
            <label className="mb-1 block text-sm font-medium text-gray-700 dark:text-gray-300">Sale starts</label>
            <input
              type="datetime-local"
              value={saleStartsAt}
              onChange={(e) => setSaleStartsAt(e.target.value)}
              disabled={submitting}
              className="flex h-10 w-full rounded-md border border-gray-300 bg-white px-3 py-2 text-sm dark:border-gray-700 dark:bg-gray-800 dark:text-white"
            />
          </div>
          <div>
            <label className="mb-1 block text-sm font-medium text-gray-700 dark:text-gray-300">Duration (days)</label>
            <input
              type="number"
              min={0.05}
              step="0.5"
              value={saleDurationDays}
              onChange={(e) => setSaleDurationDays(e.target.value)}
              disabled={submitting}
              className="flex h-10 w-full rounded-md border border-gray-300 bg-white px-3 py-2 text-sm dark:border-gray-700 dark:bg-gray-800 dark:text-white"
            />
          </div>
        </div>

        <label className="flex items-center gap-2 text-sm text-gray-700 dark:text-gray-300">
          <input
            type="checkbox"
            checked={requiresWhitelist}
            onChange={(e) => setRequiresWhitelist(e.target.checked)}
            disabled={submitting}
          />
          Require whitelist approval before participation
        </label>

        <div>
          <label className="mb-1 block text-sm font-medium text-gray-700 dark:text-gray-300">Participation instructions</label>
          <p className="mb-1 text-xs text-gray-500 dark:text-gray-400">
            Shown to approved participants - how do they actually contribute? (e.g. an external contract address, a form, a wallet to
            send to directly). ZRP never executes this step.
          </p>
          <textarea
            value={participationInstructions}
            onChange={(e) => setParticipationInstructions(e.target.value)}
            maxLength={5000}
            rows={5}
            disabled={submitting}
            className="flex w-full rounded-md border border-gray-300 bg-white px-3 py-2 text-sm dark:border-gray-700 dark:bg-gray-800 dark:text-white"
          />
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
            "Open campaign"
          )}
        </button>
      </form>
    </div>
  );
}
