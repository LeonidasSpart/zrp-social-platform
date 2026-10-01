import { prisma } from "@/lib/db";
import {
  computeTotalAccruedRewardRaw,
  computeClaimableRewardRaw,
  executeStakingPayout,
} from "./staking-service";

/*
 * ============================================================
 * ZRP Launchpad, phase 7 - liquidity farming
 * ============================================================
 *
 * Mechanically identical to fungible staking: same fixed-APY accrual
 * formula over elapsed time, same funded-reserve payout safety. The
 * one real difference is WHAT gets staked - an external LP token
 * minted by a DEX, never a LaunchedToken ZRP itself minted - so there's
 * no corresponding LaunchedToken row to key a FarmingPool off of the
 * way StakingPool keys off launchedTokenId. computeTotalAccruedRewardRaw/
 * computeClaimableRewardRaw/executeStakingPayout are reused as-is from
 * staking-service.ts (already pool-shape-agnostic: they only touch
 * amountRaw/rewardClaimedRaw/stakedAt/status and apyBasisPoints); only
 * the reward-reserve reserve/refund helpers are duplicated here against
 * the FarmingPool table specifically.
 */

export async function reserveFarmingRewardFromPool(poolId: string, amountRaw: bigint): Promise<boolean> {
  if (amountRaw <= BigInt(0)) return true;
  const result = await prisma.farmingPool.updateMany({
    where: { id: poolId, rewardReserveRaw: { gte: amountRaw.toString() } },
    data: { rewardReserveRaw: { decrement: amountRaw.toString() } },
  });
  return result.count === 1;
}

export async function refundFarmingRewardToPool(poolId: string, amountRaw: bigint): Promise<void> {
  if (amountRaw <= BigInt(0)) return;
  await prisma.farmingPool.update({
    where: { id: poolId },
    data: { rewardReserveRaw: { increment: amountRaw.toString() } },
  });
}

// Re-exported so routes only ever need to import from this one module.
export { computeTotalAccruedRewardRaw, computeClaimableRewardRaw, executeStakingPayout };
