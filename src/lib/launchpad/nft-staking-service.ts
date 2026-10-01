import { prisma } from "@/lib/db";
import { executeStakingPayout } from "./staking-service";

/*
 * ============================================================
 * ZRP Launchpad, phase 6b - NFT staking reward math + payout
 * ============================================================
 *
 * A staked NFT has no "amount" to apply an APY to, so reward accrual is
 * a flat rate per staked NFT per day, not a percentage. Reuses
 * staking-service.ts's executeStakingPayout() as-is for the actual
 * on-chain transfer (already mint-agnostic); the reserve-decrement
 * helpers below are NftStakingPool-specific copies of the same
 * conditional-UPDATE pattern, since they target a different table.
 */

const SECONDS_PER_DAY = BigInt(86400);

export interface NftStakingPositionLike {
  rewardClaimedRaw: { toFixed(digits: number): string };
  stakedAt: Date;
  status: string;
}

export interface NftStakingPoolLike {
  rewardRatePerDayRaw: { toFixed(digits: number): string };
}

/** Total reward accrued from stakedAt to `now`, at the pool's flat per-day rate. */
export function computeNftTotalAccruedRewardRaw(
  position: NftStakingPositionLike,
  pool: NftStakingPoolLike,
  now: Date = new Date()
): bigint {
  if (position.status !== "ACTIVE") {
    return BigInt(position.rewardClaimedRaw.toFixed(0));
  }

  const secondsElapsed = BigInt(Math.max(0, Math.floor((now.getTime() - position.stakedAt.getTime()) / 1000)));
  const ratePerDayRaw = BigInt(pool.rewardRatePerDayRaw.toFixed(0));

  return (ratePerDayRaw * secondsElapsed) / SECONDS_PER_DAY;
}

/** Reward accrued but not yet claimed, in raw base units. */
export function computeNftClaimableRewardRaw(
  position: NftStakingPositionLike,
  pool: NftStakingPoolLike,
  now: Date = new Date()
): bigint {
  const totalAccrued = computeNftTotalAccruedRewardRaw(position, pool, now);
  const claimed = BigInt(position.rewardClaimedRaw.toFixed(0));
  const claimable = totalAccrued - claimed;
  return claimable > BigInt(0) ? claimable : BigInt(0);
}

/**
 * Atomically reserves `amountRaw` from an NftStakingPool's reward
 * reserve - same conditional-UPDATE shape as fungible staking's
 * reserveRewardFromPool(), just against the NftStakingPool table.
 */
export async function reserveNftRewardFromPool(poolId: string, amountRaw: bigint): Promise<boolean> {
  if (amountRaw <= BigInt(0)) return true;
  const result = await prisma.nftStakingPool.updateMany({
    where: { id: poolId, rewardReserveRaw: { gte: amountRaw.toString() } },
    data: { rewardReserveRaw: { decrement: amountRaw.toString() } },
  });
  return result.count === 1;
}

export async function refundNftRewardToPool(poolId: string, amountRaw: bigint): Promise<void> {
  if (amountRaw <= BigInt(0)) return;
  await prisma.nftStakingPool.update({
    where: { id: poolId },
    data: { rewardReserveRaw: { increment: amountRaw.toString() } },
  });
}

// Re-exported so routes only ever need to import from this one module
// for the whole NFT staking payout path; the on-chain transfer itself
// is identical for any mint, fungible or not.
export { executeStakingPayout };
