/*
 * Real ZRP Launchpad bonding-curve reads and independent trade/graduation
 * verification - the ZRP-native counterpart to pump-curve-service.ts.
 * Every figure here is decoded live from the actual on-chain
 * GlobalConfig/BondingCurve accounts of ZRP's own program
 * (programs/zrp-launchpad/), or derived from an already-confirmed
 * transaction's own decoded Anchor events - never a database simulation
 * of curve state and never a client-reported amount taken on trust. The
 * database (`LaunchedToken`/`GraduationEvent`) is an index of this state,
 * never the other way around - see CLAUDE.md "Database" and
 * docs/zrp-launchpad-deployment.md.
 *
 * Unlike the Pump.fun integration this replaces, graduation here is fully
 * deterministic: `BondingCurve.complete`/`migrated` are read directly off
 * the account with no heuristic "last activity" fallback, and the exact
 * migrated amounts come from this program's own `GraduateEvent` - there is
 * no separate, uncertain migration search the way Pump.fun's PumpSwap
 * migration required.
 */

import {
  Connection,
  PublicKey,
  TransactionResponse,
  VersionedTransactionResponse,
} from "@solana/web3.js";
import { getAssociatedTokenAddressSync, TOKEN_PROGRAM_ID, ASSOCIATED_TOKEN_PROGRAM_ID } from "@solana/spl-token";
import {
  ZRP_LAUNCH_PROGRAM_ID,
  deriveZrpLaunchKeys,
  decodeGlobalConfig,
  decodeBondingCurve,
  quoteZrpBuy,
  quoteZrpSell,
  parseTokenCreatedEvents,
  parseTradeEvents,
  parseGraduateEvents,
  DecodedGlobalConfig,
} from "./zrp-launch-keys";

// The real Pump.fun mainnet program ID - the acceptance test (spec
// section 28/29): a ZRP-native transaction must never invoke it.
const PUMP_FUN_PROGRAM_ID = "6EF8rrecthR5Dkzon8Nwu78hRvfCKubJ14M5uBEwF6P";
const ZERO = BigInt(0);

/*
 * ============================================================
 * GlobalConfig cache - mirrors pump-curve-service.ts's own 30s in-process
 * TTL cache exactly. It changes only through a rare admin update_config
 * call, so caching avoids an extra RPC round-trip on every curve read/
 * quote while still picking up a real change within half a minute. A
 * failed fetch is never cached.
 * ============================================================
 */
const CACHE_TTL_MS = 30_000;
let globalConfigCache: { result: DecodedGlobalConfig; expiresAt: number } | null = null;

async function getCachedGlobalConfig(connection: Connection): Promise<DecodedGlobalConfig> {
  const now = Date.now();
  if (globalConfigCache && globalConfigCache.expiresAt > now) return globalConfigCache.result;
  const { globalConfig } = deriveZrpLaunchKeys(PublicKey.default);
  const accountInfo = await connection.getAccountInfo(globalConfig);
  if (!accountInfo) throw new Error("ZRP Launchpad GlobalConfig account not found - the program has not been initialized on this cluster.");
  const result = decodeGlobalConfig(accountInfo.data);
  globalConfigCache = { result, expiresAt: now + CACHE_TTL_MS };
  return result;
}

export type ZrpCurveStateStatus = "OK" | "NO_CURVE" | "UNAVAILABLE";

export interface ZrpCurveState {
  status: ZrpCurveStateStatus;
  reason: string | null;
  bondingCurveAddress: string;
  graduated: boolean;
  migrated: boolean;
  virtualTokenReservesRaw: string | null;
  virtualSolLamports: string | null;
  realTokenReservesRaw: string | null;
  realSolLamports: string | null;
  priceDisplay: string | null;
  progressBps: number | null;
  tokenTotalSupplyRaw: string | null;
  graduationSolTargetLamports: string | null;
}

function emptyCurveState(bondingCurveAddress: PublicKey, status: ZrpCurveStateStatus, reason: string | null): ZrpCurveState {
  return {
    status,
    reason,
    bondingCurveAddress: bondingCurveAddress.toBase58(),
    graduated: false,
    migrated: false,
    virtualTokenReservesRaw: null,
    virtualSolLamports: null,
    realTokenReservesRaw: null,
    realSolLamports: null,
    priceDisplay: null,
    progressBps: null,
    tokenTotalSupplyRaw: null,
    graduationSolTargetLamports: null,
  };
}

