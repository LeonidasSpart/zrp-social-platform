/*
 * Real pump.fun bonding-curve reads and independent trade/graduation
 * verification - the bonding-curve counterpart to raydium-pool-service.ts
 * and pool-liquidity-reader.ts. Every figure here is decoded live from the
 * actual on-chain BondingCurve/Global/FeeConfig accounts via the official
 * @pump-fun/pump-sdk, or derived from an already-confirmed transaction's
 * real balance deltas - never a database simulation of curve state and
 * never a client-reported amount taken on trust.
 *
 * Scope: this module targets pump's classic, legacy (SOL-quoted) bonding
 * curve only - the `buy`/`sell` instructions and `PublicKey.default`/
 * NATIVE_MINT quote mint, which is what the SDK's own doc comments say is
 * "unchanged from earlier SDK versions" and is the overwhelming majority
 * of real pump.fun tokens. Mayhem-mode coins, holder-reward coins,
 * cashback, non-SOL quote-control mints, and the agent-payments buyback
 * feature are all real protocol features this module does not attempt -
 * a curve using any of them is reported as UNSUPPORTED_CURVE_VARIANT
 * rather than silently mis-read or mis-traded. See the final delivery
 * report's "Remaining limitations" section.
 */

import { Connection, PublicKey, TransactionResponse, VersionedTransactionResponse } from "@solana/web3.js";
import { getAssociatedTokenAddressSync, TOKEN_PROGRAM_ID } from "@solana/spl-token";
import BN from "bn.js";
import {
  PumpSdk,
  Global,
  BondingCurve,
  FeeConfig,
  getBuyTokenAmountFromSolAmount,
  getSellSolAmountFromTokenAmount,
  computeFeesBps,
  getFee,
  bondingCurveMarketCap,
  newBondingCurve,
  PUMP_PROGRAM_ID,
} from "@pump-fun/pump-sdk";
import {
  bondingCurvePda,
  canonicalPumpPoolPda,
  GLOBAL_PDA,
  PUMP_FEE_CONFIG_PDA,
  CURVE_TOKEN_PROGRAM_ID,
  bnToBigInt,
  bigIntToBn,
  curveProgressBps,
  formatExactRatio,
} from "./pump-curve-keys";
import { parseCreateEvent, parseMigrationEvent } from "./pump-event-service";

const PUMP_SDK = new PumpSdk();
const ZERO = BigInt(0);

/*
 * ============================================================
 * Global / FeeConfig cache - mirrors token-analytics.ts's own 30s
 * in-process TTL cache exactly. Global and FeeConfig change only through
 * rare pump-fun admin actions (fee-schedule updates), so caching them
 * avoids two extra RPC round-trips on every curve read/quote while still
 * picking up a real change within half a minute. A failed fetch is never
 * cached - see getCachedGlobal/getCachedFeeConfig.
 * ============================================================
 */
const CACHE_TTL_MS = 30_000;
let globalCache: { result: Global; expiresAt: number } | null = null;
let feeConfigCache: { result: FeeConfig | null; expiresAt: number } | null = null;

async function getCachedGlobal(connection: Connection): Promise<Global> {
  const now = Date.now();
  if (globalCache && globalCache.expiresAt > now) return globalCache.result;
  const accountInfo = await connection.getAccountInfo(GLOBAL_PDA);
  if (!accountInfo) throw new Error("pump Global account not found.");
  const result = PUMP_SDK.decodeGlobal(accountInfo);
  globalCache = { result, expiresAt: now + CACHE_TTL_MS };
  return result;
}

async function getCachedFeeConfig(connection: Connection): Promise<FeeConfig | null> {
  const now = Date.now();
  if (feeConfigCache && feeConfigCache.expiresAt > now) return feeConfigCache.result;
  const accountInfo = await connection.getAccountInfo(PUMP_FEE_CONFIG_PDA);
  const result = accountInfo ? PUMP_SDK.decodeFeeConfig(accountInfo) : null;
  feeConfigCache = { result, expiresAt: now + CACHE_TTL_MS };
  return result;
}

function isSupportedCurveVariant(bondingCurve: BondingCurve): boolean {
  // mayhemMode/holderReward/cashback curves use extra accounts and fee
  // paths this module's buy/sell verification does not model - see the
  // module comment.
  return !bondingCurve.isMayhemMode && !bondingCurve.isHolderReward && !bondingCurve.isCashbackCoin;
}

