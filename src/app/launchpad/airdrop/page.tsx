"use client";

import { useEffect, useState } from "react";
import { useSession } from "next-auth/react";
import { ExternalLink, Loader2, CheckCircle2, XCircle, AlertTriangle, Upload } from "lucide-react";
import { executeAirdropFromBrowser, parseRecipientWallets, type AirdropBatchOutcome } from "@/lib/launchpad/client-airdrop";

// Server-enforced bound lives in src/app/api/launchpad/airdrop/route.ts -
// keep these in sync.
const MAX_RECIPIENTS = 100;

interface OwnedToken {
  id: string;
  name: string;
  symbol: string;
  mintAddress: string | null;
  decimals: number;
  creator: { id: string } | null;
}

export default function AirdropPage() {
  const { data: session } = useSession();

  const [ownedTokens, setOwnedTokens] = useState<OwnedToken[]>([]);
  const [launchedTokenId, setLaunchedTokenId] = useState("");
  const [amount, setAmount] = useState("");
  const [walletListText, setWalletListText] = useState("");

  const [executing, setExecuting] = useState(false);
  const [recording, setRecording] = useState(false);
  const [progress, setProgress] = useState({ completed: 0, total: 0 });
  const [batches, setBatches] = useState<AirdropBatchOutcome[] | null>(null);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (!session?.user) return;
    fetch("/api/launchpad/tokens?limit=100")
      .then((res) => res.json())
      .then((data) => {
        const mine = (data.tokens || []).filter((t: OwnedToken) => t.creator?.id === session.user.id && t.mintAddress);
        setOwnedTokens(mine);
        if (mine.length > 0) setLaunchedTokenId(mine[0].id);
      })
      .catch(() => {});
  }, [session]);

  const selectedToken = ownedTokens.find((t) => t.id === launchedTokenId) || null;
  const recipients = parseRecipientWallets(walletListText);
  const amountNum = Number(amount);
  const totalAmount = recipients.length > 0 && amountNum > 0 ? amountNum * recipients.length : 0;

  const handleFileUpload = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;
    const reader = new FileReader();
    reader.onload = (event) => setWalletListText((event.target?.result as string) || "");
    reader.readAsText(file);
  };

  const handleSend = async () => {
    setError(null);
    setBatches(null);

    if (!selectedToken?.mintAddress) {
      setError("Select a token you created.");
      return;
    }
    // Whole tokens only, same as the create-token page's supply field -
    // avoids float math on raw base units entirely (see CLAUDE.md's "never
    // use floating-point token arithmetic"), rather than trying to parse a
    // fractional amount precisely for an arbitrary number of decimals.
    const amountStr = amount.trim();
    if (!/^\d+$/.test(amountStr) || amountStr === "0") {
      setError("Enter a whole number amount per wallet.");
      return;
    }
    if (recipients.length === 0) {
      setError("Enter at least one valid wallet address.");
      return;
    }
    if (recipients.length > MAX_RECIPIENTS) {
      setError(`Too many recipients. Maximum allowed is ${MAX_RECIPIENTS}. You entered ${recipients.length}.`);
      return;
    }

    const rpcUrl = process.env.NEXT_PUBLIC_SOLANA_RPC_URL || "";
    if (!rpcUrl) {
      setError("Solana RPC is not configured.");
      return;
    }

    let decimalMultiplier = BigInt(1);
    for (let i = 0; i < selectedToken.decimals; i += 1) decimalMultiplier *= BigInt(10);
    const amountPerRecipientRaw = BigInt(amountStr) * decimalMultiplier;

    setExecuting(true);
    setProgress({ completed: 0, total: recipients.length });
    try {
      const result = await executeAirdropFromBrowser({
        rpcUrl,
        mintAddress: selectedToken.mintAddress,
        decimals: selectedToken.decimals,
        amountPerRecipientRaw,
        recipientWallets: recipients,
        onProgress: (completed, total) => setProgress({ completed, total }),
      });
      setBatches(result.batches);
      setExecuting(false);

      setRecording(true);
      try {
        const res = await fetch("/api/launchpad/airdrop", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            launchedTokenId: selectedToken.id,
            senderWalletAddress: result.senderWalletAddress,
            amountPerRecipientRaw: amountPerRecipientRaw.toString(),
            batches: result.batches.map((b) => ({
              outcome: b.outcome,
              transactionId: "transactionId" in b ? b.transactionId : null,
              recipientWallets: b.recipientWallets,
            })),
          }),
        });
        const data = await res.json().catch(() => null);
        if (!res.ok) {
          setError(data?.error || "The airdrop ran, but recording its history failed. Your results below still reflect what happened on-chain.");
        }
      } finally {
        setRecording(false);
      }
    } catch (err: unknown) {
      setExecuting(false);
      setError(err instanceof Error ? err.message : "Failed to execute the airdrop.");
    }
  };

  const successCount = batches?.filter((b) => b.outcome === "success").reduce((n, b) => n + b.recipientWallets.length, 0) ?? 0;
  const failedCount = batches?.filter((b) => b.outcome === "failed").reduce((n, b) => n + b.recipientWallets.length, 0) ?? 0;
  const disputedCount = batches?.filter((b) => b.outcome === "disputed").reduce((n, b) => n + b.recipientWallets.length, 0) ?? 0;

  if (!session?.user) {
    return (
      <div className="max-w-md mx-auto px-4 py-16 text-center text-gray-600 dark:text-gray-400">
        Sign in to airdrop a token you created.
      </div>
    );
  }

  return (
    <div className="max-w-2xl mx-auto px-4 py-8">
      <h1 className="text-2xl font-extrabold font-orbitron text-gray-900 dark:text-white mb-1">Airdrop</h1>
      <p className="text-sm text-gray-500 dark:text-gray-400 mb-6">
        Distribute a token you created to up to {MAX_RECIPIENTS} wallets at once, directly from your connected wallet. ZRP never
        holds the tokens being sent - each batch is signed by you and independently verified on-chain before it's recorded.
      </p>

      {ownedTokens.length === 0 ? (
        <p className="text-sm text-gray-500 dark:text-gray-400">You haven&apos;t launched a token yet.</p>
      ) : (
        <div className="space-y-4">
          <div>
            <label className="mb-1 block text-sm font-medium text-gray-700 dark:text-gray-300">Token</label>
            <select
              value={launchedTokenId}
              onChange={(e) => setLaunchedTokenId(e.target.value)}
              disabled={executing || recording}
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
            <label className="mb-1 block text-sm font-medium text-gray-700 dark:text-gray-300">Amount per wallet</label>
            <input
              type="text"
              inputMode="numeric"
              value={amount}
              onChange={(e) => setAmount(e.target.value.replace(/[^\d]/g, ""))}
              disabled={executing || recording}
              placeholder="e.g. 1000"
              className="flex h-10 w-full rounded-md border border-gray-300 bg-white px-3 py-2 text-sm dark:border-gray-700 dark:bg-gray-800 dark:text-white"
            />
          </div>

          <div>
            <div className="flex items-center justify-between mb-1">
              <label className="text-sm font-medium text-gray-700 dark:text-gray-300">Wallet addresses (max {MAX_RECIPIENTS})</label>
              <label className="cursor-pointer inline-flex items-center gap-1 text-xs font-medium text-zrp-red hover:underline">
                <Upload className="h-3.5 w-3.5" />
                Upload file
                <input type="file" accept=".csv,.txt" onChange={handleFileUpload} className="hidden" disabled={executing || recording} />
              </label>
            </div>
            <textarea
              value={walletListText}
              onChange={(e) => setWalletListText(e.target.value)}
              rows={6}
              disabled={executing || recording}
              placeholder="One wallet address per line"
              className="w-full rounded-md border border-gray-300 bg-white px-3 py-2 text-sm font-mono dark:border-gray-700 dark:bg-gray-800 dark:text-white"
            />
            <p className="mt-1 text-xs text-gray-500 dark:text-gray-400">{recipients.length} valid wallet(s) detected</p>
          </div>

          {recipients.length > 0 && amountNum > 0 && (
            <div className="rounded-md border border-gray-200 dark:border-gray-700 p-3 grid grid-cols-3 gap-2 text-sm">
              <div>
                <p className="text-xs text-gray-500 dark:text-gray-400">Recipients</p>
                <p className="font-semibold text-gray-900 dark:text-white">{recipients.length}</p>
              </div>
              <div>
                <p className="text-xs text-gray-500 dark:text-gray-400">Per wallet</p>
                <p className="font-semibold text-gray-900 dark:text-white">{amount}</p>
              </div>
              <div>
                <p className="text-xs text-gray-500 dark:text-gray-400">Total</p>
                <p className="font-semibold text-gray-900 dark:text-white">{totalAmount.toLocaleString()}</p>
              </div>
            </div>
          )}

          {executing && (
            <div className="space-y-1">
              <div className="flex justify-between text-xs text-gray-500 dark:text-gray-400">
                <span>Sending...</span>
                <span>
                  {progress.completed} / {progress.total}
                </span>
              </div>
              <div className="w-full h-2 rounded-full bg-gray-200 dark:bg-gray-700 overflow-hidden">
                <div
                  className="h-2 bg-zrp-red rounded-full transition-all"
                  style={{ width: `${progress.total > 0 ? (progress.completed / progress.total) * 100 : 0}%` }}
                />
              </div>
            </div>
          )}

          {error && <div className="rounded-md bg-red-50 p-3 text-sm text-red-600 dark:bg-red-950/30 dark:text-red-400">{error}</div>}

          {!batches && (
            <button
              type="button"
              onClick={handleSend}
              disabled={executing || recording || recipients.length === 0 || !amountNum || recipients.length > MAX_RECIPIENTS}
              className="w-full inline-flex items-center justify-center gap-2 rounded-md bg-zrp-red px-4 py-3 text-sm font-semibold text-white transition-colors hover:opacity-90 disabled:opacity-50"
            >
              {executing ? <Loader2 className="h-4 w-4 animate-spin" /> : recording ? "Recording..." : "Send airdrop"}
            </button>
          )}

          {batches && (
            <div className="space-y-3">
              <div className="rounded-md border border-gray-200 dark:border-gray-700 p-3 flex items-center justify-between text-sm">
                <span className="flex items-center gap-1.5 text-green-600 dark:text-green-400">
                  <CheckCircle2 className="h-4 w-4" /> {successCount} succeeded
                </span>
                {failedCount > 0 && (
                  <span className="flex items-center gap-1.5 text-red-600 dark:text-red-400">
                    <XCircle className="h-4 w-4" /> {failedCount} failed
                  </span>
                )}
                {disputedCount > 0 && (
                  <span className="flex items-center gap-1.5 text-amber-600 dark:text-amber-400">
                    <AlertTriangle className="h-4 w-4" /> {disputedCount} unconfirmed
                  </span>
                )}
              </div>

              {disputedCount > 0 && (
                <div className="rounded-md bg-amber-50 p-3 text-xs text-amber-800 dark:bg-amber-950/30 dark:text-amber-300">
                  Some batches couldn&apos;t be confirmed and may have actually gone through. Check their transactions below before
                  sending to those wallets again.
                </div>
              )}

              <div className="max-h-64 overflow-y-auto rounded-md border border-gray-200 dark:border-gray-700 divide-y divide-gray-100 dark:divide-gray-800">
                {batches.map((batch, i) => (
                  <div key={i} className="px-3 py-2 text-xs">
                    <div className="flex items-center justify-between">
                      <span className="font-medium text-gray-700 dark:text-gray-300">
                        Batch {i + 1} ({batch.recipientWallets.length} wallet{batch.recipientWallets.length > 1 ? "s" : ""})
                      </span>
                      <span
                        className={
                          batch.outcome === "success"
                            ? "text-green-600 dark:text-green-400"
                            : batch.outcome === "disputed"
                              ? "text-amber-600 dark:text-amber-400"
                              : "text-red-600 dark:text-red-400"
                        }
                      >
                        {batch.outcome}
                      </span>
                    </div>
                    {"transactionId" in batch && batch.transactionId && (
                      <a
                        href={`https://solscan.io/tx/${batch.transactionId}`}
                        target="_blank"
                        rel="noopener noreferrer"
                        className="mt-0.5 inline-flex items-center gap-1 font-mono text-[10px] text-gray-500 hover:underline dark:text-gray-400"
                      >
                        {batch.transactionId}
                        <ExternalLink className="h-2.5 w-2.5" />
                      </a>
                    )}
                  </div>
                ))}
              </div>

              <button
                type="button"
                onClick={() => {
                  setBatches(null);
                  setError(null);
                  setWalletListText("");
                }}
                className="w-full rounded-md border border-gray-300 px-4 py-2 text-sm font-semibold text-gray-700 hover:bg-gray-50 dark:border-gray-700 dark:text-gray-300 dark:hover:bg-gray-800"
              >
                Start a new airdrop
              </button>
            </div>
          )}
        </div>
      )}
    </div>
  );
}