function formatExactRatio(numerator: bigint, denominator: bigint, precision = 18): string {
  if (denominator <= ZERO) return "0";
  let scale = BigInt(1);
  for (let i = 0; i < precision; i += 1) scale *= BigInt(10);
  const scaled = (numerator * scale) / denominator;
  const digits = scaled.toString().padStart(precision + 1, "0");
  const intPart = digits.slice(0, digits.length - precision) || "0";
  const fracPart = digits.slice(digits.length - precision).replace(/0+$/, "");
  return fracPart ? `${intPart}.${fracPart}` : intPart;
}

/**
 * Live curve state for a mint, read directly from chain with a short
 * cache (GlobalConfig only - BondingCurve is always read fresh since its
 * reserves change on every trade). `graduated: true` means the real
 * on-chain `complete` flag is set - the UI must hide every buy/sell
 * control the moment this is true, never show a curve alongside a
 * post-graduation pool.
 */
export async function getZrpCurveState(connection: Connection, mintAddress: string): Promise<ZrpCurveState> {
  const mint = new PublicKey(mintAddress);
  const { bondingCurve: bondingCurveAddress } = deriveZrpLaunchKeys(mint);
  try {
    const curveAccountInfo = await connection.getAccountInfo(bondingCurveAddress);
    if (!curveAccountInfo) return emptyCurveState(bondingCurveAddress, "NO_CURVE", "This mint has no ZRP bonding curve.");

    const [config, curve] = await Promise.all([
      getCachedGlobalConfig(connection),
      Promise.resolve(decodeBondingCurve(curveAccountInfo.data)),
    ]);

    const progressBps = curve.complete
      ? 10_000
      : config.graduationSolTarget > ZERO
        ? Number((curve.realSolReserves * BigInt(10_000)) / config.graduationSolTarget)
        : 0;

    return {
      status: "OK",
      reason: null,
      bondingCurveAddress: bondingCurveAddress.toBase58(),
      graduated: curve.complete,
      migrated: curve.migrated,
      virtualTokenReservesRaw: curve.virtualTokenReserves.toString(),
      virtualSolLamports: curve.virtualSolReserves.toString(),
      realTokenReservesRaw: curve.realTokenReserves.toString(),
      realSolLamports: curve.realSolReserves.toString(),
      priceDisplay: formatExactRatio(curve.virtualSolReserves, curve.virtualTokenReserves),
      progressBps: Math.min(progressBps, 10_000),
      tokenTotalSupplyRaw: curve.tokenTotalSupply.toString(),
      graduationSolTargetLamports: config.graduationSolTarget.toString(),
    };
  } catch (error: unknown) {
    return emptyCurveState(bondingCurveAddress, "UNAVAILABLE", error instanceof Error ? error.message : "RPC_UNAVAILABLE");
  }
}

export interface ZrpCurveQuote {
  status: "OK" | "NO_CURVE" | "GRADUATED" | "UNAVAILABLE";
  reason: string | null;
  tokenAmountRaw: string | null;
  solAmountLamports: string | null;
  feeLamports: string | null;
  minimumReceivedRaw: string | null;
}

function emptyQuote(status: ZrpCurveQuote["status"], reason: string | null): ZrpCurveQuote {
  return { status, reason, tokenAmountRaw: null, solAmountLamports: null, feeLamports: null, minimumReceivedRaw: null };
}

/** A buy quote: how many tokens `solLamports` buys right now, plus the on-chain fee - exact same math as programs/zrp-launchpad/src/math.rs::compute_buy. */
export async function getZrpBuyQuote(
  connection: Connection,
  mintAddress: string,
  solLamports: bigint,
  slippageBps: number
): Promise<ZrpCurveQuote> {
  try {
    const mint = new PublicKey(mintAddress);
    const { bondingCurve: bondingCurveAddress } = deriveZrpLaunchKeys(mint);
    const [config, curveAccountInfo] = await Promise.all([
      getCachedGlobalConfig(connection),
      connection.getAccountInfo(bondingCurveAddress),
    ]);
    if (!curveAccountInfo) return emptyQuote("NO_CURVE", "This mint has no ZRP bonding curve.");
    const curve = decodeBondingCurve(curveAccountInfo.data);
    if (curve.complete) return emptyQuote("GRADUATED", "This token has already graduated off the curve.");

    const { tokenOut, feeLamports } = quoteZrpBuy(curve.virtualSolReserves, curve.virtualTokenReserves, solLamports, config.buyFeeBps);
    const minimumReceivedRaw = (tokenOut * BigInt(10_000 - slippageBps)) / BigInt(10_000);
    return {
      status: "OK",
      reason: null,
      tokenAmountRaw: tokenOut.toString(),
      solAmountLamports: solLamports.toString(),
      feeLamports: feeLamports.toString(),
      minimumReceivedRaw: (minimumReceivedRaw < ZERO ? ZERO : minimumReceivedRaw).toString(),
    };
  } catch (error: unknown) {
    return emptyQuote("UNAVAILABLE", error instanceof Error ? error.message : "RPC_UNAVAILABLE");
  }
}

