import { Prisma } from "@prisma/client";
import { prisma } from "@/lib/db";
import { acquireLock } from "@/lib/distributed-lock";
import { getConnection, getPlatformWalletPublicKey, getUsdcMint } from "@/lib/solana";
import { getAssociatedTokenAddress } from "@solana/spl-token";

/*
 * ============================================================
 * Crash-safe withdrawal processing
 * ============================================================
 *
 * The withdrawal approval flow moves real USDC on-chain. Before this
 * module existed, the approve route did three things in sequence with
 * no durable checkpoint between them: (1) claim PENDING -> PROCESSING,
 * (2) call sendUsdc() - which submits AND waits for on-chain
 * confirmation - and (3) in a single follow-up transaction, record the
 * signature, mark COMPLETED, and credit totalWithdrawn. If the process
 * was killed (SIGTERM during a deploy, a crash) between (2) succeeding
 * and (3) committing, real funds had already left the platform wallet
 * but nothing anywhere recorded that fact: the request stayed
 * PROCESSING forever, with no transactionHash and no way to tell "this
 * already paid out" from "this never started" apart from checking
 * Solana by hand.
 *
 * The fix splits (2) and (3) into a durable checkpoint plus an
 * idempotent finalize step, and adds a reconciliation job that can
 * complete (or safely fail) any withdrawal a crash caught mid-flight,
 * without ever double-paying:
 *
 *   1. claim PENDING -> PROCESSING                    (existing, atomic)
 *   2. sendUsdc()  ->  signature                       (on-chain, existing)
 *   3. recordTransactionHash(id, signature)             NEW - a single-
 *      column write, retried a few times, done as fast as possible so
 *      the "funds sent, nothing recorded" window is as small as this
 *      process can make it.
 *   4. finalizeWithdrawal(id, signature)                NEW - idempotent:
 *      guarded by `status: PROCESSING AND transactionHash: signature`,
 *      so calling it twice (the live request, then later a
 *      reconciliation pass) only ever credits totalWithdrawn once.
 *
 * If the process dies between 3 and 4, the row is left PROCESSING with
 * a transactionHash already recorded - reconcileStuckWithdrawals() (run
 * periodically, see src/lib/withdrawals-reconcile-runner.ts) finds it,
 * asks Solana directly whether that signature actually landed, and
 * either finalizes it (the same idempotent function) or fails+refunds
 * it (also idempotent, guarded by status).
 *
 * If the process dies between 2 and 3 - genuinely no signature was ever
 * recorded - reconciliation falls back to a best-effort scan of the
 * platform wallet's own recent outgoing USDC transfers for one that
 * matches this withdrawal's exact recipient and amount, timestamped
 * after it was claimed. See findMatchingOutgoingTransfer()'s own
 * comment for the precision/limits of that heuristic.
 */

/** How long a PROCESSING withdrawal must sit with NO transactionHash before
 * reconciliation will even attempt the wallet-history heuristic. Must
 * comfortably exceed how long a normal, still-in-flight sendUsdc() call
 * can take (RPC round trip + on-chain confirmation), so reconciliation
 * never races a request that is simply still running. */
export const NO_HASH_RECONCILE_AFTER_MS = 3 * 60 * 1000;

/** How far back reconciliation will search the platform wallet's own
 * transfer history for a match when no transactionHash was recorded. */
const WALLET_HISTORY_SCAN_LIMIT = 50;

const WITHDRAWAL_RECONCILE_LOCK_KEY = "withdrawals:reconcile:lock";
const WITHDRAWAL_RECONCILE_LOCK_TTL_SECONDS = 5 * 60;

/**
 * Persists the on-chain transaction signature as its own minimal write,
 * the instant it's known - deliberately BEFORE any other bookkeeping,
 * so a crash immediately after this line still leaves a durable trail
 * pointing at exactly which on-chain transaction this withdrawal
 * produced. Retried a few times with a short backoff: this is the
 * single most important write in the whole flow (it's what makes crash
 * recovery possible at all), so it is worth a few extra attempts rather
 * than giving up on the first transient DB error.
 */
export async function recordTransactionHash(
  withdrawalId: string,
  signature: string,
  attempts = 3
): Promise<void> {
  let lastError: unknown;
  for (let attempt = 1; attempt <= attempts; attempt += 1) {
    try {
      await prisma.withdrawalRequest.update({
        where: { id: withdrawalId },
        data: { transactionHash: signature },
      });
      return;
    } catch (error) {
      lastError = error;
      if (attempt < attempts) {
        await new Promise((resolve) => setTimeout(resolve, 200 * attempt));
      }
    }
  }
  // Every retry failed. Funds have already moved on-chain and we cannot
  // even record the signature - this is the one truly unrecoverable-by-
  // this-process case. Log as loudly as possible; the wallet-history
  // heuristic in reconcileWithdrawal() is the only remaining path back
  // to a consistent state, since it does not depend on this write having
  // succeeded.
  console.error(
    `CRITICAL: withdrawal ${withdrawalId} sent on-chain (signature ${signature}) but failed to persist the transaction hash after ${attempts} attempts. Funds have moved. Reconciliation must recover this from wallet history.`,
    lastError
  );
}

