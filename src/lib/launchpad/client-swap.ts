"use client";

/*
 * Browser-side, client-signed swap execution - same non-custodial
 * pattern as client-token-mint.ts's mintTokenFromBrowser(), applied to
 * Jupiter's aggregated swap instead of token creation. Jupiter builds
 * the entire VersionedTransaction server-side (via our /api/launchpad/swap
 * proxy) with the connected wallet as fee payer and sole signer; this
 * module only has that same wallet sign and broadcast it. ZRP never
 * holds the user's funds, a private key, or even a signed copy of the
 * transaction - identical custody posture to the atomic mint flow.
 */

import { Connection, VersionedTransaction } from "@solana/web3.js";
import { connectInjectedWallet } from "./injected-wallet";

// Phantom/Solflare/Backpack's real injected signTransaction accepts and
// returns a VersionedTransaction too - the same method the shared
// InjectedSolanaProvider interface declares for the legacy Transaction
// type used by token creation, just invoked with a wider input here.
type VersionedSignTransaction = (transaction: VersionedTransaction) => Promise<VersionedTransaction>;

/**
 * Thrown specifically when the swap transaction was broadcast
 * (sendRawTransaction returned a signature) but its on-chain outcome
 * could not be confirmed - e.g. an RPC timeout. The swap may have
 * genuinely succeeded; the caller must not tell the user it failed or
 * invite a blind retry that could swap twice.
 */
export class AmbiguousSwapError extends Error {
  signature: string;

  constructor(message: string, signature: string) {
    super(message);
    this.name = "AmbiguousSwapError";
    this.signature = signature;
  }
}

export interface ExecuteSwapFromBrowserParams {
  rpcUrl: string;
  // The opaque SwapQuote.raw blob from a prior quote call.
  quoteResponse: unknown;
}

export interface ExecuteSwapFromBrowserResult {
  signature: string;
  walletAddress: string;
}

/**
 * Connects the user's injected wallet, asks the server to build the
 * swap transaction via Jupiter (fee payer = this wallet), has the
 * wallet sign it, then broadcasts + confirms it directly against
 * Solana. Throws on any failure - never returns a partial/fabricated
 * result.
 */
export async function executeSwapFromBrowser(params: ExecuteSwapFromBrowserParams): Promise<ExecuteSwapFromBrowserResult> {
  const { provider, walletAddress } = await connectInjectedWallet();
  if (typeof provider.signTransaction !== "function") {
    throw new Error("This wallet does not support signing transactions. Try Phantom, Solflare or Backpack.");
  }

  const res = await fetch("/api/launchpad/swap", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ quoteResponse: params.quoteResponse, userPublicKey: walletAddress }),
  });
  const data = await res.json().catch(() => null);
  if (!res.ok) {
    throw new Error(data?.error || "Failed to build the swap transaction.");
  }

  const transaction = VersionedTransaction.deserialize(Buffer.from(data.swapTransactionBase64, "base64"));
  const blockhash = transaction.message.recentBlockhash;

  const signTransaction = provider.signTransaction as unknown as VersionedSignTransaction;
  const signedTransaction = await signTransaction(transaction);

  const connection = new Connection(params.rpcUrl, "confirmed");
  const signature = await connection.sendRawTransaction(signedTransaction.serialize(), {
    skipPreflight: false,
    maxRetries: 3,
    preflightCommitment: "confirmed",
  });

  let confirmation;
  try {
    confirmation = await connection.confirmTransaction(
      { signature, blockhash, lastValidBlockHeight: data.lastValidBlockHeight },
      "confirmed"
    );
  } catch (error: unknown) {
    // Already broadcast (we have a signature) - an error here (e.g. an
    // RPC timeout) means the outcome is unknown, not "failed". See
    // AmbiguousMintError in client-token-mint.ts for the identical
    // rationale: throwing a generic failure would risk a blind retry
    // that swaps a second time for one that may have already landed.
    const message = error instanceof Error ? error.message : "Could not confirm the swap transaction.";
    throw new AmbiguousSwapError(message, signature);
  }
  if (confirmation.value.err) {
    // A definite on-chain failure - the transaction landed and failed
    // atomically, so nothing moved. Safe to report as a normal failure.
    throw new Error(`Swap failed on-chain: ${JSON.stringify(confirmation.value.err)}`);
  }

  return { signature, walletAddress };
}