/** A quote against a curve that does not exist yet - the "optional initial buy" step of create_and_buy, using GlobalConfig's own configured starting reserves. */
export async function getZrpInitialBuyQuote(connection: Connection, solLamports: bigint, slippageBps: number): Promise<ZrpCurveQuote> {
  try {
    const config = await getCachedGlobalConfig(connection);
    const { tokenOut, feeLamports } = quoteZrpBuy(
      config.initialVirtualSolReserves,
      config.initialVirtualTokenReserves,
      solLamports,
      config.buyFeeBps
    );
    const minimumReceivedRaw = (tokenOut * BigInt(10_000 - slippageBps)) / BigInt(10_000);
    return {
      status: "OK",
      reason: null,
      tokenAmountRaw: tokenOut.toString(),
      solAmountLamports: solLamports.toString(),
      feeLamports: feeLamports.toString(),
      minimumReceivedRaw: (minimumReceivedRaw < ZERO ? ZERO : minimumReceivedRaw).toString(),
    };
  } catch (error: unknown) {
    return emptyQuote("UNAVAILABLE", error instanceof Error ? error.message : "RPC_UNAVAILABLE");
  }
}

/** A sell quote: how much SOL `tokenAmountRaw` tokens sells for right now, minus the on-chain fee. */
export async function getZrpSellQuote(
  connection: Connection,
  mintAddress: string,
  tokenAmountRaw: bigint,
  slippageBps: number
): Promise<ZrpCurveQuote> {
  try {
    const mint = new PublicKey(mintAddress);
    const { bondingCurve: bondingCurveAddress } = deriveZrpLaunchKeys(mint);
    const [config, curveAccountInfo] = await Promise.all([
      getCachedGlobalConfig(connection),
      connection.getAccountInfo(bondingCurveAddress),
    ]);
    if (!curveAccountInfo) return emptyQuote("NO_CURVE", "This mint has no ZRP bonding curve.");
    const curve = decodeBondingCurve(curveAccountInfo.data);
    if (curve.complete) return emptyQuote("GRADUATED", "This token has already graduated off the curve.");

    const { solOut, feeLamports } = quoteZrpSell(curve.virtualSolReserves, curve.virtualTokenReserves, tokenAmountRaw, config.sellFeeBps);
    const minimumReceivedRaw = (solOut * BigInt(10_000 - slippageBps)) / BigInt(10_000);
    return {
      status: "OK",
      reason: null,
      tokenAmountRaw: tokenAmountRaw.toString(),
      solAmountLamports: solOut.toString(),
      feeLamports: feeLamports.toString(),
      minimumReceivedRaw: (minimumReceivedRaw < ZERO ? ZERO : minimumReceivedRaw).toString(),
    };
  } catch (error: unknown) {
    return emptyQuote("UNAVAILABLE", error instanceof Error ? error.message : "RPC_UNAVAILABLE");
  }
}

/*
 * ============================================================
 * Independent on-chain verification - never trust a client's claimed
 * signature/mint/creator/amount/program. Every function below re-fetches
 * the real confirmed transaction and decodes ZRP's own Anchor events out
 * of its logs (see zrp-launch-keys.ts's module comment on why that is
 * hand-decoded rather than IDL-driven), then additionally asserts the
 * transaction's account keys include ZRP_LAUNCH_PROGRAM_ID and do NOT
 * include Pump.fun's mainnet program ID - the acceptance test spec
 * section 28/29 explicitly requires.
 * ============================================================
 */

export type ZrpVerificationStatus = "VERIFIED" | "NOT_FOUND_YET" | "ON_CHAIN_FAILURE";

export class ZrpVerificationError extends Error {
  status: ZrpVerificationStatus;
  constructor(status: ZrpVerificationStatus, message: string) {
    super(message);
    this.name = "ZrpVerificationError";
    this.status = status;
  }
}

