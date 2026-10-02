/*
 * Live, on-chain liquidity reads for a known Raydium CPMM pool - real
 * vault token balances and real LP mint supply, read directly from the
 * configured RPC every call. TokenPool/LiquidityEvent rows record what
 * happened at creation/add/remove time; they are never read as "the
 * current reserves," since any other trader's swap moves them between
 * ZRP's own events - only the chain itself is authoritative for "right
 * now."
 */

import { Connection, PublicKey } from "@solana/web3.js";

export interface PoolLiquiditySnapshot {
  status: "OK" | "UNAVAILABLE";
  reserveBaseRaw: string | null;
  reserveQuoteRaw: string | null;
  lpSupplyRaw: string | null;
  reason: string | null;
}

export async function readPoolLiquidity(
  connection: Connection,
  params: { baseVault: string; quoteVault: string; lpMint: string }
): Promise<PoolLiquiditySnapshot> {
  try {
    const [baseVaultBalance, quoteVaultBalance, lpSupply] = await Promise.all([
      connection.getTokenAccountBalance(new PublicKey(params.baseVault)),
      connection.getTokenAccountBalance(new PublicKey(params.quoteVault)),
      connection.getTokenSupply(new PublicKey(params.lpMint)),
    ]);

    return {
      status: "OK",
      reserveBaseRaw: baseVaultBalance.value.amount,
      reserveQuoteRaw: quoteVaultBalance.value.amount,
      lpSupplyRaw: lpSupply.value.amount,
      reason: null,
    };
  } catch (error: unknown) {
    // A pool account no longer existing, or the RPC being briefly
    // unavailable, is reported honestly rather than as zero liquidity -
    // zero is a real, meaningful value (an empty pool) that must never be
    // confused with "could not read."
    return {
      status: "UNAVAILABLE",
      reserveBaseRaw: null,
      reserveQuoteRaw: null,
      lpSupplyRaw: null,
      reason: error instanceof Error ? error.message : "RPC_UNAVAILABLE",
    };
  }
}

export function computeUserPoolShare(
  userLpRaw: bigint,
  lpSupplyRaw: bigint
): { sharePercent: number } {
  if (lpSupplyRaw <= BigInt(0)) return { sharePercent: 0 };
  // Scaled by 1e6 before the division back to a float so a tiny share
  // (a retail LP position in a large pool) doesn't round to exactly 0%
  // from integer division alone.
  const scaled = (userLpRaw * BigInt(100_000_000)) / lpSupplyRaw;
  return { sharePercent: Number(scaled) / 1_000_000 };
}
