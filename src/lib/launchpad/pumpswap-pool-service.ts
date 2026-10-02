/*
 * Real PumpSwap (pump.fun's own post-graduation AMM) pool reads - the
 * post-graduation counterpart to pump-curve-service.ts. A pump bonding
 * curve migrates into exactly this kind of pool (see
 * pump-curve-service.ts's checkGraduation / canonicalPumpPoolPda), and
 * this module is what decodes that pool's real on-chain state: actual
 * token-account reserves (never a placeholder, never left null "because
 * decoding wasn't implemented") plus the official SDK's own decoder for
 * the Pool account's structured fields (mints, LP mint, creator-fee
 * config, the pool's virtual quote-reserve offset).
 *
 * PumpSwap pools are not plain constant-product pools: price blends the
 * quote token account's real balance with `Pool.virtualQuoteReserves`,
 * exactly like a bonding curve blends virtual/real reserves - confirmed
 * by reading @pump-fun/pump-swap-sdk's own buy.ts
 * (`effectiveQuoteReserve = quoteReserve.add(virtualQuoteReserves)`) and
 * mirrored here rather than guessed.
 */

import { Connection, PublicKey } from "@solana/web3.js";
import { PUMP_AMM_SDK } from "@pump-fun/pump-swap-sdk";
import { readPoolLiquidity } from "./pool-liquidity-reader";
import { bnToBigInt, formatExactRatio } from "./pump-curve-keys";

export type PumpSwapPoolStatus = "OK" | "NOT_FOUND" | "UNAVAILABLE";

export interface PumpSwapPoolState {
  status: PumpSwapPoolStatus;
  reason: string | null;
  poolAddress: string;
  baseMint: string | null;
  quoteMint: string | null;
  lpMint: string | null;
  baseReserveRaw: string | null;
  quoteReserveRaw: string | null;
  virtualQuoteReservesRaw: string | null;
  lpSupplyRaw: string | null;
  // Exact integer numerator/denominator of the spot price (quote per 1
  // raw base unit, including the virtual-quote offset) - see
  // formatExactRatio for why this is never pre-divided into a float.
  priceQuoteRaw: string | null;
  priceBaseRaw: string | null;
  priceDisplay: string | null;
}

function empty(poolAddress: string, status: PumpSwapPoolStatus, reason: string | null): PumpSwapPoolState {
  return {
    status,
    reason,
    poolAddress,
    baseMint: null,
    quoteMint: null,
    lpMint: null,
    baseReserveRaw: null,
    quoteReserveRaw: null,
    virtualQuoteReservesRaw: null,
    lpSupplyRaw: null,
    priceQuoteRaw: null,
    priceBaseRaw: null,
    priceDisplay: null,
  };
}

/**
 * Real, live PumpSwap pool state for `poolAddress` - the real `Pool`
 * account decoded via the official SDK, plus the real token-account
 * reserves it points at (via the same readPoolLiquidity helper the
 * Raydium side already uses - no duplicate reserve-reading logic).
 * `NOT_FOUND` means the pool account genuinely doesn't exist yet (e.g.
 * migration hasn't landed); `UNAVAILABLE` means the RPC call itself
 * failed - these are never conflated.
 */
export async function getPumpSwapPoolState(connection: Connection, poolAddress: string): Promise<PumpSwapPoolState> {
  let pool: PublicKey;
  try {
    pool = new PublicKey(poolAddress);
  } catch {
    return empty(poolAddress, "UNAVAILABLE", "Invalid pool address.");
  }

  let poolAccountInfo;
  try {
    poolAccountInfo = await connection.getAccountInfo(pool);
  } catch (error: unknown) {
    return empty(poolAddress, "UNAVAILABLE", error instanceof Error ? error.message : "RPC_UNAVAILABLE");
  }
  if (!poolAccountInfo) {
    return empty(poolAddress, "NOT_FOUND", "This pool account does not exist yet.");
  }

  const decoded = PUMP_AMM_SDK.decodePoolNullable(poolAccountInfo);
  if (!decoded) {
    return empty(poolAddress, "UNAVAILABLE", "Pool account could not be decoded.");
  }

  const liquidity = await readPoolLiquidity(connection, {
    baseVault: decoded.poolBaseTokenAccount.toBase58(),
    quoteVault: decoded.poolQuoteTokenAccount.toBase58(),
    lpMint: decoded.lpMint.toBase58(),
  });

  if (liquidity.status !== "OK" || liquidity.reserveBaseRaw === null || liquidity.reserveQuoteRaw === null) {
    return {
      ...empty(poolAddress, "UNAVAILABLE", liquidity.reason ?? "Could not read pool reserves."),
      baseMint: decoded.baseMint.toBase58(),
      quoteMint: decoded.quoteMint.toBase58(),
      lpMint: decoded.lpMint.toBase58(),
    };
  }

  const virtualQuoteReservesRaw = bnToBigInt(decoded.virtualQuoteReserves);
  const baseReserveRaw = BigInt(liquidity.reserveBaseRaw);
  const quoteReserveRaw = BigInt(liquidity.reserveQuoteRaw);
  const effectiveQuoteRaw = quoteReserveRaw + virtualQuoteReservesRaw;

  return {
    status: "OK",
    reason: null,
    poolAddress,
    baseMint: decoded.baseMint.toBase58(),
    quoteMint: decoded.quoteMint.toBase58(),
    lpMint: decoded.lpMint.toBase58(),
    baseReserveRaw: baseReserveRaw.toString(),
    quoteReserveRaw: quoteReserveRaw.toString(),
    virtualQuoteReservesRaw: virtualQuoteReservesRaw.toString(),
    lpSupplyRaw: liquidity.lpSupplyRaw,
    priceQuoteRaw: effectiveQuoteRaw.toString(),
    priceBaseRaw: baseReserveRaw.toString(),
    priceDisplay: baseReserveRaw > BigInt(0) ? formatExactRatio(effectiveQuoteRaw, baseReserveRaw) : null,
  };
}