/**
 * Idempotently marks a withdrawal COMPLETED and credits totalWithdrawn.
 * Safe to call more than once for the same (id, signature) pair - only
 * the FIRST call whose row is still `PROCESSING` with a matching
 * `transactionHash` does anything; every later call sees a row that's
 * already `COMPLETED` and does nothing. This is what lets the live
 * approve request and a later reconciliation pass both attempt this
 * without ever double-crediting a creator's balance.
 */
export async function finalizeWithdrawal(withdrawalId: string, signature: string): Promise<boolean> {
  return prisma.$transaction(async (tx) => {
    const claimed = await tx.withdrawalRequest.updateMany({
      where: { id: withdrawalId, status: "PROCESSING", transactionHash: signature },
      data: { status: "COMPLETED", processedAt: new Date() },
    });
    if (claimed.count === 0) return false;

    const withdrawal = await tx.withdrawalRequest.findUniqueOrThrow({ where: { id: withdrawalId } });
    await tx.creatorProfile.update({
      where: { id: withdrawal.creatorProfileId },
      data: { totalWithdrawn: { increment: withdrawal.amount } },
    });
    return true;
  });
}

/**
 * Idempotently marks a withdrawal FAILED and refunds the reserved
 * amount back to the creator's balance. Safe to call more than once:
 * only the first call whose row is still `PROCESSING` does anything -
 * guarded the same way as finalizeWithdrawal(), so a live request's own
 * catch block and a later reconciliation pass can never both refund the
 * same withdrawal.
 */
export async function failAndRefundWithdrawal(withdrawalId: string, reason: string): Promise<boolean> {
  return prisma.$transaction(async (tx) => {
    const claimed = await tx.withdrawalRequest.updateMany({
      where: { id: withdrawalId, status: "PROCESSING" },
      data: { status: "FAILED" },
    });
    if (claimed.count === 0) return false;

    const withdrawal = await tx.withdrawalRequest.findUniqueOrThrow({ where: { id: withdrawalId } });
    await tx.creatorProfile.update({
      where: { id: withdrawal.creatorProfileId },
      data: { balance: { increment: withdrawal.amount } },
    });
    console.error(`Withdrawal ${withdrawalId} failed and was refunded: ${reason}`);
    return true;
  });
}

type OnChainOutcome = "success" | "failed" | "not_found";

/** Asks Solana directly whether a given signature landed, and whether it
 * succeeded. `not_found` covers both "never broadcast" and "dropped
 * before confirmation" - callers should only treat that as final after
 * NO_HASH_RECONCILE_AFTER_MS-scale patience, since a very recently
 * submitted transaction can be briefly unconfirmed rather than absent. */
async function getOnChainOutcome(signature: string): Promise<OnChainOutcome> {
  const connection = getConnection();
  const tx = await connection.getTransaction(signature, {
    commitment: "confirmed",
    maxSupportedTransactionVersion: 0,
  });
  if (!tx) return "not_found";
  return tx.meta?.err ? "failed" : "success";
}

/**
 * Best-effort recovery for the one case a durable transactionHash can't
 * help with: the process died between sendUsdc() actually submitting a
 * transfer and this code getting the chance to call
 * recordTransactionHash() at all - so NOTHING was ever written down
 * about which (if any) on-chain transaction resulted.
 *
 * Scans the platform wallet's own recent outgoing USDC transfers for
 * one that matches this withdrawal's exact recipient and amount, dated
 * after the withdrawal was created. This is a heuristic, not a durable
 * reference - it can only be run long after the fact (see
 * NO_HASH_RECONCILE_AFTER_MS) and its precision depends on no two
 * withdrawals to the same wallet for the same amount overlapping in
 * time, which is why it is a last resort behind the transactionHash
 * path, not the primary mechanism. Returns the matching signature, or
 * null if nothing in the scanned window matches.
 */
async function findMatchingOutgoingTransfer(
  recipientAddress: string,
  amount: Prisma.Decimal,
  sinceMs: number
): Promise<string | null> {
  const connection = getConnection();
  const usdcMint = getUsdcMint();
  const platformPubkey = getPlatformWalletPublicKey();
  const platformAta = await getAssociatedTokenAddress(usdcMint, platformPubkey);

  const signatures = await connection.getSignaturesForAddress(platformAta, {
    limit: WALLET_HISTORY_SCAN_LIMIT,
  });

  const targetAmount = amount.toNumber();

  for (const sigInfo of signatures) {
    if (sigInfo.err) continue;
    if ((sigInfo.blockTime ?? 0) * 1000 < sinceMs) continue;

    const tx = await connection.getTransaction(sigInfo.signature, {
      commitment: "confirmed",
      maxSupportedTransactionVersion: 0,
    });
    if (!tx || tx.meta?.err) continue;

    const pre = tx.meta?.preTokenBalances ?? [];
    const post = tx.meta?.postTokenBalances ?? [];

    for (const p of post) {
      if (p.mint !== usdcMint.toBase58()) continue;
      const owner = (p as { owner?: string }).owner;
      if (owner !== recipientAddress) continue;

      const before = pre.find((b) => b.accountIndex === p.accountIndex && b.mint === usdcMint.toBase58());
      const beforeAmt = before?.uiTokenAmount.uiAmount ?? 0;
      const afterAmt = p.uiTokenAmount.uiAmount ?? 0;
      const received = afterAmt - beforeAmt;

      if (Math.abs(received - targetAmount) < 1e-6) {
        return sigInfo.signature;
      }
    }
  }

  return null;
}

