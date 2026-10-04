/*
 * Shared, environment-agnostic (no "use client", no server-only import) PDA
 * derivation for ZRP's own Launchpad program - the ZRP-native counterpart
 * to pump-curve-keys.ts. Used by both the browser-side transaction builder
 * (client-zrp-launch.ts) and the server-side independent verification/read
 * service (zrp-launch-service.ts), so the two sides can never disagree
 * about which global-config/curve/vault addresses a given mint derives to.
 *
 * ZRP_LAUNCH_PROGRAM_ID defaults to the devnet program ID (deterministic
 * from the committed devnet keypair at programs/zrp-launchpad/keys/ -
 * never invented) and must be overridden via NEXT_PUBLIC_ZRP_LAUNCH_PROGRAM_ID
 * for any other cluster, in particular mainnet - see
 * docs/zrp-launchpad-deployment.md. There is no mainnet default on
 * purpose: shipping a real mainnet feature pointed at an unset/placeholder
 * program ID must fail loudly, not silently default to devnet's address.
 */

import { PublicKey } from "@solana/web3.js";
import { BinaryWriter } from "borsh";
import BN from "bn.js";
import { PHASE_PRODUCTION_BUILD } from "next/constants";

const DEVNET_PROGRAM_ID = "3vr1SHa9LvEvELb23NBG1J6oFRCSDs8cj8wS55zuoRxK";

export function getZrpLaunchProgramId(): PublicKey {
  const configured =
    process.env.NEXT_PUBLIC_ZRP_LAUNCH_PROGRAM_ID || process.env.ZRP_LAUNCH_PROGRAM_ID;
  if (!configured) {
    // Matches src/lib/solana.ts's getConnection() fail-closed posture: a
    // production deploy with this var unset must never silently derive
    // devnet PDAs/transactions - it must refuse to start instead.
    //
    // NEXT_PHASE guard: this module is imported (not just at request time)
    // by `next build`'s "Collecting page data" step, which statically
    // evaluates every route module's top-level exports - including this
    // file's own `export const ZRP_LAUNCH_PROGRAM_ID = getZrpLaunchProgramId()`
    // below - with NODE_ENV already "production" and no real request in
    // flight. Without this guard, a build run anywhere this var isn't set
    // (exactly the current state - mainnet isn't deployed yet) throws
    // during the build itself, not at runtime - confirmed the hard way:
    // this broke the Railway production build the first time this check
    // shipped. next/constants' PHASE_PRODUCTION_BUILD is Next's own
    // documented way to distinguish "building" from "actually serving
    // requests" - the fail-closed check still applies at real server
    // startup/first use, just not during static build-time analysis.
    if (process.env.NODE_ENV === "production" && process.env.NEXT_PHASE !== PHASE_PRODUCTION_BUILD) {
      throw new Error(
        "ZRP_LAUNCH_PROGRAM_ID (or NEXT_PUBLIC_ZRP_LAUNCH_PROGRAM_ID) must be configured in production. Refusing to fall back to the devnet ZRP Launchpad program ID."
      );
    }
    return new PublicKey(DEVNET_PROGRAM_ID);
  }
  return new PublicKey(configured);
}

export const ZRP_LAUNCH_PROGRAM_ID = getZrpLaunchProgramId();

export const GLOBAL_CONFIG_SEED = Buffer.from("global");
export const BONDING_CURVE_SEED_PREFIX = Buffer.from("bonding-curve");

export const TOKEN_METADATA_PROGRAM_ID = new PublicKey(
  "metaqbxxUerdq28cj1RbAWkYQm3ybzjb6a8bt518x1s"
);

export interface ZrpLaunchKeys {
  programId: PublicKey;
  globalConfig: PublicKey;
  bondingCurve: PublicKey;
  metadata: PublicKey;
}