async function fetchConfirmedTransaction(
  connection: Connection,
  signature: string
): Promise<TransactionResponse | VersionedTransactionResponse> {
  const tx = await connection.getTransaction(signature, { commitment: "confirmed", maxSupportedTransactionVersion: 0 });
  if (!tx) {
    throw new ZrpVerificationError("NOT_FOUND_YET", "Transaction not found yet. It may still be propagating.");
  }
  if (tx.meta?.err) {
    throw new ZrpVerificationError("ON_CHAIN_FAILURE", `Transaction failed on-chain: ${JSON.stringify(tx.meta.err)}`);
  }
  return tx;
}

function getStaticAccountKeys(tx: TransactionResponse | VersionedTransactionResponse): PublicKey[] {
  const message = tx.transaction.message as { getAccountKeys?: () => { staticAccountKeys: PublicKey[] }; accountKeys?: PublicKey[] };
  return message.getAccountKeys ? message.getAccountKeys().staticAccountKeys : (message.accountKeys ?? []);
}

/**
 * The acceptance test itself (spec section 28/29): asserts the real,
 * already-confirmed transaction names ZRP's own program and never names
 * Pump.fun's. Called by every verify* function below before trusting
 * anything else about the transaction.
 */
function assertZrpProgramOnly(accountKeys: PublicKey[]): void {
  const hasZrpProgram = accountKeys.some((k) => k.equals(ZRP_LAUNCH_PROGRAM_ID));
  if (!hasZrpProgram) {
    throw new ZrpVerificationError("ON_CHAIN_FAILURE", "Transaction does not reference the ZRP Launchpad program.");
  }
  const hasPumpFun = accountKeys.some((k) => k.toBase58() === PUMP_FUN_PROGRAM_ID);
  if (hasPumpFun) {
    throw new ZrpVerificationError("ON_CHAIN_FAILURE", "Transaction references Pump.fun's program - this is not a valid ZRP-native transaction.");
  }
}

function requireAccountIndex(keys: PublicKey[], target: PublicKey, label: string): number {
  const index = keys.findIndex((k) => k.equals(target));
  if (index === -1) {
    throw new ZrpVerificationError("ON_CHAIN_FAILURE", `Transaction does not reference the expected ${label} account.`);
  }
  return index;
}

export interface VerifiedZrpCreate {
  name: string;
  symbol: string;
  uri: string;
  bondingCurveAddress: string;
  tokenTotalSupplyRaw: string;
  blockTime: Date | null;
  slot: number;
}

/**
 * Confirms `signature` is a real ZRP `create_and_buy` transaction for
 * `mintAddress` by the claimed wallet, and returns the exact name/symbol/
 * uri/supply ZRP's own program recorded in its `TokenCreatedEvent` - never
 * the client's submitted display fields.
 */
export async function verifyZrpCreateTransaction(
  connection: Connection,
  signature: string,
  params: { mintAddress: string; walletAddress: string }
): Promise<VerifiedZrpCreate> {
  const mint = new PublicKey(params.mintAddress);
  const wallet = new PublicKey(params.walletAddress);

  const tx = await fetchConfirmedTransaction(connection, signature);
  const accountKeys = getStaticAccountKeys(tx);
  assertZrpProgramOnly(accountKeys);

  const mintIndex = requireAccountIndex(accountKeys, mint, "mint");
  if (!tx.transaction.message.isAccountSigner(mintIndex)) {
    throw new ZrpVerificationError("ON_CHAIN_FAILURE", "The claimed mint did not sign this transaction.");
  }
  const walletIndex = requireAccountIndex(accountKeys, wallet, "wallet");
  if (!tx.transaction.message.isAccountSigner(walletIndex)) {
    throw new ZrpVerificationError("ON_CHAIN_FAILURE", "Claimed wallet did not sign this transaction.");
  }

  const logMessages = tx.meta?.logMessages ?? [];
  const events = await parseTokenCreatedEvents(logMessages);
  const event = events.find((e) => e.mint.equals(mint));
  if (!event) {
    throw new ZrpVerificationError("ON_CHAIN_FAILURE", "No TokenCreatedEvent found for this mint in the transaction logs.");
  }
  if (!event.creator.equals(wallet)) {
    throw new ZrpVerificationError("ON_CHAIN_FAILURE", "The claimed wallet is not this token's on-chain creator.");
  }

  return {
    name: event.name,
    symbol: event.symbol,
    uri: event.uri,
    bondingCurveAddress: event.bondingCurve.toBase58(),
    tokenTotalSupplyRaw: event.tokenTotalSupply.toString(),
    blockTime: tx.blockTime ? new Date(tx.blockTime * 1000) : null,
    slot: tx.slot,
  };
}