export type CurveStateStatus =
  | "OK"
  | "NO_CURVE"
  | "UNSUPPORTED_CURVE_VARIANT"
  | "UNAVAILABLE";

export interface CurveState {
  status: CurveStateStatus;
  reason: string | null;
  bondingCurveAddress: string;
  graduated: boolean;
  virtualTokenReservesRaw: string | null;
  virtualQuoteLamports: string | null;
  realTokenReservesRaw: string | null;
  realQuoteLamports: string | null;
  // Exact integer numerator/denominator of the spot price (quote lamports
  // per 1 raw token unit) - see formatExactRatio for why this is not a
  // single pre-divided number.
  priceQuoteLamports: string | null;
  priceTokenRaw: string | null;
  priceDisplay: string | null;
  progressBps: number | null;
  marketCapLamports: string | null;
  tokenTotalSupplyRaw: string | null;
}

/**
 * Live curve state for a mint, read directly from chain with a short
 * cache (see getCachedGlobal). `graduated: true` means the real on-chain
 * `complete` flag is set - the UI must hide every buy/sell/curve-progress
 * control the moment this is true, never show a curve alongside a
 * post-graduation pool.
 */
export async function getCurveState(connection: Connection, mintAddress: string): Promise<CurveState> {
  const bondingCurveAddress = bondingCurvePda(new PublicKey(mintAddress));
  const empty = (status: CurveStateStatus, reason: string | null): CurveState => ({
    status,
    reason,
    bondingCurveAddress: bondingCurveAddress.toBase58(),
    graduated: false,
    virtualTokenReservesRaw: null,
    virtualQuoteLamports: null,
    realTokenReservesRaw: null,
    realQuoteLamports: null,
    priceQuoteLamports: null,
    priceTokenRaw: null,
    priceDisplay: null,
    progressBps: null,
    marketCapLamports: null,
    tokenTotalSupplyRaw: null,
  });

  try {
    // Checked before fetching Global: a mint with no bonding curve at all
    // is the overwhelmingly common case (any plain, non-pump token), and
    // it must report NO_CURVE even if the unrelated Global singleton
    // fetch would itself fail - that failure is only relevant once a
    // curve actually exists to read reserves/progress against.
    const curveAccountInfo = await connection.getAccountInfo(bondingCurveAddress);
    if (!curveAccountInfo) return empty("NO_CURVE", "This mint has no pump bonding curve.");

    const global = await getCachedGlobal(connection);
    const bondingCurve = PUMP_SDK.decodeBondingCurveNullable(curveAccountInfo);
    if (!bondingCurve) return empty("UNAVAILABLE", "Bonding curve account could not be decoded.");
    if (!isSupportedCurveVariant(bondingCurve)) {
      return empty("UNSUPPORTED_CURVE_VARIANT", "This curve uses a mayhem/holder-reward/cashback variant not supported here.");
    }

    const virtualTokenReservesRaw = bnToBigInt(bondingCurve.virtualTokenReserves);
    const virtualQuoteLamports = bnToBigInt(bondingCurve.virtualQuoteReserves);
    const realTokenReservesRaw = bnToBigInt(bondingCurve.realTokenReserves);
    const realQuoteLamports = bnToBigInt(bondingCurve.realQuoteReserves);
    const tokenTotalSupplyRaw = bnToBigInt(bondingCurve.tokenTotalSupply);
    const initialRealTokenReservesRaw = bnToBigInt(global.initialRealTokenReserves);

    const marketCap = bondingCurveMarketCap({
      mintSupply: bondingCurve.tokenTotalSupply,
      virtualQuoteReserves: bondingCurve.virtualQuoteReserves,
      virtualTokenReserves: bondingCurve.virtualTokenReserves,
    });

    return {
      status: "OK",
      reason: null,
      bondingCurveAddress: bondingCurveAddress.toBase58(),
      graduated: bondingCurve.complete,
      virtualTokenReservesRaw: virtualTokenReservesRaw.toString(),
      virtualQuoteLamports: virtualQuoteLamports.toString(),
      realTokenReservesRaw: realTokenReservesRaw.toString(),
      realQuoteLamports: realQuoteLamports.toString(),
      priceQuoteLamports: virtualQuoteLamports.toString(),
      priceTokenRaw: virtualTokenReservesRaw.toString(),
      priceDisplay: formatExactRatio(virtualQuoteLamports, virtualTokenReservesRaw),
      progressBps: bondingCurve.complete
        ? 10_000
        : curveProgressBps(realTokenReservesRaw, initialRealTokenReservesRaw),
      marketCapLamports: bnToBigInt(marketCap).toString(),
      tokenTotalSupplyRaw: tokenTotalSupplyRaw.toString(),
    };
  } catch (error: unknown) {
    return empty("UNAVAILABLE", error instanceof Error ? error.message : "RPC_UNAVAILABLE");
  }
}