/** Pure, offline PDA derivation - no RPC call, unit-testable exactly. */
export function deriveZrpLaunchKeys(mint: PublicKey, programId = ZRP_LAUNCH_PROGRAM_ID): ZrpLaunchKeys {
  const [globalConfig] = PublicKey.findProgramAddressSync([GLOBAL_CONFIG_SEED], programId);
  const [bondingCurve] = PublicKey.findProgramAddressSync(
    [BONDING_CURVE_SEED_PREFIX, mint.toBuffer()],
    programId
  );
  const [metadata] = PublicKey.findProgramAddressSync(
    [Buffer.from("metadata"), TOKEN_METADATA_PROGRAM_ID.toBuffer(), mint.toBuffer()],
    TOKEN_METADATA_PROGRAM_ID
  );
  return { programId, globalConfig, bondingCurve, metadata };
}

const ZERO = BigInt(0);
const BPS_DENOMINATOR = BigInt(10_000);

/**
 * Exact constant-product buy quote, mirroring programs/zrp-launchpad/src/
 * math.rs::compute_buy exactly (same rounding direction) so a client-shown
 * quote always matches what the on-chain program will actually compute -
 * never an approximation the server/program could then reject.
 */
export function quoteZrpBuy(
  virtualSolReserves: bigint,
  virtualTokenReserves: bigint,
  solIn: bigint,
  buyFeeBps: number
): { tokenOut: bigint; feeLamports: bigint } {
  if (solIn <= ZERO) return { tokenOut: ZERO, feeLamports: ZERO };
  const feeLamports = (solIn * BigInt(buyFeeBps)) / BPS_DENOMINATOR;
  const solAfterFee = solIn - feeLamports;
  const k = virtualSolReserves * virtualTokenReserves;
  const newVirtualSol = virtualSolReserves + solAfterFee;
  if (newVirtualSol <= ZERO) return { tokenOut: ZERO, feeLamports };
  const newVirtualToken = (k + newVirtualSol - BigInt(1)) / newVirtualSol; // ceil, matches math.rs
  if (newVirtualToken >= virtualTokenReserves) return { tokenOut: ZERO, feeLamports };
  return { tokenOut: virtualTokenReserves - newVirtualToken, feeLamports };
}

/** Mirrors programs/zrp-launchpad/src/math.rs::compute_sell exactly. */
export function quoteZrpSell(
  virtualSolReserves: bigint,
  virtualTokenReserves: bigint,
  tokenIn: bigint,
  sellFeeBps: number
): { solOut: bigint; feeLamports: bigint } {
  if (tokenIn <= ZERO) return { solOut: ZERO, feeLamports: ZERO };
  const k = virtualSolReserves * virtualTokenReserves;
  const newVirtualToken = virtualTokenReserves + tokenIn;
  const newVirtualSol = k / newVirtualToken; // floor, matches math.rs
  if (newVirtualSol >= virtualSolReserves) return { solOut: ZERO, feeLamports: ZERO };
  const solOutBeforeFee = virtualSolReserves - newVirtualSol;
  const feeLamports = (solOutBeforeFee * BigInt(sellFeeBps)) / BPS_DENOMINATOR;
  return { solOut: solOutBeforeFee - feeLamports, feeLamports };
}

export function applySlippageDown(amount: bigint, slippageBps: number): bigint {
  return (amount * BigInt(10_000 - slippageBps)) / BPS_DENOMINATOR;
}

export function applySlippageUp(amount: bigint, slippageBps: number): bigint {
  return (amount * BigInt(10_000 + slippageBps)) / BPS_DENOMINATOR;
}

