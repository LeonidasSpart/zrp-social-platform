"use client";

/*
 * Browser-side, wallet-signed pump.fun token creation - CREATE -> BONDING
 * CURVE INITIALIZATION -> OPTIONAL INITIAL BUY -> WALLET SIGNATURE ->
 * BROADCAST -> CONFIRMATION, matching client-bonding-curve.ts's and
 * client-token-mint.ts's established shape. Built exclusively through the
 * official @pump-fun/pump-sdk's own exported `createV2Instruction`/
 * `createV2AndBuyInstructions` (never hand-assembled accounts), for the
 * same reason client-bonding-curve.ts gives: a wrong account in a
 * hand-rolled create/buy instruction risks real fund loss in a way a
 * wrong account in a read-only decode never does.
 *
 * The new mint is a fresh, locally generated Ed25519 keypair
 * (Keypair.generate()) - this is NOT server custody: the keypair's only
 * purpose is to co-sign the one transaction that creates the mint account
 * (Solana requires a new account's own key to sign its creation); its
 * public key becomes the permanent mint address and its private key is
 * never transmitted anywhere or reused for anything else. The connected
 * wallet remains the fee payer, creator and sole ongoing signer - ZRP
 * never custodies funds and never signs on the user's behalf.
 *
 * Scope: classic SOL-quoted curve only (mayhemMode: false, no quote-mint,
 * no cashback/holder-reward), matching every other piece of this
 * integration - see pump-curve-service.ts's module comment.
 */

import { Connection, Keypair, PublicKey, Transaction, TransactionInstruction } from "@solana/web3.js";
import { PumpSdk, Global } from "@pump-fun/pump-sdk";
import { connectInjectedWallet } from "./injected-wallet";
import { GLOBAL_PDA, bigIntToBn } from "./pump-curve-keys";

const PUMP_SDK = new PumpSdk();

export interface BuildCreateInstructionsParams {
  mint: PublicKey;
  name: string;
  symbol: string;
  uri: string;
  creator: PublicKey;
  user: PublicKey;
  /** Omitted/undefined for no initial buy. */
  initialBuySolLamports?: bigint;
  quotedTokenAmountRaw?: bigint;
}

/**
 * Pure instruction construction - no RPC call, no wallet, exported for
 * unit testing exactly like client-token-mint.ts's own
 * buildBrowserMintTransaction: the thing that actually matters here (the
 * new mint co-signs, the curve is initialized through the SDK's own
 * builder rather than hand-assembled, the optional buy targets the
 * freshly-initialized curve's real initial reserves) is cheap to get
 * subtly wrong. `global` must already be decoded from a live read -
 * this function does no RPC itself.
 */
export async function buildCreateInstructions(
  global: Global,
  params: BuildCreateInstructionsParams
): Promise<TransactionInstruction[]> {
  const wantsInitialBuy = !!params.initialBuySolLamports && params.initialBuySolLamports > BigInt(0);

  if (wantsInitialBuy) {
    if (!params.quotedTokenAmountRaw) {
      throw new Error("A quoted token amount is required for an initial buy.");
    }
    return PUMP_SDK.createV2AndBuyInstructions({
      global,
      mint: params.mint,
      name: params.name,
      symbol: params.symbol,
      uri: params.uri,
      creator: params.creator,
      user: params.user,
      amount: bigIntToBn(params.quotedTokenAmountRaw),
      solAmount: bigIntToBn(params.initialBuySolLamports!),
      mayhemMode: false,
    });
  }

  return [
    await PUMP_SDK.createV2Instruction({
      mint: params.mint,
      name: params.name,
      symbol: params.symbol,
      uri: params.uri,
      creator: params.creator,
      user: params.user,
      mayhemMode: false,
    }),
  ];
}

/**
 * Thrown when the create (or create+buy) transaction broadcast but its
 * outcome could not be confirmed (e.g. an RPC timeout) - mirrors
 * AmbiguousMintError/AmbiguousTradeError exactly. Carries the mint address
 * (known locally regardless of confirmation, since it was generated
 * client-side before broadcast) so the caller can offer "check status"
 * rather than a blind retry, which would risk creating a second,
 * different token.
 */