export interface VerifiedZrpTrade {
  side: "BUY" | "SELL";
  tokenAmountRaw: bigint;
  solAmountLamports: bigint;
  feeLamports: bigint;
  blockTime: Date;
  slot: number;
}

/**
 * Confirms `signature` is a real ZRP `buy`/`sell` transaction for
 * `mintAddress` by the claimed wallet, and returns the exact traded
 * amounts ZRP's own program recorded in its `TradeEvent` - never the
 * client's claimed amounts.
 */
export async function verifyZrpTradeTransaction(
  connection: Connection,
  signature: string,
  params: { mintAddress: string; walletAddress: string; expectedSide: "BUY" | "SELL" }
): Promise<VerifiedZrpTrade> {
  const mint = new PublicKey(params.mintAddress);
  const wallet = new PublicKey(params.walletAddress);

  const tx = await fetchConfirmedTransaction(connection, signature);
  const accountKeys = getStaticAccountKeys(tx);
  assertZrpProgramOnly(accountKeys);

  const walletIndex = requireAccountIndex(accountKeys, wallet, "wallet");
  if (!tx.transaction.message.isAccountSigner(walletIndex)) {
    throw new ZrpVerificationError("ON_CHAIN_FAILURE", "Claimed wallet did not sign this transaction.");
  }

  const logMessages = tx.meta?.logMessages ?? [];
  const events = await parseTradeEvents(logMessages);
  const event = events.find((e) => e.mint.equals(mint));
  if (!event) {
    throw new ZrpVerificationError("ON_CHAIN_FAILURE", "No TradeEvent found for this mint in the transaction logs.");
  }
  if (!event.trader.equals(wallet)) {
    throw new ZrpVerificationError("ON_CHAIN_FAILURE", "The claimed wallet is not this trade's on-chain trader.");
  }
  const side: "BUY" | "SELL" = event.isBuy ? "BUY" : "SELL";
  if (side !== params.expectedSide) {
    throw new ZrpVerificationError("ON_CHAIN_FAILURE", `Expected a ${params.expectedSide} but this transaction was a ${side}.`);
  }

  return {
    side,
    tokenAmountRaw: event.tokenAmount,
    solAmountLamports: event.solAmount,
    feeLamports: event.feeLamports,
    blockTime: new Date(Number(event.timestamp) * 1000),
    slot: tx.slot,
  };
}

/*
 * ============================================================
 * Graduation - fully deterministic, unlike Pump.fun's heuristic/search-
 * based detection. `BondingCurve.complete`/`migrated` are the program's
 * own authoritative flags, read directly; no "last activity" inference is
 * ever needed to know WHETHER a curve graduated. A bounded signature
 * search is still provided (findZrpGraduateEvent) for the rarer case
 * where `graduate()` was called by someone other than ZRP's own API
 * (it is permissionless) and so no signature was recorded synchronously.
 * ============================================================
 */
export interface ZrpGraduationCheck {
  graduated: boolean;
  migrated: boolean;
  bondingCurveAddress: string;
  realSolReservesLamports: string;
  realTokenReservesRaw: string;
}

export async function checkZrpGraduation(connection: Connection, mintAddress: string): Promise<ZrpGraduationCheck> {
  const mint = new PublicKey(mintAddress);
  const { bondingCurve: bondingCurveAddress } = deriveZrpLaunchKeys(mint);
  const empty = (): ZrpGraduationCheck => ({
    graduated: false,
    migrated: false,
    bondingCurveAddress: bondingCurveAddress.toBase58(),
    realSolReservesLamports: "0",
    realTokenReservesRaw: "0",
  });

  const curveAccountInfo = await connection.getAccountInfo(bondingCurveAddress);
  if (!curveAccountInfo) return empty();
  const curve = decodeBondingCurve(curveAccountInfo.data);
  return {
    graduated: curve.complete,
    migrated: curve.migrated,
    bondingCurveAddress: bondingCurveAddress.toBase58(),
    realSolReservesLamports: curve.realSolReserves.toString(),
    realTokenReservesRaw: curve.realTokenReserves.toString(),
  };
}

export interface VerifiedZrpGraduation {
  realSolReservesMigratedLamports: string;
  realTokenReservesMigratedRaw: string;
  migrationAuthority: string;
  signature: string;
  slot: number;
  blockTime: Date | null;
}