export interface CurveQuote {
  status: "OK" | "NO_CURVE" | "GRADUATED" | "UNSUPPORTED_CURVE_VARIANT" | "UNAVAILABLE";
  reason: string | null;
  tokenAmountRaw: string | null;
  solAmountLamports: string | null;
  protocolFeeLamports: string | null;
  creatorFeeLamports: string | null;
  totalFeeLamports: string | null;
  minimumReceivedRaw: string | null;
}

function emptyQuote(status: CurveQuote["status"], reason: string | null): CurveQuote {
  return {
    status,
    reason,
    tokenAmountRaw: null,
    solAmountLamports: null,
    protocolFeeLamports: null,
    creatorFeeLamports: null,
    totalFeeLamports: null,
    minimumReceivedRaw: null,
  };
}

async function loadCurveForQuote(
  connection: Connection,
  mintAddress: string
): Promise<{ global: Global; feeConfig: FeeConfig | null; bondingCurve: BondingCurve } | CurveQuote> {
  const bondingCurveAddress = bondingCurvePda(new PublicKey(mintAddress));
  // Checked before fetching Global/FeeConfig - see getCurveState's
  // identical ordering and comment for why.
  const curveAccountInfo = await connection.getAccountInfo(bondingCurveAddress);
  if (!curveAccountInfo) return emptyQuote("NO_CURVE", "This mint has no pump bonding curve.");
  const [global, feeConfig] = await Promise.all([getCachedGlobal(connection), getCachedFeeConfig(connection)]);
  const bondingCurve = PUMP_SDK.decodeBondingCurveNullable(curveAccountInfo);
  if (!bondingCurve) return emptyQuote("UNAVAILABLE", "Bonding curve account could not be decoded.");
  if (bondingCurve.complete) return emptyQuote("GRADUATED", "This token has already graduated off the curve.");
  if (!isSupportedCurveVariant(bondingCurve)) {
    return emptyQuote("UNSUPPORTED_CURVE_VARIANT", "This curve variant is not supported here.");
  }
  return { global, feeConfig, bondingCurve };
}

/**
 * Shared buy-quote math against any BondingCurve state (a live, existing
 * curve for getBuyQuote, or a synthetic freshly-initialized one for
 * getInitialBuyQuote) - extracted so both share the exact same fee/
 * slippage logic rather than risking the two drifting apart.
 * `isNewBondingCurve` must be true for a not-yet-created curve: the
 * synthetic curve's `creator` field is `PublicKey.default` as a
 * placeholder (the real creator is a separate instruction argument, not
 * part of the curve account), and pump's own fee logic treats a default
 * creator as "no creator fee" unless `isNewBondingCurve` says otherwise
 * (see @pump-fun/pump-sdk's fees.ts getFee).
 */
function quoteBuyFromCurve(
  global: Global,
  feeConfig: FeeConfig | null,
  bondingCurve: BondingCurve,
  solLamports: bigint,
  slippageBps: number,
  isNewBondingCurve: boolean
): CurveQuote {
  const solAmount = bigIntToBn(solLamports);
  const tokensOut = getBuyTokenAmountFromSolAmount({
    global,
    feeConfig,
    mintSupply: bondingCurve.tokenTotalSupply,
    bondingCurve,
    amount: solAmount,
    quoteMint: bondingCurve.quoteMint,
  });

  const { protocolFeeBps, creatorFeeBps } = computeFeesBps({
    global,
    feeConfig,
    mintSupply: bondingCurve.tokenTotalSupply,
    virtualQuoteReserves: bondingCurve.virtualQuoteReserves,
    virtualTokenReserves: bondingCurve.virtualTokenReserves,
    quoteMint: bondingCurve.quoteMint,
    creatorFeeBps: bondingCurve.creatorFeeBps,
  });
  const totalFee = getFee({
    global,
    feeConfig,
    mintSupply: bondingCurve.tokenTotalSupply,
    bondingCurve,
    amount: solAmount,
    isNewBondingCurve,
  });
  const { protocolFeeLamports, creatorFeeLamports } = splitFeeExact(totalFee, protocolFeeBps, creatorFeeBps);

  const tokensOutRaw = bnToBigInt(tokensOut);
  const minimumReceivedRaw = (tokensOutRaw * BigInt(10_000 - slippageBps)) / BigInt(10_000);

  return {
    status: "OK",
    reason: null,
    tokenAmountRaw: tokensOutRaw.toString(),
    solAmountLamports: solLamports.toString(),
    protocolFeeLamports: protocolFeeLamports.toString(),
    creatorFeeLamports: creatorFeeLamports.toString(),
    totalFeeLamports: bnToBigInt(totalFee).toString(),
    minimumReceivedRaw: (minimumReceivedRaw < ZERO ? ZERO : minimumReceivedRaw).toString(),
  };
}

