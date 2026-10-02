/*
 * Shared, environment-agnostic (no "use client", no server-only import)
 * pump.fun bonding-curve PDA derivation and pure curve math - the
 * bonding-curve counterpart to cpmm-keys.ts. Used by both the browser-side
 * transaction builder (client-bonding-curve.ts) and the server-side
 * independent verification/read service (pump-curve-service.ts), so the
 * two sides can never disagree about which bonding-curve/global/fee-config
 * addresses a given mint derives to.
 *
 * All PDA derivation here is re-exported straight from the official
 * @pump-fun/pump-sdk (ground truth: node_modules/@pump-fun/pump-sdk/src/
 * pda.ts and sdk.ts) rather than re-implemented - a hand-re-derived seed
 * that drifts from the SDK's own would silently point at the wrong
 * account. This module only adds pure helpers the SDK does not already
 * provide: BN<->bigint conversion (ZRP's own Decimal(38,0) convention uses
 * bigint/string, the SDK uses bn.js) and exact-integer curve-progress /
 * price-ratio math.
 */

import { PublicKey } from "@solana/web3.js";
import { TOKEN_PROGRAM_ID } from "@solana/spl-token";
import BN from "bn.js";
import {
  bondingCurvePda,
  bondingCurveV2Pda,
  creatorVaultPda,
  canonicalPumpPoolPda,
  GLOBAL_PDA,
  PUMP_FEE_CONFIG_PDA,
  PUMP_EVENT_AUTHORITY_PDA,
  PUMP_PROGRAM_ID,
  PUMP_AMM_PROGRAM_ID,
  getPumpProgram,
  getPumpAmmProgram,
} from "@pump-fun/pump-sdk";

export {
  bondingCurvePda,
  bondingCurveV2Pda,
  creatorVaultPda,
  canonicalPumpPoolPda,
  GLOBAL_PDA,
  PUMP_FEE_CONFIG_PDA,
  PUMP_EVENT_AUTHORITY_PDA,
  PUMP_PROGRAM_ID,
  PUMP_AMM_PROGRAM_ID,
};

// Offline (connection-less) program instances, used only for their
// `.coder` - decoding accounts/events never needs a live RPC connection,
// just the IDL. Mirrors @pump-fun/pump-swap-sdk's own
// OFFLINE_PUMP_AMM_PROGRAM = getPumpAmmProgram(null) pattern exactly.
export const OFFLINE_PUMP_PROGRAM = getPumpProgram(null as unknown as import("@solana/web3.js").Connection);
export const OFFLINE_PUMP_AMM_PROGRAM = getPumpAmmProgram(null as unknown as import("@solana/web3.js").Connection);

// pump's legacy (SOL-quoted) bonding curve always holds SPL Token mints,
// never Token-2022 - only create_v2's new-quote-mint path uses Token-2022.
// ZRP's curve integration targets the classic SOL-quoted curve only (see
// pump-curve-service.ts's module comment for why), so every ATA this
// module derives uses the plain SPL Token program.
export const CURVE_TOKEN_PROGRAM_ID = TOKEN_PROGRAM_ID;

export interface PumpCurveKeys {
  mint: PublicKey;
  bondingCurve: PublicKey;
  global: PublicKey;
  feeConfig: PublicKey;
  eventAuthority: PublicKey;
  pumpProgramId: PublicKey;
}

/** Pure, offline PDA derivation - no RPC call, unit-testable exactly. */
export function deriveCurveKeys(mint: PublicKey): PumpCurveKeys {
  return {
    mint,
    bondingCurve: bondingCurvePda(mint),
    global: GLOBAL_PDA,
    feeConfig: PUMP_FEE_CONFIG_PDA,
    eventAuthority: PUMP_EVENT_AUTHORITY_PDA,
    pumpProgramId: PUMP_PROGRAM_ID,
  };
}

export function bnToBigInt(value: BN): bigint {
  return BigInt(value.toString());
}

export function bigIntToBn(value: bigint): BN {
  return new BN(value.toString());
}

const ZERO = BigInt(0);
const BPS_DENOMINATOR = BigInt(10_000);

/**
 * Progress toward graduation, in basis points (10_000 = 100%): the
 * fraction of the curve's real token reserves already sold. This is the
 * exact mechanism pump's own program graduates on - `realTokenReserves`
 * counts down from `Global.initialRealTokenReserves` toward zero as buys
 * happen, and the program flips `BondingCurve.complete` once it would go
 * to/below zero. Never derived from a guessed SOL-raised threshold, which
 * the fetched account data does not expose directly.
 */
export function curveProgressBps(
  realTokenReservesRaw: bigint,
  initialRealTokenReservesRaw: bigint
): number {
  if (initialRealTokenReservesRaw <= ZERO) return 0;
  const sold = initialRealTokenReservesRaw - realTokenReservesRaw;
  const clamped =
    sold < ZERO ? ZERO : sold > initialRealTokenReservesRaw ? initialRealTokenReservesRaw : sold;
  return Number((clamped * BPS_DENOMINATOR) / initialRealTokenReservesRaw);
}

/**
 * Exact decimal-string division of two raw on-chain integers
 * (quoteLamports / tokenRaw) - never a floating-point divide. Both inputs
 * are the curve's own exact virtual reserves (or any other raw-integer
 * ratio), so the result is as precise as the chain's own representation,
 * just formatted for display with `precision` fractional digits.
 */
export function formatExactRatio(numerator: bigint, denominator: bigint, precision = 18): string {
  if (denominator <= ZERO) return "0";
  const negative = numerator < ZERO;
  const absNumerator = negative ? -numerator : numerator;
  // tsconfig targets es5, where `**` on bigint operands is a compile
  // error regardless of the esnext lib - build the power of ten by
  // repeated multiplication instead.
  let scale = BigInt(1);
  for (let i = 0; i < precision; i += 1) scale *= BigInt(10);
  const scaled = (absNumerator * scale) / denominator;
  const digits = scaled.toString().padStart(precision + 1, "0");
  const intPart = digits.slice(0, digits.length - precision) || "0";
  const fracPart = digits.slice(digits.length - precision).replace(/0+$/, "");
  const formatted = fracPart ? `${intPart}.${fracPart}` : intPart;
  return negative ? `-${formatted}` : formatted;
}

export function applySlippageDown(amount: bigint, slippageBps: number): bigint {
  return (amount * BigInt(10_000 - slippageBps)) / BPS_DENOMINATOR;
}

export function applySlippageUp(amount: bigint, slippageBps: number): bigint {
  return (amount * BigInt(10_000 + slippageBps)) / BPS_DENOMINATOR;
}
