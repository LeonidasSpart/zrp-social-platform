"use client";

/*
 * Browser-side, wallet-signed pump.fun bonding-curve buy/sell - the
 * bonding-curve counterpart to client-liquidity.ts. Every instruction is
 * built exclusively through the official @pump-fun/pump-sdk's own exported
 * `PumpSdk.buyInstructions`/`sellInstructions` (never hand-assembled
 * accounts), because a wrong account in a hand-rolled buy/sell instruction
 * risks real fund loss in a way a wrong account in a read-only decode
 * never does - the vetted official SDK is the single source of truth for
 * exactly which accounts a legacy (SOL-quoted) curve trade needs and in
 * what order.
 *
 * The connected wallet is the fee payer and sole signer throughout - ZRP
 * never custodies curve funds and never signs on the user's behalf. See
 * pump-curve-service.ts's module comment for the exact curve variants this
 * integration supports (the classic SOL-quoted legacy curve only).
 */

import { Connection, PublicKey, Transaction } from "@solana/web3.js";
import { getAssociatedTokenAddressSync } from "@solana/spl-token";
import { PumpSdk } from "@pump-fun/pump-sdk";
import { connectInjectedWallet, InjectedSolanaProvider } from "./injected-wallet";
import { bondingCurvePda, GLOBAL_PDA, CURVE_TOKEN_PROGRAM_ID, bigIntToBn } from "./pump-curve-keys";

const PUMP_SDK = new PumpSdk();

/**
 * Thrown when a curve trade broadcast but its outcome could not be
 * confirmed (e.g. an RPC timeout) - mirrors AmbiguousLiquidityError
 * exactly. The caller must offer "check status" rather than a blind
 * retry, which risks double-spending real SOL/tokens.
 */
export class AmbiguousTradeError extends Error {
  signature: string;
  walletAddress: string;
  side: "BUY" | "SELL";
  constructor(message: string, signature: string, walletAddress: string, side: "BUY" | "SELL") {
    super(message);
    this.name = "AmbiguousTradeError";
    this.signature = signature;
    this.walletAddress = walletAddress;
    this.side = side;
  }
}

async function signBroadcastConfirm(
  connection: Connection,
  transaction: Transaction,
  provider: InjectedSolanaProvider,
  walletAddress: string,
  side: "BUY" | "SELL"
): Promise<string> {
  if (typeof provider.signTransaction !== "function") {
    throw new Error("This wallet does not support signing transactions. Try Phantom, Solflare or Backpack.");
  }
  const { blockhash, lastValidBlockHeight } = await connection.getLatestBlockhash("confirmed");
  transaction.recentBlockhash = blockhash;

  const signed = await provider.signTransaction(transaction);
  const signature = await connection.sendRawTransaction(signed.serialize(), {
    skipPreflight: false,
    maxRetries: 3,
    preflightCommitment: "confirmed",
  });

  let confirmation;
  try {
    confirmation = await connection.confirmTransaction({ signature, blockhash, lastValidBlockHeight }, "confirmed");
  } catch (error: unknown) {
    const message = error instanceof Error ? error.message : "Could not confirm the transaction.";
    throw new AmbiguousTradeError(message, signature, walletAddress, side);
  }
  if (confirmation.value.err) {
    throw new Error(`Transaction failed on-chain: ${JSON.stringify(confirmation.value.err)}`);
  }
  return signature;
}

async function loadCurveForTrade(connection: Connection, mint: PublicKey) {
  const [bondingCurveAccountInfo, globalAccountInfo] = await Promise.all([
    connection.getAccountInfo(bondingCurvePda(mint)),
    connection.getAccountInfo(GLOBAL_PDA),
  ]);
  if (!bondingCurveAccountInfo) throw new Error("This mint has no pump bonding curve.");
  if (!globalAccountInfo) throw new Error("pump Global account not found.");

  const bondingCurve = PUMP_SDK.decodeBondingCurve(bondingCurveAccountInfo);
  if (bondingCurve.complete) throw new Error("This token has already graduated off the curve.");
  if (bondingCurve.isMayhemMode || bondingCurve.isHolderReward || bondingCurve.isCashbackCoin) {
    throw new Error("This bonding-curve variant is not supported.");
  }
  const global = PUMP_SDK.decodeGlobal(globalAccountInfo);
  return { bondingCurveAccountInfo, bondingCurve, global };
}