/** Confirms `signature` is a real ZRP `graduate` transaction for `mintAddress`, and returns the exact swept amounts from its on-chain `GraduateEvent`. */
export async function verifyZrpGraduateTransaction(
  connection: Connection,
  signature: string,
  mintAddress: string
): Promise<VerifiedZrpGraduation> {
  const mint = new PublicKey(mintAddress);
  const tx = await fetchConfirmedTransaction(connection, signature);
  const accountKeys = getStaticAccountKeys(tx);
  assertZrpProgramOnly(accountKeys);

  const logMessages = tx.meta?.logMessages ?? [];
  const events = await parseGraduateEvents(logMessages);
  const event = events.find((e) => e.mint.equals(mint));
  if (!event) {
    throw new ZrpVerificationError("ON_CHAIN_FAILURE", "No GraduateEvent found for this mint in the transaction logs.");
  }

  return {
    realSolReservesMigratedLamports: event.realSolReservesMigrated.toString(),
    realTokenReservesMigratedRaw: event.realTokenReservesMigrated.toString(),
    migrationAuthority: event.migrationAuthority.toBase58(),
    signature,
    slot: tx.slot,
    blockTime: tx.blockTime ? new Date(tx.blockTime * 1000) : null,
  };
}

// Mirrors pump-curve-service.ts's own bounded search shape exactly - see
// its comment for why each bound exists. Only reached when a curve shows
// migrated=true (checkZrpGraduation) but no GraduationEvent row exists yet
// for it, i.e. `graduate()` was called out-of-band.
const MIGRATION_SEARCH_PAGE_SIZE = 25;
const MIGRATION_SEARCH_MAX_PAGES = 4;
const MIGRATION_SEARCH_MAX_TRANSACTIONS = 40;
export const MIGRATION_SEARCH_COOLDOWN_MS = 5 * 60 * 1000;

export async function findZrpGraduateEvent(connection: Connection, mintAddress: string): Promise<VerifiedZrpGraduation | null> {
  const mint = new PublicKey(mintAddress);
  const { bondingCurve } = deriveZrpLaunchKeys(mint);

  let before: string | undefined;
  let transactionsFetched = 0;

  for (let page = 0; page < MIGRATION_SEARCH_MAX_PAGES; page += 1) {
    const signatures = await connection.getSignaturesForAddress(bondingCurve, { limit: MIGRATION_SEARCH_PAGE_SIZE, before });
    if (signatures.length === 0) break;

    for (const sigInfo of signatures) {
      if (sigInfo.err) continue;
      if (transactionsFetched >= MIGRATION_SEARCH_MAX_TRANSACTIONS) break;
      transactionsFetched += 1;

      let tx;
      try {
        tx = await connection.getTransaction(sigInfo.signature, { commitment: "confirmed", maxSupportedTransactionVersion: 0 });
      } catch {
        continue;
      }
      if (!tx?.meta?.logMessages) continue;
      const events = await parseGraduateEvents(tx.meta.logMessages);
      const event = events.find((e) => e.mint.equals(mint));
      if (!event) continue;
      return {
        realSolReservesMigratedLamports: event.realSolReservesMigrated.toString(),
        realTokenReservesMigratedRaw: event.realTokenReservesMigrated.toString(),
        migrationAuthority: event.migrationAuthority.toBase58(),
        signature: sigInfo.signature,
        slot: tx.slot,
        blockTime: tx.blockTime ? new Date(tx.blockTime * 1000) : null,
      };
    }

    if (transactionsFetched >= MIGRATION_SEARCH_MAX_TRANSACTIONS) break;
    if (signatures.length < MIGRATION_SEARCH_PAGE_SIZE) break;
    before = signatures[signatures.length - 1].signature;
  }
  return null;
}

// Re-exported for routes that need the curve/vault addresses without
// pulling in the rest of zrp-launch-keys.ts's surface.
export { deriveZrpLaunchKeys, ZRP_LAUNCH_PROGRAM_ID };
export function getZrpCurveTokenVault(mintAddress: string): PublicKey {
  const mint = new PublicKey(mintAddress);
  const { bondingCurve } = deriveZrpLaunchKeys(mint);
  return getAssociatedTokenAddressSync(mint, bondingCurve, true, TOKEN_PROGRAM_ID, ASSOCIATED_TOKEN_PROGRAM_ID);
}