/*
 * Instruction/account (de)serialization below is hand-implemented against
 * Anchor's own, unchanged-since-0.26 conventions - an 8-byte sighash
 * discriminator (first 8 bytes of sha256("<namespace>:<name>")) followed
 * by the Borsh-encoded args/fields in declaration order - rather than via
 * `@coral-xyz/anchor`'s `Program`+IDL machinery. That machinery needs a
 * generated IDL JSON (target/idl/zrp_launchpad.json), which only exists as
 * a CI build artifact (see .github/workflows/solana-program-ci.yml); it is
 * not something `npm run build` produces or this repo can commit without
 * first running a real `anchor build`. Every discriminator/encoding
 * primitive here was verified byte-for-byte against Node's own `crypto`
 * and the `borsh` package's own writer before being used (see the
 * commit introducing this file) - this is not a guessed format.
 *
 * Field orders below are a direct, 1:1 transcription of
 * programs/zrp-launchpad/src/state.rs; a divergence between the two is a
 * real bug, not a style choice.
 */

// crypto.subtle is a Web Standard global in both Node 19+ (this repo
// targets Node >=22.12.0) and every browser - no "use client"-only or
// server-only branch needed, unlike Node's own `crypto` module.
export async function anchorDiscriminator(namespace: "global" | "account" | "event", name: string): Promise<Buffer> {
  const preimage = `${namespace}:${name}`;
  const digest = await crypto.subtle.digest("SHA-256", new TextEncoder().encode(preimage));
  return Buffer.from(digest).subarray(0, 8);
}

async function encodeInstruction(name: string, writeArgs: (w: BinaryWriter) => void): Promise<Buffer> {
  const discriminator = await anchorDiscriminator("global", name);
  const writer = new BinaryWriter();
  writeArgs(writer);
  return Buffer.concat([discriminator, writer.toArray()]);
}

export async function encodeCreateAndBuyIx(args: {
  name: string;
  symbol: string;
  uri: string;
  initialBuyLamports: bigint;
  minTokensOut: bigint;
}): Promise<Buffer> {
  return encodeInstruction("create_and_buy", (w) => {
    w.writeString(args.name);
    w.writeString(args.symbol);
    w.writeString(args.uri);
    w.writeU64(new BN(args.initialBuyLamports.toString()));
    w.writeU64(new BN(args.minTokensOut.toString()));
  });
}

export async function encodeBuyIx(args: { solIn: bigint; minTokensOut: bigint }): Promise<Buffer> {
  return encodeInstruction("buy", (w) => {
    w.writeU64(new BN(args.solIn.toString()));
    w.writeU64(new BN(args.minTokensOut.toString()));
  });
}

export async function encodeSellIx(args: { tokenIn: bigint; minSolOut: bigint }): Promise<Buffer> {
  return encodeInstruction("sell", (w) => {
    w.writeU64(new BN(args.tokenIn.toString()));
    w.writeU64(new BN(args.minSolOut.toString()));
  });
}

export async function encodeGraduateIx(): Promise<Buffer> {
  return anchorDiscriminator("global", "graduate");
}

export interface DecodedGlobalConfig {
  authority: PublicKey;
  feeRecipient: PublicKey;
  migrationAuthority: PublicKey;
  creationFeeLamports: bigint;
  buyFeeBps: number;
  sellFeeBps: number;
  initialVirtualSolReserves: bigint;
  initialVirtualTokenReserves: bigint;
  tokenTotalSupply: bigint;
  graduationSolTarget: bigint;
  tokenDecimals: number;
  bump: number;
}

/** Decodes a raw GlobalConfig account's data (the 8-byte Anchor account discriminator is skipped, never re-derived/checked here - callers that need that check call verifyAccountDiscriminator separately). */
export function decodeGlobalConfig(data: Buffer): DecodedGlobalConfig {
  let o = 8; // skip account discriminator
  const readPubkey = () => {
    const pk = new PublicKey(data.subarray(o, o + 32));
    o += 32;
    return pk;
  };
  const readU64 = () => {
    const v = data.readBigUInt64LE(o);
    o += 8;
    return v;
  };
  const authority = readPubkey();
  const feeRecipient = readPubkey();
  const migrationAuthority = readPubkey();
  const creationFeeLamports = readU64();
  const buyFeeBps = data.readUInt16LE(o);
  o += 2;
  const sellFeeBps = data.readUInt16LE(o);
  o += 2;
  const initialVirtualSolReserves = readU64();
  const initialVirtualTokenReserves = readU64();
  const tokenTotalSupply = readU64();
  const graduationSolTarget = readU64();
  const tokenDecimals = data.readUInt8(o);
  o += 1;
  const bump = data.readUInt8(o);
  return {
    authority,
    feeRecipient,
    migrationAuthority,
    creationFeeLamports,
    buyFeeBps,
    sellFeeBps,
    initialVirtualSolReserves,
    initialVirtualTokenReserves,
    tokenTotalSupply,
    graduationSolTarget,
    tokenDecimals,
    bump,
  };
}