export type ReconcileOutcome =
  | "already_resolved"
  | "finalized"
  | "failed_and_refunded"
  | "still_pending"
  | "no_action_needed";

/**
 * Reconciles a single PROCESSING withdrawal row against reality. Safe
 * to call redundantly (from the live approve request AND a periodic
 * reconciliation pass, or twice in the same pass) - every write it can
 * reach is one of the idempotent functions above.
 */
export async function reconcileWithdrawal(withdrawal: {
  id: string;
  status: string;
  transactionHash: string | null;
  walletAddress: string;
  amount: Prisma.Decimal;
  updatedAt: Date;
}): Promise<ReconcileOutcome> {
  if (withdrawal.status !== "PROCESSING") return "already_resolved";

  if (withdrawal.transactionHash) {
    const outcome = await getOnChainOutcome(withdrawal.transactionHash);
    if (outcome === "success") {
      const did = await finalizeWithdrawal(withdrawal.id, withdrawal.transactionHash);
      return did ? "finalized" : "already_resolved";
    }
    if (outcome === "failed") {
      const did = await failAndRefundWithdrawal(
        withdrawal.id,
        `on-chain transaction ${withdrawal.transactionHash} failed`
      );
      return did ? "failed_and_refunded" : "already_resolved";
    }
    // not_found: either still propagating, or the blockhash expired
    // before it landed. Only treat as final once it's been long enough
    // that a real confirmation would have shown up by now.
    if (Date.now() - withdrawal.updatedAt.getTime() < NO_HASH_RECONCILE_AFTER_MS) {
      return "still_pending";
    }
    const did = await failAndRefundWithdrawal(
      withdrawal.id,
      `transaction ${withdrawal.transactionHash} not found on-chain after waiting - treating as dropped`
    );
    return did ? "failed_and_refunded" : "already_resolved";
  }

  // No transactionHash at all: only act once we're confident this isn't
  // simply a request that's still legitimately in flight.
  if (Date.now() - withdrawal.updatedAt.getTime() < NO_HASH_RECONCILE_AFTER_MS) {
    return "still_pending";
  }

  const sinceMs = withdrawal.updatedAt.getTime();
  const matched = await findMatchingOutgoingTransfer(withdrawal.walletAddress, withdrawal.amount, sinceMs);
  if (matched) {
    await recordTransactionHash(withdrawal.id, matched);
    const did = await finalizeWithdrawal(withdrawal.id, matched);
    return did ? "finalized" : "already_resolved";
  }

  // Nothing on-chain matches this withdrawal after a generous wait - the
  // transfer never reached the network. Safe to refund: if it HAD
  // landed, the scan above would have found it.
  const did = await failAndRefundWithdrawal(
    withdrawal.id,
    "no on-chain transfer ever found for this withdrawal - treating as never sent"
  );
  return did ? "failed_and_refunded" : "already_resolved";
}

/**
 * Finds every withdrawal stuck in PROCESSING and reconciles each one.
 * Guarded by a distributed lock so at most one Railway replica runs
 * this at a time - two replicas reconciling the same stuck withdrawal
 * concurrently is harmless in itself (every write above is idempotent),
 * but serializing avoids two processes both making redundant Solana RPC
 * calls for the same row. Fails closed: if Redis is unavailable, this
 * run is skipped entirely rather than running unprotected - the next
 * scheduled run tries again, and skipping a pass costs nothing since a
 * stuck withdrawal has already been stuck for minutes by the time it
 * qualifies.
 */
export async function reconcileStuckWithdrawals(): Promise<Map<string, ReconcileOutcome>> {
  const results = new Map<string, ReconcileOutcome>();

  const lock = await acquireLock(WITHDRAWAL_RECONCILE_LOCK_KEY, WITHDRAWAL_RECONCILE_LOCK_TTL_SECONDS);
  if (!lock) return results;

  try {
    const stuck = await prisma.withdrawalRequest.findMany({
      where: { status: "PROCESSING" },
    });

    for (const withdrawal of stuck) {
      try {
        const outcome = await reconcileWithdrawal(withdrawal);
        results.set(withdrawal.id, outcome);
      } catch (error) {
        console.error(`Failed to reconcile withdrawal ${withdrawal.id}:`, error);
      }
    }
  } finally {
    await lock.release();
  }

  return results;
}
