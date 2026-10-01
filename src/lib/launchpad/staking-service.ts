import { PublicKey, Transaction } from "@solana/web3.js";
import { getOrCreateAssociatedTokenAccount, createTransferInstruction, TOKEN_PROGRAM_ID } from "@solana/spl-token";
import { Prisma } from "@prisma/client";
import { prisma } from "@/lib/db";
import { getConnection, getPlatformWallet } from "@/lib/solana";

/*
 * ============================================================
 * ZRP Launchpad, phase 3 - staking reward math + payout execution
 * ============================================================
 *
 * All arithmetic is BigInt over raw base units - same discipline as
 * vesting-service.ts, for the same reason (zrppad's own
 * calculateRewards() used plain JS number multiplication/division,
 * which drifts for large stakes/long durations).
 */

const BASIS_POINTS_DENOMINATOR = BigInt(10000);
const SECONDS_PER_YEAR = BigInt(365 * 24 * 3600);

export interface StakingPositionLike {
  amountRaw: Prisma.Decimal;
  rewardClaimedRaw: Prisma.Decimal;
  stakedAt: Date;
  status: string;
}

export interface StakingPoolLike {
  apyBasisPoints: number;
}

/**
 * Total reward accrued from stakedAt to `now`, at the pool's fixed APY.
 * A position's amount never changes after it's opened (no partial
 * top-ups in v1), so this is a pure function of elapsed time - no
 * incremental checkpoint bookkeeping needed, unlike a variable-principal
 * design.
 */
export function computeTotalAccruedRewardRaw(
  position: StakingPositionLike,
  pool: StakingPoolLike,
  now: Date = new Date()
): bigint {
  if (position.status !== "ACTIVE") {
    // An unstaked position's final reward is whatever was already
    // claimed - nothing further accrues after closing.
    return BigInt(position.rewardClaimedRaw.toFixed(0));
  }

  const secondsElapsed = Math.max(0, Math.floor((now.getTime() - position.stakedAt.getTime()) / 1000));
  const amountRaw = BigInt(position.amountRaw.toFixed(0));

  const numerator = amountRaw * BigInt(pool.apyBasisPoints) * BigInt(secondsElapsed);
  const denominator = BASIS_POINTS_DENOMINATOR * SECONDS_PER_YEAR;
  return numerator / denominator;
}

/** Reward accrued but not yet claimed, in raw base units. */
export function computeClaimableRewardRaw(position: StakingPositionLike, pool: StakingPoolLike, now: Date = new Date()): bigint {
  const totalAccrued = computeTotalAccruedRewardRaw(position, pool, now);
  const claimed = BigInt(position.rewardClaimedRaw.toFixed(0));
  const claimable = totalAccrued - claimed;
  return claimable > BigInt(0) ? claimable : BigInt(0);
}

export interface PayoutResult {
  success: boolean;
  signature?: string;
  error?: string;
  // True only when a transaction was actually broadcast (sendRawTransaction
  // returned a signature) but its on-chain outcome then could not be
  // confirmed - e.g. an RPC timeout mid-confirmation. Callers MUST NOT
  // revert any reservation/status change on this path - the transfer may
  // have genuinely succeeded. Only a definite `confirmation.value.err`
  // (ambiguous: false) means nothing moved and is safe to revert.
  ambiguous?: boolean;
}

/**
 * Sends `amountRaw` of `mintAddress` from the platform's staking escrow
 * ATA to the recipient's ATA (created if needed, platform pays the
 * rent). Pure on-chain transfer - callers are responsible for their own
 * atomic bookkeeping (reward reserve decrement, position updates)
 * before/after calling this, same division of responsibility as
 * vesting-service.ts's executeVestingClaim(). Does not attempt
 * crash-safe checkpointing of the broadcast signature before
 * confirmation - same accepted scope boundary as mint-service.ts and
 * vesting-service.ts. What IS handled here is distinguishing that
 * ambiguous state from a definite on-chain failure (see
 * PayoutResult.ambiguous) so callers can refuse to reopen a
 * position/refund a reserve on a payout that may have actually landed.
 */
export async function executeStakingPayout(params: {
  logContext: string;
  mintAddress: string;
  recipientWalletAddress: string;
  amountRaw: bigint;
}): Promise<PayoutResult> {
  const { logContext, mintAddress, recipientWalletAddress, amountRaw } = params;

  const connection = getConnection();
  const platform = getPlatformWallet();
  const mint = new PublicKey(mintAddress);
  const recipient = new PublicKey(recipientWalletAddress);

  let signature: string | undefined;
  try {
    const platformAta = await getOrCreateAssociatedTokenAccount(connection, platform, mint, platform.publicKey);
    const recipientAta = await getOrCreateAssociatedTokenAccount(connection, platform, mint, recipient);

    const transaction = new Transaction().add(
      createTransferInstruction(platformAta.address, recipientAta.address, platform.publicKey, amountRaw, [], TOKEN_PROGRAM_ID)
    );
    transaction.feePayer = platform.publicKey;

    const { blockhash, lastValidBlockHeight } = await connection.getLatestBlockhash("finalized");
    transaction.recentBlockhash = blockhash;
    transaction.sign(platform);

    signature = await connection.sendRawTransaction(transaction.serialize(), {
      skipPreflight: false,
      maxRetries: 3,
      preflightCommitment: "confirmed",
    });

    const confirmation = await connection.confirmTransaction({ signature, blockhash, lastValidBlockHeight }, "confirmed");
    if (confirmation.value.err) {
      console.error(`Staking payout ${logContext} failed on-chain:`, confirmation.value.err);
      return { success: false, error: `Transaction failed on-chain: ${JSON.stringify(confirmation.value.err)}`, ambiguous: false };
    }

    return { success: true, signature };
  } catch (error: unknown) {
    const message = error instanceof Error ? error.message : "Unknown error while paying out.";
    const ambiguous = signature !== undefined;
    console.error(
      `Staking payout ${logContext} transfer error (ambiguous=${ambiguous}${signature ? `, signature=${signature}` : ""}):`,
      error
    );
    return { success: false, error: message, ambiguous, signature };
  }
}

/**
 * Atomically reserves `amountRaw` from a pool's reward reserve - the
 * same "conditional UPDATE the database serialises" shape as
 * src/lib/ai-quota.ts's reserveAiMessage(), never check-then-decrement.
 * Returns false (reserving nothing) if the pool doesn't have enough
 * funded reserve to cover it, so a claim can never pay out more than
 * the pool has actually been funded with.
 */
export async function reserveRewardFromPool(poolId: string, amountRaw: bigint): Promise<boolean> {
  if (amountRaw <= BigInt(0)) return true;
  const result = await prisma.stakingPool.updateMany({
    where: { id: poolId, rewardReserveRaw: { gte: amountRaw.toString() } },
    data: { rewardReserveRaw: { decrement: amountRaw.toString() } },
  });
  return result.count === 1;
}

/** Hands a reserved-but-unpaid amount back to the pool (payout failed after reservation). */
export async function refundRewardToPool(poolId: string, amountRaw: bigint): Promise<void> {
  if (amountRaw <= BigInt(0)) return;
  await prisma.stakingPool.update({
    where: { id: poolId },
    data: { rewardReserveRaw: { increment: amountRaw.toString() } },
  });
}
