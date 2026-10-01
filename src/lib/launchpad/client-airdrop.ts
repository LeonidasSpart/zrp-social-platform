"use client";

/*
 * Browser-side, client-signed airdrop execution - same non-custodial
 * pattern as client-token-mint.ts/client-swap.ts: the connected wallet
 * builds, signs, and broadcasts each batch itself. ZRP never holds the
 * tokens being distributed or a private key; the server only
 * independently re-verifies what the chain shows afterward (see
 * airdrop-service.ts's verifyAirdropBatchTransaction) before recording
 * anything.
 */

import { Connection, PublicKey } from "@solana/web3.js";
import { connectInjectedWallet } from "./injected-wallet";
import { buildAirdropBatchTransaction, type AirdropRecipientInput } from "./airdrop-service";

// Matches zrppad's own known-working batch size (create-ATA + transfer
// per recipient = 10 instructions at 5 recipients/batch, comfortably
// within a single transaction's size limit).
const BATCH_SIZE = 5;

/**
 * Parses a pasted or uploaded wallet list into deduplicated, genuinely
 * valid base58 Solana addresses - one per line, blank lines and
 * whitespace ignored. Fixes zrppad's own validation gap, which only
 * checked line.length === 44 (a weak heuristic - plenty of invalid
 * strings are exactly 44 characters, and some valid addresses aren't).
 * Pure and exported for unit testing.
 */
export function parseRecipientWallets(text: string): string[] {
  const seen = new Set<string>();
  const result: string[] = [];
  for (const rawLine of text.split("\n")) {
    const line = rawLine.trim();
    if (!line || seen.has(line)) continue;
    try {
      new PublicKey(line);
    } catch {
      continue;
    }
    seen.add(line);
    result.push(line);
  }
  return result;
}

export type AirdropBatchOutcome =
  | { outcome: "success"; transactionId: string; recipientWallets: string[] }
  | { outcome: "failed"; transactionId: string | null; recipientWallets: string[]; error: string }
  | { outcome: "disputed"; transactionId: string; recipientWallets: string[] };

export interface ExecuteAirdropFromBrowserParams {
  rpcUrl: string;
  mintAddress: string;
  decimals: number;
  amountPerRecipientRaw: bigint;
  recipientWallets: string[];
  onProgress?: (completed: number, total: number) => void;
}

export interface ExecuteAirdropFromBrowserResult {
  senderWalletAddress: string;
  batches: AirdropBatchOutcome[];
}

/**
 * Connects the user's injected wallet, then signs and broadcasts one
 * batch transaction at a time (each needs its own wallet approval - no
 * injected wallet supports pre-approving an arbitrary number of
 * sequential transactions in one prompt). Never throws partway through:
 * every batch's outcome (success/failed/disputed) is collected and
 * returned, so the caller can report a complete, honest result even if
 * some batches failed.
 */
export async function executeAirdropFromBrowser(params: ExecuteAirdropFromBrowserParams): Promise<ExecuteAirdropFromBrowserResult> {
  const { rpcUrl, mintAddress, decimals, amountPerRecipientRaw, recipientWallets, onProgress } = params;

  const { provider, walletAddress } = await connectInjectedWallet();
  if (typeof provider.signTransaction !== "function") {
    throw new Error("This wallet does not support signing transactions. Try Phantom, Solflare or Backpack.");
  }

  const connection = new Connection(rpcUrl, "confirmed");
  const senderPubkey = new PublicKey(walletAddress);
  const mintPubkey = new PublicKey(mintAddress);

  const batches: AirdropBatchOutcome[] = [];
  let completed = 0;

  for (let i = 0; i < recipientWallets.length; i += BATCH_SIZE) {
    const batchWallets = recipientWallets.slice(i, i + BATCH_SIZE);
    const recipients: AirdropRecipientInput[] = batchWallets.map((walletAddress) => ({ walletAddress }));

    let signature: string | undefined;
    try {
      const transaction = buildAirdropBatchTransaction({
        senderPubkey,
        mintPubkey,
        recipients,
        amountPerRecipientRaw,
        decimals,
      });

      const { blockhash, lastValidBlockHeight } = await connection.getLatestBlockhash("confirmed");
      transaction.recentBlockhash = blockhash;

      const signedTransaction = await provider.signTransaction(transaction);
      signature = await connection.sendRawTransaction(signedTransaction.serialize(), {
        skipPreflight: false,
        maxRetries: 3,
        preflightCommitment: "confirmed",
      });

      let confirmation;
      try {
        confirmation = await connection.confirmTransaction({ signature, blockhash, lastValidBlockHeight }, "confirmed");
      } catch (error: unknown) {
        // Already broadcast (we have a signature) - unknown outcome, not
        // a failure. Same rationale as AmbiguousMintError/AmbiguousSwapError.
        batches.push({ outcome: "disputed", transactionId: signature, recipientWallets: batchWallets });
        completed += batchWallets.length;
        onProgress?.(completed, recipientWallets.length);
        continue;
      }

      if (confirmation.value.err) {
        batches.push({
          outcome: "failed",
          transactionId: signature,
          recipientWallets: batchWallets,
          error: `Transaction failed on-chain: ${JSON.stringify(confirmation.value.err)}`,
        });
      } else {
        batches.push({ outcome: "success", transactionId: signature, recipientWallets: batchWallets });
      }
    } catch (error: unknown) {
      const message = error instanceof Error ? error.message : "Unknown error while sending this batch.";
      batches.push({ outcome: "failed", transactionId: signature ?? null, recipientWallets: batchWallets, error: message });
    }

    completed += batchWallets.length;
    onProgress?.(completed, recipientWallets.length);
  }

  return { senderWalletAddress: walletAddress, batches };
}