export interface DecodedBondingCurve {
  mint: PublicKey;
  creator: PublicKey;
  virtualSolReserves: bigint;
  virtualTokenReserves: bigint;
  realSolReserves: bigint;
  realTokenReserves: bigint;
  tokenTotalSupply: bigint;
  complete: boolean;
  migrated: boolean;
  createdAt: bigint;
  bump: number;
}

export function decodeBondingCurve(data: Buffer): DecodedBondingCurve {
  let o = 8; // skip account discriminator
  const readPubkey = () => {
    const pk = new PublicKey(data.subarray(o, o + 32));
    o += 32;
    return pk;
  };
  const readU64 = () => {
    const v = data.readBigUInt64LE(o);
    o += 8;
    return v;
  };
  const mint = readPubkey();
  const creator = readPubkey();
  const virtualSolReserves = readU64();
  const virtualTokenReserves = readU64();
  const realSolReserves = readU64();
  const realTokenReserves = readU64();
  const tokenTotalSupply = readU64();
  const complete = data.readUInt8(o) === 1;
  o += 1;
  const migrated = data.readUInt8(o) === 1;
  o += 1;
  const createdAt = readU64(); // i64 on-chain, always positive here; read as unsigned is exact for any realistic timestamp
  const bump = data.readUInt8(o);
  return {
    mint,
    creator,
    virtualSolReserves,
    virtualTokenReserves,
    realSolReserves,
    realTokenReserves,
    tokenTotalSupply,
    complete,
    migrated,
    createdAt,
    bump,
  };
}

/*
 * Event log decoding. anchor-lang's `emit!` macro (used throughout
 * programs/zrp-launchpad/src/lib.rs, never the newer `emit_cpi!`, so there
 * is no extra __event_authority account or inner-instruction indirection
 * to walk) writes each event via `sol_log_data`, which shows up in a
 * confirmed transaction's own `meta.logMessages` as a line of the exact
 * form `Program data: <base64>`. The decoded bytes are the same
 * discriminator+Borsh-fields shape as an instruction, just under Anchor's
 * "event:" sighash namespace instead of "global:". This never trusts a
 * client's claimed event - it only ever runs against
 * `meta.logMessages` fetched directly from a transaction the RPC node
 * itself confirmed.
 */

export interface ParsedTokenCreatedEvent {
  mint: PublicKey;
  creator: PublicKey;
  bondingCurve: PublicKey;
  name: string;
  symbol: string;
  uri: string;
  virtualSolReserves: bigint;
  virtualTokenReserves: bigint;
  tokenTotalSupply: bigint;
  timestamp: bigint;
}

export interface ParsedZrpTradeEvent {
  mint: PublicKey;
  trader: PublicKey;
  isBuy: boolean;
  solAmount: bigint;
  tokenAmount: bigint;
  feeLamports: bigint;
  virtualSolReserves: bigint;
  virtualTokenReserves: bigint;
  realSolReserves: bigint;
  realTokenReserves: bigint;
  timestamp: bigint;
}

export interface ParsedZrpGraduateEvent {
  mint: PublicKey;
  bondingCurve: PublicKey;
  realSolReservesMigrated: bigint;
  realTokenReservesMigrated: bigint;
  migrationAuthority: PublicKey;
  timestamp: bigint;
}