/** A buy quote: how many tokens `solLamports` buys right now, plus fees. */
export async function getBuyQuote(
  connection: Connection,
  mintAddress: string,
  solLamports: bigint,
  slippageBps: number
): Promise<CurveQuote> {
  try {
    const loaded = await loadCurveForQuote(connection, mintAddress);
    if ("status" in loaded) return loaded;
    const { global, feeConfig, bondingCurve } = loaded;
    return quoteBuyFromCurve(global, feeConfig, bondingCurve, solLamports, slippageBps, false);
  } catch (error: unknown) {
    return emptyQuote("UNAVAILABLE", error instanceof Error ? error.message : "RPC_UNAVAILABLE");
  }
}

/**
 * A buy quote for a curve that does not exist yet - the "optional initial
 * buy" step of token creation (create_v2_and_buy). Uses the SDK's own
 * newBondingCurve(global) to build the exact initial virtual/real reserve
 * state the program itself initializes a classic SOL-quoted curve with,
 * so this quote matches what the on-chain create+buy will actually do.
 */
export async function getInitialBuyQuote(connection: Connection, solLamports: bigint, slippageBps: number): Promise<CurveQuote> {
  try {
    const [global, feeConfig] = await Promise.all([getCachedGlobal(connection), getCachedFeeConfig(connection)]);
    const bondingCurve = newBondingCurve(global);
    return quoteBuyFromCurve(global, feeConfig, bondingCurve, solLamports, slippageBps, true);
  } catch (error: unknown) {
    return emptyQuote("UNAVAILABLE", error instanceof Error ? error.message : "RPC_UNAVAILABLE");
  }
}

/**
 * Splits a combined protocol+creator fee amount back into its two parts
 * by bps ratio, for display only - the chain settles the exact split
 * itself. Computed so the two parts always sum back to `totalFee` exactly
 * (the second part is `totalFee` minus the first, never independently
 * rounded), rather than each being floor-divided separately and losing a
 * lamport to rounding.
 */
function splitFeeExact(totalFee: BN, protocolFeeBps: BN, creatorFeeBps: BN): { protocolFeeLamports: bigint; creatorFeeLamports: bigint } {
  const totalBps = protocolFeeBps.add(creatorFeeBps);
  if (totalBps.isZero()) {
    return { protocolFeeLamports: ZERO, creatorFeeLamports: ZERO };
  }
  const protocolShare = totalFee.mul(protocolFeeBps).div(totalBps);
  const creatorShare = totalFee.sub(protocolShare);
  return { protocolFeeLamports: bnToBigInt(protocolShare), creatorFeeLamports: bnToBigInt(creatorShare) };
}

