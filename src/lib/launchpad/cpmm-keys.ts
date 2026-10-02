/*
 * Shared, environment-agnostic (no "use client", no server-only import)
 * Raydium CPMM math and PDA derivation - used by both the browser-side
 * transaction builders (client-liquidity.ts) and the server-side
 * independent verification service (raydium-pool-service.ts), so the two
 * sides can never silently disagree about which pool/vault/LP-mint
 * addresses a given (tokenMint, quoteMint) pair derives to.
 */

import { PublicKey } from "@solana/web3.js";
import { TOKEN_PROGRAM_ID } from "@solana/spl-token";
import { CREATE_CPMM_POOL_PROGRAM, getCpmmPdaAmmConfigId, getCreatePoolKeys } from "@raydium-io/raydium-sdk-v2";

// Raydium's standard, permissionless 0.25% fee-tier AMM config - index 0
// under the CPMM program, the tier Raydium's own UI uses for ordinary
// token launches. The address is a deterministic PDA of (programId, index),
// not fetched from anywhere - cross-checked against Raydium's own SDK
// output (D4FPEruKEHrG5TenZ2mpDGEfu1iUvTiqBxvpU8HLBvC2 on mainnet).
export const STANDARD_FEE_TIER_INDEX = 0;

export function sortMints(
  mintX: PublicKey,
  programX: PublicKey,
  mintY: PublicKey,
  programY: PublicKey
): { mintA: PublicKey; programA: PublicKey; mintB: PublicKey; programB: PublicKey; xIsA: boolean } {
  // CPMM pools (like every Solana constant-product AMM) key the pool PDA
  // on a canonical mint order - whichever mint's raw 32-byte pubkey is
  // numerically smaller is always "mintA". Getting this wrong derives a
  // different (wrong, nonexistent) pool address entirely.
  const xIsA = Buffer.compare(mintX.toBuffer(), mintY.toBuffer()) < 0;
  return xIsA
    ? { mintA: mintX, programA: programX, mintB: mintY, programB: programY, xIsA: true }
    : { mintA: mintY, programA: programY, mintB: mintX, programB: programX, xIsA: false };
}

export interface CreatePoolKeys {
  poolId: PublicKey;
  configId: PublicKey;
  authority: PublicKey;
  lpMint: PublicKey;
  vaultA: PublicKey;
  vaultB: PublicKey;
  observationId: PublicKey;
  mintA: PublicKey;
  mintB: PublicKey;
}

/** Pure, offline PDA derivation - no RPC call, unit-testable exactly. */
export function deriveCreatePoolKeys(
  tokenMint: PublicKey,
  tokenProgramId: PublicKey,
  quoteMint: PublicKey
): CreatePoolKeys {
  const configId = getCpmmPdaAmmConfigId(CREATE_CPMM_POOL_PROGRAM, STANDARD_FEE_TIER_INDEX).publicKey;
  const { mintA, mintB } = sortMints(tokenMint, tokenProgramId, quoteMint, TOKEN_PROGRAM_ID);
  const keys = getCreatePoolKeys({ programId: CREATE_CPMM_POOL_PROGRAM, configId, mintA, mintB });
  return { ...keys, mintA, mintB };
}

/**
 * Pure constant-product math for computing the LP amount a deposit of
 * (desiredA, desiredB) is worth against the pool's current reserves -
 * exactly the formula Raydium's own CPMM program enforces on-chain, so a
 * client- or server-computed value here is a prediction, never an
 * authority; the chain is always the final arbiter.
 */
// tsconfig targets es5, where BigInt literal syntax (0n, 10_000n) is a
// compile error regardless of the esnext lib - BigInt(...) calls are used
// throughout this module instead.
const ZERO = BigInt(0);
const BPS_DENOMINATOR = BigInt(10_000);

export function computeDepositLpAmount(
  reserveA: bigint,
  reserveB: bigint,
  lpSupply: bigint,
  desiredAmountA: bigint,
  desiredAmountB: bigint
): bigint {
  if (reserveA <= ZERO || reserveB <= ZERO || lpSupply <= ZERO) {
    throw new Error("Pool has no liquidity yet - use pool creation instead.");
  }
  const lpFromA = (desiredAmountA * lpSupply) / reserveA;
  const lpFromB = (desiredAmountB * lpSupply) / reserveB;
  const lpAmount = lpFromA < lpFromB ? lpFromA : lpFromB;
  if (lpAmount <= ZERO) throw new Error("Deposit amount too small to mint any LP tokens.");
  return lpAmount;
}

export function computeWithdrawAmounts(
  reserveA: bigint,
  reserveB: bigint,
  lpSupply: bigint,
  lpAmountToBurn: bigint
): { amountA: bigint; amountB: bigint } {
  if (lpSupply <= ZERO) throw new Error("Pool has no LP supply.");
  return {
    amountA: (reserveA * lpAmountToBurn) / lpSupply,
    amountB: (reserveB * lpAmountToBurn) / lpSupply,
  };
}

export function applySlippageDown(amount: bigint, slippageBps: number): bigint {
  return (amount * BigInt(10_000 - slippageBps)) / BPS_DENOMINATOR;
}

export function applySlippageUp(amount: bigint, slippageBps: number): bigint {
  return (amount * BigInt(10_000 + slippageBps)) / BPS_DENOMINATOR;
}
