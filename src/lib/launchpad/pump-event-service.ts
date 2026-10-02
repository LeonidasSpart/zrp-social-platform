/*
 * Real Anchor-event parsing from an already-confirmed pump.fun transaction's
 * own log messages - the mechanism this module uses to turn "a transaction
 * happened" into "here is exactly what the pump program itself recorded
 * happening" for token creation, trades, and graduation. Anchor's modern
 * `emit_cpi!` macro still writes a base64 "Program data:" log line for each
 * event (confirmed against @pump-fun/pump-swap-sdk's own test suite, which
 * decodes events the identical way - see its decode.spec.ts/
 * buyQuoteSimulation.spec.ts), so `EventParser.parseLogs()` against a real
 * transaction's `meta.logMessages` is the official, documented way to read
 * them back - no bespoke inner-instruction walking needed.
 *
 * This is never a client-trusted shortcut: every value returned here comes
 * from bytes the pump program itself wrote on-chain, decoded with the
 * vendored IDL's own coder. A transaction whose logs don't contain the
 * expected event (wrong instruction, wrong program, simulation-only, log
 * truncation) simply yields `null` - callers must treat that as "could not
 * verify," never synthesize a fallback.
 */

import { EventParser } from "@coral-xyz/anchor";
import { PublicKey } from "@solana/web3.js";
import BN from "bn.js";
import { PUMP_PROGRAM_ID, OFFLINE_PUMP_PROGRAM } from "./pump-curve-keys";

const PUMP_EVENT_PARSER = new EventParser(PUMP_PROGRAM_ID, OFFLINE_PUMP_PROGRAM.coder);

export interface ParsedCreateEvent {
  name: string;
  symbol: string;
  uri: string;
  mint: PublicKey;
  bondingCurve: PublicKey;
  user: PublicKey;
  creator: PublicKey;
  timestamp: BN;
  virtualTokenReserves: BN;
  virtualSolReserves: BN;
  realTokenReserves: BN;
  tokenTotalSupply: BN;
  tokenProgram: PublicKey;
  isMayhemMode: boolean;
  quoteMint: PublicKey;
  virtualQuoteReserves: BN;
}

export interface ParsedTradeEvent {
  mint: PublicKey;
  solAmount: BN;
  tokenAmount: BN;
  isBuy: boolean;
  user: PublicKey;
  timestamp: BN;
  quoteMint: PublicKey;
  quoteAmount: BN;
}

export interface ParsedCompleteEvent {
  user: PublicKey;
  mint: PublicKey;
  bondingCurve: PublicKey;
  timestamp: BN;
  quoteMint: PublicKey;
}

/** `CompletePumpAmmMigrationEvent` - no exported TS type in the SDK, so defined here from the vendored IDL's own field list (pump.json -> types -> CompletePumpAmmMigrationEvent). */
export interface ParsedMigrationEvent {
  user: PublicKey;
  mint: PublicKey;
  mintAmount: BN;
  solAmount: BN;
  poolMigrationFee: BN;
  bondingCurve: PublicKey;
  timestamp: BN;
  pool: PublicKey;
  quoteMint: PublicKey;
}

/**
 * Parses every pump-program event out of a transaction's log messages.
 * Malformed/foreign log lines are skipped by `EventParser` itself (it only
 * recognizes lines it can match against its own program's discriminators);
 * wrapped in try/catch only so a genuinely corrupt log array degrades to
 * "no events found" rather than throwing out of a route handler.
 */
function parseAllPumpEvents(logMessages: string[]): Array<{ name: string; data: Record<string, unknown> }> {
  try {
    // tsconfig targets es5, where spreading a Generator requires
    // --downlevelIteration - Array.from() avoids that compiler
    // requirement while consuming the same iterable at runtime.
    return Array.from(PUMP_EVENT_PARSER.parseLogs(logMessages)) as Array<{ name: string; data: Record<string, unknown> }>;
  } catch {
    return [];
  }
}

function pubkeyEquals(value: unknown, target: PublicKey): boolean {
  return value instanceof PublicKey && value.equals(target);
}

/** The real on-chain `CreateEvent` for `mint`, or null if this transaction's logs don't contain one. */
export function parseCreateEvent(logMessages: string[], mint: PublicKey): ParsedCreateEvent | null {
  const match = parseAllPumpEvents(logMessages).find((e) => e.name === "createEvent" && pubkeyEquals(e.data.mint, mint));
  return (match?.data as unknown as ParsedCreateEvent) ?? null;
}

/** The real on-chain `TradeEvent` for `mint`, or null. When a transaction legitimately contains more than one trade event for the same mint (not possible for a single buy/sell, but defensively handled), the first is returned. */
export function parseTradeEvent(logMessages: string[], mint: PublicKey): ParsedTradeEvent | null {
  const match = parseAllPumpEvents(logMessages).find((e) => e.name === "tradeEvent" && pubkeyEquals(e.data.mint, mint));
  return (match?.data as unknown as ParsedTradeEvent) ?? null;
}

/** The real on-chain `CompleteEvent` (curve reached 100%) for `mint`, or null. */
export function parseCompleteEvent(logMessages: string[], mint: PublicKey): ParsedCompleteEvent | null {
  const match = parseAllPumpEvents(logMessages).find((e) => e.name === "completeEvent" && pubkeyEquals(e.data.mint, mint));
  return (match?.data as unknown as ParsedCompleteEvent) ?? null;
}

/** The real on-chain `CompletePumpAmmMigrationEvent` (the migration to PumpSwap) for `mint`, or null. */
export function parseMigrationEvent(logMessages: string[], mint: PublicKey): ParsedMigrationEvent | null {
  const match = parseAllPumpEvents(logMessages).find(
    (e) => e.name === "completePumpAmmMigrationEvent" && pubkeyEquals(e.data.mint, mint)
  );
  return (match?.data as unknown as ParsedMigrationEvent) ?? null;
}