/** A sell quote: how much SOL `tokenAmountRaw` tokens sells for right now, minus fees. */
export async function getSellQuote(
  connection: Connection,
  mintAddress: string,
  tokenAmountRaw: bigint,
  slippageBps: number
): Promise<CurveQuote> {
  try {
    const loaded = await loadCurveForQuote(connection, mintAddress);
    if ("status" in loaded) return loaded;
    const { global, feeConfig, bondingCurve } = loaded;

    const amount = bigIntToBn(tokenAmountRaw);
    const solOut = getSellSolAmountFromTokenAmount({
      global,
      feeConfig,
      mintSupply: bondingCurve.tokenTotalSupply,
      bondingCurve,
      amount,
    });

    const { protocolFeeBps, creatorFeeBps } = computeFeesBps({
      global,
      feeConfig,
      mintSupply: bondingCurve.tokenTotalSupply,
      virtualQuoteReserves: bondingCurve.virtualQuoteReserves,
      virtualTokenReserves: bondingCurve.virtualTokenReserves,
      quoteMint: bondingCurve.quoteMint,
      creatorFeeBps: bondingCurve.creatorFeeBps,
    });
    // getSellSolAmountFromTokenAmount already nets the fee out of solOut;
    // the pre-fee gross is backed out only to split a display-only fee
    // figure, so a lamport of rounding slack here never affects solOut or
    // minimumReceivedRaw (both exact, straight from the SDK).
    const totalFeeBps = protocolFeeBps.add(creatorFeeBps);
    const denominator = new BN(10_000).sub(totalFeeBps);
    const grossSolBeforeFee = denominator.isZero() ? solOut : solOut.mul(new BN(10_000)).div(denominator);
    const totalFee = grossSolBeforeFee.sub(solOut);
    const { protocolFeeLamports, creatorFeeLamports } = splitFeeExact(totalFee, protocolFeeBps, creatorFeeBps);

    const solOutRaw = bnToBigInt(solOut);
    const minimumReceivedRaw = (solOutRaw * BigInt(10_000 - slippageBps)) / BigInt(10_000);

    return {
      status: "OK",
      reason: null,
      tokenAmountRaw: tokenAmountRaw.toString(),
      solAmountLamports: solOutRaw.toString(),
      protocolFeeLamports: protocolFeeLamports.toString(),
      creatorFeeLamports: creatorFeeLamports.toString(),
      totalFeeLamports: bnToBigInt(totalFee).toString(),
      minimumReceivedRaw: (minimumReceivedRaw < ZERO ? ZERO : minimumReceivedRaw).toString(),
    };
  } catch (error: unknown) {
    return emptyQuote("UNAVAILABLE", error instanceof Error ? error.message : "RPC_UNAVAILABLE");
  }
}

/*
 * ============================================================
 * Independent trade verification - mirrors raydium-pool-service.ts's
 * verifyLiquidityTransaction exactly in spirit: re-read the real,
 * already-confirmed transaction and check the bonding curve's own two
 * reserve legs moved in the direction and amount being claimed, before
 * anything is written to TokenTrade. A client-reported side/amount is
 * never trusted on its own.
 *
 * The curve's SOL leg is the bonding-curve PDA's own native lamport
 * balance (pump curves hold SOL directly on the PDA, not in a separate
 * vault token account); its token leg is the curve's associated token
 * account for the mint. A BUY moves SOL into the curve and tokens out of
 * it; a SELL is the exact opposite - the same "opposite-direction legs"
 * invariant volume-index-service.ts already relies on for Raydium swaps.
 * ============================================================
 */

export type CurveVerificationStatus = "VERIFIED" | "NOT_FOUND_YET" | "ON_CHAIN_FAILURE";

export class CurveVerificationError extends Error {
  status: CurveVerificationStatus;
  constructor(status: CurveVerificationStatus, message: string) {
    super(message);
    this.name = "CurveVerificationError";
    this.status = status;
  }
}

export interface VerifiedCurveTrade {
  side: "BUY" | "SELL";
  tokenAmountRaw: bigint;
  solAmountLamports: bigint;
  blockTime: Date;
  slot: number;
}

async function fetchConfirmedTransaction(
  connection: Connection,
  signature: string
): Promise<TransactionResponse | VersionedTransactionResponse> {
  const tx = await connection.getTransaction(signature, { commitment: "confirmed", maxSupportedTransactionVersion: 0 });
  if (!tx) {
    throw new CurveVerificationError("NOT_FOUND_YET", "Transaction not found yet. It may still be propagating.");
  }
  if (tx.meta?.err) {
    throw new CurveVerificationError("ON_CHAIN_FAILURE", `Transaction failed on-chain: ${JSON.stringify(tx.meta.err)}`);
  }
  return tx;
}

function getStaticAccountKeys(tx: TransactionResponse | VersionedTransactionResponse): PublicKey[] {
  const message = tx.transaction.message as { getAccountKeys?: () => { staticAccountKeys: PublicKey[] }; accountKeys?: PublicKey[] };
  return message.getAccountKeys ? message.getAccountKeys().staticAccountKeys : (message.accountKeys ?? []);
}

