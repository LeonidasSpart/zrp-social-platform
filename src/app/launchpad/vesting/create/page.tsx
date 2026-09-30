"use client";

import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { useSession } from "next-auth/react";
import Link from "next/link";
import { Loader2, Copy, Check } from "lucide-react";

interface OwnedToken {
  id: string;
  name: string;
  symbol: string;
  mintAddress: string;
  decimals: number;
  creator: { id: string } | null;
}

export default function CreateVestingPage() {
  const { data: session, status } = useSession();
  const router = useRouter();
  const platformWallet = process.env.NEXT_PUBLIC_PLATFORM_WALLET || "";

  const [ownedTokens, setOwnedTokens] = useState<OwnedToken[]>([]);
  const [launchedTokenId, setLaunchedTokenId] = useState("");
  const [beneficiaryWalletAddress, setBeneficiaryWalletAddress] = useState("");
  const [amount, setAmount] = useState("");
  const [cliffDays, setCliffDays] = useState("0");
  const [vestingDays, setVestingDays] = useState("365");
  const [depositTransactionId, setDepositTransactionId] = useState("");
  const [copied, setCopied] = useState(false);
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

  const handleCopyAddress = async () => {
    if (!platformWallet) return;
    try {
      await navigator.clipboard.writeText(platformWallet);
      setCopied(true);
      setTimeout(() => setCopied(false), 2000);
    } catch {
      // Clipboard access can fail silently - the address is still visible.
    }
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setError(null);

    if (!launchedTokenId) {
      setError("Select a token you created.");
      return;
    }
    if (!beneficiaryWalletAddress.trim()) {
      setError("A beneficiary wallet address is required.");
      return;
    }
    if (!/^[1-9]\d*$/.test(amount.trim())) {
      setError("Amount must be a positive whole number of tokens.");
      return;
    }
    const cliffSeconds = Math.round(Number(cliffDays) * 86400);
    const vestingSeconds = Math.round(Number(vestingDays) * 86400);
    if (!Number.isFinite(cliffSeconds) || cliffSeconds < 0) {
      setError("Invalid cliff duration.");
      return;
    }
    if (!Number.isFinite(vestingSeconds) || vestingSeconds < 0) {
      setError("Invalid vesting duration.");
      return;
    }
    if (!depositTransactionId.trim()) {
      setError("Paste the transaction ID for the token deposit.");
      return;
    }

    setSubmitting(true);
    try {
      const response = await fetch("/api/launchpad/vesting", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          launchedTokenId,
          beneficiaryWalletAddress: beneficiaryWalletAddress.trim(),
          amount: amount.trim(),
          cliffSeconds,
          vestingSeconds,
          depositTransactionId: depositTransactionId.trim(),
        }),
      });
      const data = await response.json().catch(() => null);
      if (!response.ok) {
        throw new Error(data?.error || "Failed to create vesting contract.");
      }
      router.push(`/launchpad/vesting`);
    } catch (err: unknown) {
      setError(err instanceof Error ? err.message : "Failed to create vesting contract.");
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
        <p className="text-gray-600 dark:text-gray-400">Sign in to create a vesting contract.</p>
      </div>
    );
  }

  const selectedToken = ownedTokens.find((t) => t.id === launchedTokenId);

  return (
    <div className="max-w-2xl mx-auto px-4 py-8">
      <h1 className="text-2xl font-extrabold font-orbitron text-gray-900 dark:text-white mb-1">Create a vesting contract</h1>
      <p className="text-sm text-gray-500 dark:text-gray-400 mb-6">
        Locks tokens you created into a linear release schedule for a beneficiary wallet - team, advisor or investor. The beneficiary claims
        released tokens themselves later; they don&apos;t need a ZRP account.
      </p>

      {ownedTokens.length === 0 ? (
        <p className="text-gray-500 dark:text-gray-400">
          You haven&apos;t created any tokens yet. <Link href="/launchpad/create" className="text-zrp-red hover:underline">Create one first.</Link>
        </p>
      ) : (
        <form onSubmit={handleSubmit} className="space-y-5">
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

          <div>
            <label className="mb-1 block text-sm font-medium text-gray-700 dark:text-gray-300">Beneficiary wallet address</label>
            <input
              type="text"
              value={beneficiaryWalletAddress}
              onChange={(e) => setBeneficiaryWalletAddress(e.target.value)}
              disabled={submitting}
              placeholder="Solana wallet address"
              className="flex h-10 w-full rounded-md border border-gray-300 bg-white px-3 py-2 text-sm font-mono dark:border-gray-700 dark:bg-gray-800 dark:text-white"
            />
          </div>

          <div>
            <label className="mb-1 block text-sm font-medium text-gray-700 dark:text-gray-300">Amount (whole tokens)</label>
            <input
              type="text"
              inputMode="numeric"
              value={amount}
              onChange={(e) => setAmount(e.target.value.replace(/[^\d]/g, ""))}
              disabled={submitting}
              className="flex h-10 w-full rounded-md border border-gray-300 bg-white px-3 py-2 text-sm dark:border-gray-700 dark:bg-gray-800 dark:text-white"
            />
          </div>

          <div className="grid grid-cols-2 gap-3">
            <div>
              <label className="mb-1 block text-sm font-medium text-gray-700 dark:text-gray-300">Cliff (days)</label>
              <input
                type="number"
                min={0}
                value={cliffDays}
                onChange={(e) => setCliffDays(e.target.value)}
                disabled={submitting}
                className="flex h-10 w-full rounded-md border border-gray-300 bg-white px-3 py-2 text-sm dark:border-gray-700 dark:bg-gray-800 dark:text-white"
              />
            </div>
            <div>
              <label className="mb-1 block text-sm font-medium text-gray-700 dark:text-gray-300">Vesting duration (days)</label>
              <input
                type="number"
                min={0}
                value={vestingDays}
                onChange={(e) => setVestingDays(e.target.value)}
                disabled={submitting}
                className="flex h-10 w-full rounded-md border border-gray-300 bg-white px-3 py-2 text-sm dark:border-gray-700 dark:bg-gray-800 dark:text-white"
              />
            </div>
          </div>
          <p className="text-xs text-gray-400 dark:text-gray-500 -mt-3">
            Linear release over the vesting duration, starting after the cliff. Set vesting duration to 0 for a pure cliff (fully unlocked the
            instant the cliff passes).
          </p>

          <div className="rounded-md border border-gray-200 dark:border-gray-700 p-3 space-y-3">
            <p className="text-sm font-medium text-gray-700 dark:text-gray-300">Deposit the tokens to vest</p>
            {platformWallet ? (
              <>
                <div>
                  <label className="mb-1 block text-xs text-gray-500 dark:text-gray-400">
                    1. Send {amount || "the"} {selectedToken?.symbol || "tokens"} to
                  </label>
                  <div className="flex items-center gap-2 rounded-md border border-gray-300 bg-gray-50 px-3 py-2 dark:border-gray-700 dark:bg-gray-800">
                    <span className="flex-1 truncate font-mono text-xs text-gray-700 dark:text-gray-300">{platformWallet}</span>
                    <button type="button" onClick={handleCopyAddress} className="flex-shrink-0 text-gray-500 hover:text-zrp-red transition">
                      {copied ? <Check className="h-4 w-4 text-green-500" /> : <Copy className="h-4 w-4" />}
                    </button>
                  </div>
                </div>
                <div>
                  <label className="mb-1 block text-xs text-gray-500 dark:text-gray-400">2. Paste the transaction ID</label>
                  <input
                    type="text"
                    value={depositTransactionId}
                    onChange={(e) => setDepositTransactionId(e.target.value)}
                    disabled={submitting}
                    className="flex h-10 w-full rounded-md border border-gray-300 bg-white px-3 py-2 text-sm font-mono dark:border-gray-700 dark:bg-gray-800 dark:text-white"
                  />
                </div>
              </>
            ) : (
              <p className="text-sm text-gray-500 dark:text-gray-400">Deposits are temporarily unavailable.</p>
            )}
          </div>

          {error && <div className="rounded-md bg-red-50 p-3 text-sm text-red-600 dark:bg-red-950/30 dark:text-red-400">{error}</div>}

          <button
            type="submit"
            disabled={submitting || !platformWallet}
            className="w-full inline-flex items-center justify-center rounded-md bg-red-600 px-4 py-3 text-sm font-semibold text-white transition-colors hover:bg-red-700 disabled:opacity-50 disabled:pointer-events-none"
          >
            {submitting ? (
              <>
                <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                Creating...
              </>
            ) : (
              "Create vesting contract"
            )}
          </button>
        </form>
      )}
    </div>
  );
}