export class AmbiguousCreateError extends Error {
  signature: string;
  walletAddress: string;
  mintAddress: string;
  constructor(message: string, signature: string, walletAddress: string, mintAddress: string) {
    super(message);
    this.name = "AmbiguousCreateError";
    this.signature = signature;
    this.walletAddress = walletAddress;
    this.mintAddress = mintAddress;
  }
}

export interface CreatePumpTokenParams {
  rpcUrl: string;
  name: string;
  symbol: string;
  /** Origin the metadata.json route is served from (e.g. window.location.origin) - the full URI is derived here, once the mint keypair (and so its address) is generated. */
  metadataOrigin: string;
  /** Exact lamports for the optional initial buy, 0/undefined for none. */
  initialBuySolLamports?: bigint;
  /** quotedTokenAmountRaw from the server quote (pump-curve-service.getInitialBuyQuote) - the exact token amount this buy asks the fresh curve for. Required when initialBuySolLamports > 0. */
  quotedTokenAmountRaw?: bigint;
  /** Percent (e.g. 1 for 1%), forwarded to the SDK's own slippage padding on the initial buy's max-SOL-cost guard. */
  slippagePercent?: number;
}

export interface CreatePumpTokenResult {
  signature: string;
  walletAddress: string;
  mintAddress: string;
}

export async function createPumpTokenFromBrowser(params: CreatePumpTokenParams): Promise<CreatePumpTokenResult> {
  const { provider, walletAddress } = await connectInjectedWallet();
  if (typeof provider.signTransaction !== "function") {
    throw new Error("This wallet does not support signing transactions. Try Phantom, Solflare or Backpack.");
  }

  const connection = new Connection(params.rpcUrl, "confirmed");
  const ownerPubkey = new PublicKey(walletAddress);
  const mintKeypair = Keypair.generate();

  const metadataUri = new URL(
    `/api/launchpad/tokens/${mintKeypair.publicKey.toBase58()}/metadata.json`,
    params.metadataOrigin
  ).toString();

  const wantsInitialBuy = !!params.initialBuySolLamports && params.initialBuySolLamports > BigInt(0);
  if (wantsInitialBuy && !params.quotedTokenAmountRaw) {
    throw new Error("A quoted token amount is required for an initial buy.");
  }

  const globalAccountInfo = await connection.getAccountInfo(GLOBAL_PDA);
  if (!globalAccountInfo) {
    throw new Error("pump Global account not found.");
  }
  const global = PUMP_SDK.decodeGlobal(globalAccountInfo);

  const instructions = await buildCreateInstructions(global, {
    mint: mintKeypair.publicKey,
    name: params.name,
    symbol: params.symbol,
    uri: metadataUri,
    creator: ownerPubkey,
    user: ownerPubkey,
    initialBuySolLamports: params.initialBuySolLamports,
    quotedTokenAmountRaw: params.quotedTokenAmountRaw,
  });

  const transaction = new Transaction().add(...instructions);
  transaction.feePayer = ownerPubkey;

  const { blockhash, lastValidBlockHeight } = await connection.getLatestBlockhash("confirmed");
  transaction.recentBlockhash = blockhash;
  // The new mint account must co-sign its own creation - set AFTER
  // recentBlockhash (partialSign signs the serialized message, which
  // includes the blockhash), BEFORE the wallet signs, matching
  // client-token-mint.ts's established order exactly.
  transaction.partialSign(mintKeypair);

  const signedTransaction = await provider.signTransaction(transaction);
  const signature = await connection.sendRawTransaction(signedTransaction.serialize(), {
    skipPreflight: false,
    maxRetries: 3,
    preflightCommitment: "confirmed",
  });

  let confirmation;
  try {
    confirmation = await connection.confirmTransaction({ signature, blockhash, lastValidBlockHeight }, "confirmed");
  } catch (error: unknown) {
    const message = error instanceof Error ? error.message : "Could not confirm the transaction.";
    throw new AmbiguousCreateError(message, signature, walletAddress, mintKeypair.publicKey.toBase58());
  }
  if (confirmation.value.err) {
    throw new Error(`Transaction failed on-chain: ${JSON.stringify(confirmation.value.err)}`);
  }

  return { signature, walletAddress, mintAddress: mintKeypair.publicKey.toBase58() };
}