function nativeBalanceDelta(tx: TransactionResponse | VersionedTransactionResponse, accountIndex: number): bigint {
  const pre = tx.meta?.preBalances?.[accountIndex];
  const post = tx.meta?.postBalances?.[accountIndex];
  return BigInt(post ?? 0) - BigInt(pre ?? 0);
}

function tokenBalanceDelta(tx: TransactionResponse | VersionedTransactionResponse, accountIndex: number): bigint {
  const pre = tx.meta?.preTokenBalances?.find((b) => b.accountIndex === accountIndex);
  const post = tx.meta?.postTokenBalances?.find((b) => b.accountIndex === accountIndex);
  const preAmount = pre ? BigInt(pre.uiTokenAmount.amount) : ZERO;
  const postAmount = post ? BigInt(post.uiTokenAmount.amount) : ZERO;
  return postAmount - preAmount;
}

function requireAccountIndex(keys: PublicKey[], target: PublicKey, label: string): number {
  const index = keys.findIndex((k) => k.equals(target));
  if (index === -1) {
    throw new CurveVerificationError(
      "ON_CHAIN_FAILURE",
      `Transaction does not reference the expected ${label} account - it did not trade on this curve.`
    );
  }
  return index;
}

/**
 * Confirms `signature` is a real pump bonding-curve buy or sell for
 * `mintAddress` by the claimed wallet, and returns the exact traded
 * amounts read from chain - never the client's claimed amounts.
 */
export async function verifyCurveTradeTransaction(
  connection: Connection,
  signature: string,
  params: { mintAddress: string; walletAddress: string; expectedSide: "BUY" | "SELL" }
): Promise<VerifiedCurveTrade> {
  const mint = new PublicKey(params.mintAddress);
  const wallet = new PublicKey(params.walletAddress);
  const bondingCurve = bondingCurvePda(mint);
  const curveTokenAccount = getAssociatedTokenAddressSync(mint, bondingCurve, true, CURVE_TOKEN_PROGRAM_ID);

  const tx = await fetchConfirmedTransaction(connection, signature);
  const accountKeys = getStaticAccountKeys(tx);

  requireAccountIndex(accountKeys, PUMP_PROGRAM_ID, "pump program");
  const curveIndex = requireAccountIndex(accountKeys, bondingCurve, "bonding curve");
  const walletIndex = requireAccountIndex(accountKeys, wallet, "wallet");
  if (!tx.transaction.message.isAccountSigner(walletIndex)) {
    throw new CurveVerificationError("ON_CHAIN_FAILURE", "Claimed wallet did not sign this transaction.");
  }
  const curveTokenIndex = requireAccountIndex(accountKeys, curveTokenAccount, "curve token account");

  const curveSolDelta = nativeBalanceDelta(tx, curveIndex);
  const curveTokenDeltaRaw = tokenBalanceDelta(tx, curveTokenIndex);

  const isBuy = curveSolDelta > ZERO && curveTokenDeltaRaw < ZERO;
  const isSell = curveSolDelta < ZERO && curveTokenDeltaRaw > ZERO;
  if (!isBuy && !isSell) {
    throw new CurveVerificationError(
      "ON_CHAIN_FAILURE",
      "Curve reserves did not move in a valid buy/sell pattern for this transaction."
    );
  }
  const side: "BUY" | "SELL" = isBuy ? "BUY" : "SELL";
  if (side !== params.expectedSide) {
    throw new CurveVerificationError("ON_CHAIN_FAILURE", `Expected a ${params.expectedSide} but this transaction was a ${side}.`);
  }

  return {
    side,
    tokenAmountRaw: curveTokenDeltaRaw < ZERO ? -curveTokenDeltaRaw : curveTokenDeltaRaw,
    solAmountLamports: curveSolDelta < ZERO ? -curveSolDelta : curveSolDelta,
    blockTime: new Date((tx.blockTime ?? Math.floor(Date.now() / 1000)) * 1000),
    slot: tx.slot,
  };
}

export interface VerifiedCreate {
  name: string;
  symbol: string;
  bondingCurveAddress: string;
  blockTime: Date | null;
  slot: number;
}

/**
 * Confirms `signature` is a real pump `create_v2` (or `create_v2_and_buy`)
 * transaction for `mintAddress` by the claimed wallet, and returns the
 * exact name/symbol pump's own program recorded - never the client's
 * submitted display fields, which are cosmetic-only elsewhere in this
 * route. Requires the claimed wallet to be both a transaction signer and
 * the on-chain `creator` the CreateEvent recorded, so a real fee-paying
 * signature for someone else's token can never be replayed to claim
 * authorship of it (the same anti-replay shape as
 * verifyTransactionCreatedMint for the direct-mint flow).
 */