class FieldReader {
  private o = 0;
  constructor(private data: Buffer) {}
  pubkey(): PublicKey {
    const pk = new PublicKey(this.data.subarray(this.o, this.o + 32));
    this.o += 32;
    return pk;
  }
  u64(): bigint {
    const v = this.data.readBigUInt64LE(this.o);
    this.o += 8;
    return v;
  }
  bool(): boolean {
    const v = this.data.readUInt8(this.o) === 1;
    this.o += 1;
    return v;
  }
  string(): string {
    const len = this.data.readUInt32LE(this.o);
    this.o += 4;
    const s = this.data.subarray(this.o, this.o + len).toString("utf8");
    this.o += len;
    return s;
  }
}

async function findEventLogs(
  logMessages: string[],
  eventName: string
): Promise<Buffer[]> {
  const discriminator = await anchorDiscriminator("event", eventName);
  const matches: Buffer[] = [];
  for (const line of logMessages) {
    if (!line.startsWith("Program data: ")) continue;
    let decoded: Buffer;
    try {
      decoded = Buffer.from(line.slice("Program data: ".length).trim(), "base64");
    } catch {
      continue;
    }
    if (decoded.length < 8) continue;
    if (decoded.subarray(0, 8).equals(discriminator)) {
      matches.push(decoded.subarray(8));
    }
  }
  return matches;
}

export async function parseTokenCreatedEvents(logMessages: string[]): Promise<ParsedTokenCreatedEvent[]> {
  const bodies = await findEventLogs(logMessages, "TokenCreatedEvent");
  return bodies.map((body) => {
    const r = new FieldReader(body);
    const mint = r.pubkey();
    const creator = r.pubkey();
    const bondingCurve = r.pubkey();
    const name = r.string();
    const symbol = r.string();
    const uri = r.string();
    const virtualSolReserves = r.u64();
    const virtualTokenReserves = r.u64();
    const tokenTotalSupply = r.u64();
    const timestamp = r.u64();
    return {
      mint,
      creator,
      bondingCurve,
      name,
      symbol,
      uri,
      virtualSolReserves,
      virtualTokenReserves,
      tokenTotalSupply,
      timestamp,
    };
  });
}

export async function parseTradeEvents(logMessages: string[]): Promise<ParsedZrpTradeEvent[]> {
  const bodies = await findEventLogs(logMessages, "TradeEvent");
  return bodies.map((body) => {
    const r = new FieldReader(body);
    const mint = r.pubkey();
    const trader = r.pubkey();
    const isBuy = r.bool();
    const solAmount = r.u64();
    const tokenAmount = r.u64();
    const feeLamports = r.u64();
    const virtualSolReserves = r.u64();
    const virtualTokenReserves = r.u64();
    const realSolReserves = r.u64();
    const realTokenReserves = r.u64();
    const timestamp = r.u64();
    return {
      mint,
      trader,
      isBuy,
      solAmount,
      tokenAmount,
      feeLamports,
      virtualSolReserves,
      virtualTokenReserves,
      realSolReserves,
      realTokenReserves,
      timestamp,
    };
  });
}

export async function parseGraduateEvents(logMessages: string[]): Promise<ParsedZrpGraduateEvent[]> {
  const bodies = await findEventLogs(logMessages, "GraduateEvent");
  return bodies.map((body) => {
    const r = new FieldReader(body);
    const mint = r.pubkey();
    const bondingCurve = r.pubkey();
    const realSolReservesMigrated = r.u64();
    const realTokenReservesMigrated = r.u64();
    const migrationAuthority = r.pubkey();
    const timestamp = r.u64();
    return {
      mint,
      bondingCurve,
      realSolReservesMigrated,
      realTokenReservesMigrated,
      migrationAuthority,
      timestamp,
    };
  });
}