export interface BuyOnCurveParams {
  rpcUrl: string;
  mintAddress: string;
  /** Exact lamports the user wants to spend. */
  solLamports: bigint;
  /** tokensOut from the server-computed quote (pump-curve-service.getBuyQuote), the exact amount this buy asks the curve for. */
  quotedTokenAmountRaw: bigint;
  /** Percent (e.g. 1 for 1%), forwarded to the SDK's own slippage padding on the max-SOL-cost guard. */
  slippagePercent: number;
}

export async function buyOnCurve(
  params: BuyOnCurveParams
): Promise<{ signature: string; walletAddress: string }> {
  const { provider, walletAddress } = await connectInjectedWallet();
  const connection = new Connection(params.rpcUrl, "confirmed");
  const ownerPubkey = new PublicKey(walletAddress);
  const mint = new PublicKey(params.mintAddress);

  const { bondingCurveAccountInfo, bondingCurve, global } = await loadCurveForTrade(connection, mint);

  const associatedUser = getAssociatedTokenAddressSync(mint, ownerPubkey, true, CURVE_TOKEN_PROGRAM_ID);
  const associatedUserAccountInfo = await connection.getAccountInfo(associatedUser);

  const instructions = await PUMP_SDK.buyInstructions({
    global,
    bondingCurveAccountInfo,
    bondingCurve,
    associatedUserAccountInfo,
    mint,
    user: ownerPubkey,
    amount: bigIntToBn(params.quotedTokenAmountRaw),
    solAmount: bigIntToBn(params.solLamports),
    slippage: params.slippagePercent,
    tokenProgram: CURVE_TOKEN_PROGRAM_ID,
  });

  const transaction = new Transaction().add(...instructions);
  transaction.feePayer = ownerPubkey;

  const signature = await signBroadcastConfirm(connection, transaction, provider, walletAddress, "BUY");
  return { signature, walletAddress };
}

export interface SellOnCurveParams {
  rpcUrl: string;
  mintAddress: string;
  /** Exact raw token amount the user wants to sell. */
  tokenAmountRaw: bigint;
  /** solOut from the server-computed quote (pump-curve-service.getSellQuote), the exact amount this sell asks the curve for. */
  quotedSolLamports: bigint;
  /** Percent (e.g. 1 for 1%), forwarded to the SDK's own slippage padding on the min-SOL-received guard. */
  slippagePercent: number;
}

export async function sellOnCurve(
  params: SellOnCurveParams
): Promise<{ signature: string; walletAddress: string }> {
  const { provider, walletAddress } = await connectInjectedWallet();
  const connection = new Connection(params.rpcUrl, "confirmed");
  const ownerPubkey = new PublicKey(walletAddress);
  const mint = new PublicKey(params.mintAddress);

  const { bondingCurveAccountInfo, bondingCurve, global } = await loadCurveForTrade(connection, mint);

  const instructions = await PUMP_SDK.sellInstructions({
    global,
    bondingCurveAccountInfo,
    bondingCurve,
    mint,
    user: ownerPubkey,
    amount: bigIntToBn(params.tokenAmountRaw),
    solAmount: bigIntToBn(params.quotedSolLamports),
    slippage: params.slippagePercent,
    tokenProgram: CURVE_TOKEN_PROGRAM_ID,
    mayhemMode: false,
    cashback: false,
  });

  const transaction = new Transaction().add(...instructions);
  transaction.feePayer = ownerPubkey;

  const signature = await signBroadcastConfirm(connection, transaction, provider, walletAddress, "SELL");
  return { signature, walletAddress };
}