export async function verifyCreateTransaction(
  connection: Connection,
  signature: string,
  params: { mintAddress: string; walletAddress: string }
): Promise<VerifiedCreate> {
  const mint = new PublicKey(params.mintAddress);
  const wallet = new PublicKey(params.walletAddress);

  const tx = await fetchConfirmedTransaction(connection, signature);
  const accountKeys = getStaticAccountKeys(tx);

  requireAccountIndex(accountKeys, PUMP_PROGRAM_ID, "pump program");
  const mintIndex = requireAccountIndex(accountKeys, mint, "mint");
  if (!tx.transaction.message.isAccountSigner(mintIndex)) {
    throw new CurveVerificationError("ON_CHAIN_FAILURE", "The claimed mint did not sign this transaction.");
  }
  const walletIndex = requireAccountIndex(accountKeys, wallet, "wallet");
  if (!tx.transaction.message.isAccountSigner(walletIndex)) {
    throw new CurveVerificationError("ON_CHAIN_FAILURE", "Claimed wallet did not sign this transaction.");
  }

  const logMessages = tx.meta?.logMessages;
  const event = logMessages ? parseCreateEvent(logMessages, mint) : null;
  if (!event) {
    throw new CurveVerificationError("ON_CHAIN_FAILURE", "No CreateEvent found for this mint in the transaction logs.");
  }
  if (!event.creator.equals(wallet)) {
    throw new CurveVerificationError("ON_CHAIN_FAILURE", "The claimed wallet is not this token's on-chain creator.");
  }

  return {
    name: event.name,
    symbol: event.symbol,
    bondingCurveAddress: event.bondingCurve.toBase58(),
    blockTime: tx.blockTime ? new Date(tx.blockTime * 1000) : null,
    slot: tx.slot,
  };
}

/*
 * ============================================================
 * Graduation detection - re-reads the curve's own `complete` flag live,
 * never trusts a client claim or a stale DB row. Once graduated, confirms
 * the canonical pump-amm pool account actually exists before reporting a
 * pool address; real PumpSwap pool reserve/liquidity decoding lives in
 * pumpswap-pool-service.ts.
 * ============================================================
 */
export interface GraduationCheck {
  graduated: boolean;
  bondingCurveAddress: string;
  poolAddress: string | null;
  poolAccountExists: boolean;
  // Once a curve is complete, pump's program no longer accepts buy/sell
  // against it - the newest confirmed signature touching the bonding-curve
  // account is therefore, in practice, the migrate/graduation transaction
  // itself. Used only to anchor GraduationEvent's required signature/slot/
  // blockTime to something real and independently fetched when a verified
  // migration event (see findVerifiedMigration below) could not be found -
  // never presented as a parsed/verified instruction on its own, only as
  // "the last activity on this curve."
  anchorSignature: string | null;
  anchorSlot: number | null;
  anchorBlockTime: Date | null;
}

/**
 * Cheap, always-safe-to-call-on-every-request graduation check: one
 * account read for `complete`, plus (only once true) one account read for
 * the canonical pool's existence and one cheap signature-history call for
 * a last-activity anchor. Deliberately does NOT attempt to find/parse the
 * real migration event - that is a separate, more expensive search (see
 * findVerifiedMigration) meant to run only once per mint (on first
 * detection, or while still unverified), not on every page view.
 */
export async function checkGraduation(connection: Connection, mintAddress: string): Promise<GraduationCheck> {
  const mint = new PublicKey(mintAddress);
  const bondingCurve = bondingCurvePda(mint);
  const empty = (): GraduationCheck => ({
    graduated: false,
    bondingCurveAddress: bondingCurve.toBase58(),
    poolAddress: null,
    poolAccountExists: false,
    anchorSignature: null,
    anchorSlot: null,
    anchorBlockTime: null,
  });

  const curveAccountInfo = await connection.getAccountInfo(bondingCurve);
  if (!curveAccountInfo) return empty();
  const decoded = PUMP_SDK.decodeBondingCurveNullable(curveAccountInfo);
  if (!decoded || !decoded.complete) return empty();

  const [pool, recentSignatures] = await Promise.all([
    Promise.resolve(canonicalPumpPoolPda(mint)),
    connection.getSignaturesForAddress(bondingCurve, { limit: 1 }),
  ]);
  const poolAccountInfo = await connection.getAccountInfo(pool);
  const newest = recentSignatures[0] ?? null;

  return {
    graduated: true,
    bondingCurveAddress: bondingCurve.toBase58(),
    poolAddress: pool.toBase58(),
    poolAccountExists: poolAccountInfo !== null,
    anchorSignature: newest?.signature ?? null,
    anchorSlot: newest?.slot ?? null,
    anchorBlockTime: newest?.blockTime ? new Date(newest.blockTime * 1000) : null,
  };
}

export interface VerifiedMigration {
  poolAddress: string;
  mintAmountRaw: string;
  solAmountLamports: string;
  poolMigrationFeeLamports: string;
  signature: string;
  slot: number;
  blockTime: Date | null;
}

// Each page is a cheap getSignaturesForAddress call; MIGRATION_SEARCH_MAX_PAGES
// bounds how many of those list calls one search makes (a safe historical
// boundary - an account with less history than this simply returns fewer
// signatures and the loop stops early). MIGRATION_SEARCH_MAX_TRANSACTIONS
// separately bounds the expensive part - real getTransaction calls - across
// however many pages it takes to reach it, so paginating doesn't multiply
// RPC cost, only search depth. At 25/page x 4 pages this can look back up to
// 100 signatures while never issuing more than 40 getTransaction calls for a
// single search.
const MIGRATION_SEARCH_PAGE_SIZE = 25;
const MIGRATION_SEARCH_MAX_PAGES = 4;
const MIGRATION_SEARCH_MAX_TRANSACTIONS = 40;

// How long a mint that is graduated but still not migrationVerified must
// wait before the graduation route will pay for another findVerifiedMigration
// search. Without this, every page view of a popular, still-unverified
// graduated token re-runs the full paginated search (see the route's own
// comment) - the search itself being bounded is not enough to avoid
// hammering RPC in aggregate when many viewers hit it concurrently.
export const MIGRATION_SEARCH_COOLDOWN_MS = 5 * 60 * 1000;

/**
 * Searches a bounded, paginated window of the bonding curve's most recent
 * confirmed signatures for the real, decoded `CompletePumpAmmMigrationEvent`
 * for this exact mint (see pump-event-service.ts's parseMigrationEvent) -
 * never inferred from "last activity." Returns null if none is found within
 * the window (e.g. the migration transaction has aged out of this RPC's
 * signature-history retention, or genuinely has not happened yet despite
 * `complete` being true, which should not occur under the protocol but is
 * reported as "not found" rather than fabricated either way).
 *
 * Deliberately NOT called from checkGraduation's hot path, and gated by
 * MIGRATION_SEARCH_COOLDOWN_MS at the call site (see the graduation route) -
 * this real RPC cost must only be paid periodically per still-unverified
 * mint, never on every page view.
 */
export async function findVerifiedMigration(connection: Connection, mintAddress: string): Promise<VerifiedMigration | null> {
  const mint = new PublicKey(mintAddress);
  const bondingCurve = bondingCurvePda(mint);

  let before: string | undefined;
  let transactionsFetched = 0;

  for (let page = 0; page < MIGRATION_SEARCH_MAX_PAGES; page += 1) {
    const signatures = await connection.getSignaturesForAddress(bondingCurve, { limit: MIGRATION_SEARCH_PAGE_SIZE, before });
    if (signatures.length === 0) break; // safe historical boundary - no more signatures for this account

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
      const event = parseMigrationEvent(tx.meta.logMessages, mint);
      if (!event) continue;
      return {
        poolAddress: event.pool.toBase58(),
        mintAmountRaw: bnToBigInt(event.mintAmount).toString(),
        solAmountLamports: bnToBigInt(event.solAmount).toString(),
        poolMigrationFeeLamports: bnToBigInt(event.poolMigrationFee).toString(),
        signature: sigInfo.signature,
        slot: tx.slot,
        blockTime: tx.blockTime ? new Date(tx.blockTime * 1000) : null,
      };
    }

    if (transactionsFetched >= MIGRATION_SEARCH_MAX_TRANSACTIONS) break; // configurable maximum reached
    if (signatures.length < MIGRATION_SEARCH_PAGE_SIZE) break; // fewer than requested = end of history
    before = signatures[signatures.length - 1].signature;
  }
  return null;
}
