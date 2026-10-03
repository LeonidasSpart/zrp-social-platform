"use client";

/*
 * Browser-side, wallet-signed ZRP-native token creation and bonding-curve
 * buy/sell - ZRP's own creation/trading client. Replaces
 * client-pump-create.ts (removed) as the only token-creation path; legacy
 * PUMP_CURVE tokens created before this change keep trading through
 * client-bonding-curve.ts (kept, read/trade-only, never used for new
 * creations). Every instruction here targets
 * ZRP_LAUNCH_PROGRAM_ID (programs/zrp-launchpad/) exclusively; none of
 * them ever construct or send a Pump.fun instruction. See
 * docs/zrp-launchpad-deployment.md for the program's build/deploy story
 * and zrp-launch-keys.ts's own module comment for why instructions are
 * hand-encoded here rather than through `@coral-xyz/anchor`'s IDL-driven
 * `Program` class (no committed IDL to load client-side yet).
 *
 * The connected wallet is the fee payer and sole signer throughout - ZRP
 * never custodies funds and never signs on the user's behalf, matching
 * every other launchpad client module's own stated policy.
 */

import {
  Connection,
  Keypair,
  PublicKey,
  SystemProgram,
  SYSVAR_RENT_PUBKEY,
  Transaction,
  TransactionInstruction,
} from "@solana/web3.js";
import {
  ASSOCIATED_TOKEN_PROGRAM_ID,
  TOKEN_PROGRAM_ID,
  getAssociatedTokenAddressSync,
} from "@solana/spl-token";
import { connectInjectedWallet, InjectedSolanaProvider } from "./injected-wallet";
import {
  ZRP_LAUNCH_PROGRAM_ID,
  TOKEN_METADATA_PROGRAM_ID,
  deriveZrpLaunchKeys,
  decodeGlobalConfig,
  encodeCreateAndBuyIx,
  encodeBuyIx,
  encodeSellIx,
} from "./zrp-launch-keys";

async function loadGlobalConfig(connection: Connection, globalConfig: PublicKey) {
  const info = await connection.getAccountInfo(globalConfig);
  if (!info) {
    throw new Error("ZRP Launchpad has not been initialized on this cluster yet.");
  }
  return decodeGlobalConfig(info.data);
}

async function signBroadcastConfirm(
  connection: Connection,
  transaction: Transaction,
  provider: InjectedSolanaProvider,
  extraSigners: Keypair[] = []
): Promise<string> {
  if (typeof provider.signTransaction !== "function") {
    throw new Error("This wallet does not support signing transactions. Try Phantom, Solflare or Backpack.");
  }
  const { blockhash, lastValidBlockHeight } = await connection.getLatestBlockhash("confirmed");
  transaction.recentBlockhash = blockhash;
  // Any co-signer (e.g. the new mint) signs the serialized message after
  // the blockhash is set and before the wallet signs - matching
  // client-pump-create.ts's established order exactly.
  for (const signer of extraSigners) transaction.partialSign(signer);

  const signed = await provider.signTransaction(transaction);
  const signature = await connection.sendRawTransaction(signed.serialize(), {
    skipPreflight: false,
    maxRetries: 3,
    preflightCommitment: "confirmed",
  });

  const confirmation = await connection.confirmTransaction(
    { signature, blockhash, lastValidBlockHeight },
    "confirmed"
  );
  if (confirmation.value.err) {
    throw new Error(`Transaction failed on-chain: ${JSON.stringify(confirmation.value.err)}`);
  }
  return signature;
}

/**
 * Thrown when a ZRP Launchpad transaction broadcast but its outcome could
 * not be confirmed (e.g. an RPC timeout) - mirrors AmbiguousCreateError/
 * AmbiguousTradeError exactly. The caller must offer "check status" rather
 * than a blind retry, which risks a duplicate mint or a double trade.
 */
export class AmbiguousZrpLaunchError extends Error {
  signature: string;
  walletAddress: string;
  kind: "CREATE" | "BUY" | "SELL";
  mintAddress?: string;
  constructor(message: string, signature: string, walletAddress: string, kind: "CREATE" | "BUY" | "SELL", mintAddress?: string) {
    super(message);
    this.name = "AmbiguousZrpLaunchError";
    this.signature = signature;
    this.walletAddress = walletAddress;
    this.kind = kind;
    this.mintAddress = mintAddress;
  }
}

export interface CreateZrpTokenParams {
  rpcUrl: string;
  name: string;
  symbol: string;
  /** Origin the metadata.json route is served from (e.g. window.location.origin) - the full URI is derived here, once the mint keypair (and so its address) is generated. */
  metadataOrigin: string;
  /** Exact lamports for the optional initial buy, 0/undefined for none. */
  initialBuySolLamports?: bigint;
  /** quotedTokenAmountRaw from quoteZrpBuy() against the live curve, the exact minimum this buy accepts (slippage floor). */
  minTokensOut?: bigint;
}

export interface CreateZrpTokenResult {
  signature: string;
  walletAddress: string;
  mintAddress: string;
  bondingCurveAddress: string;
}

export async function createZrpTokenFromBrowser(params: CreateZrpTokenParams): Promise<CreateZrpTokenResult> {
  const { provider, walletAddress } = await connectInjectedWallet();
  const connection = new Connection(params.rpcUrl, "confirmed");
  const ownerPubkey = new PublicKey(walletAddress);
  const mintKeypair = Keypair.generate();

  const keys = deriveZrpLaunchKeys(mintKeypair.publicKey);
  const config = await loadGlobalConfig(connection, keys.globalConfig);

  const metadataUri = new URL(
    `/api/launchpad/tokens/${mintKeypair.publicKey.toBase58()}/metadata.json`,
    params.metadataOrigin
  ).toString();

  const curveTokenVault = getAssociatedTokenAddressSync(mintKeypair.publicKey, keys.bondingCurve, true, TOKEN_PROGRAM_ID, ASSOCIATED_TOKEN_PROGRAM_ID);
  const creatorTokenAccount = getAssociatedTokenAddressSync(mintKeypair.publicKey, ownerPubkey, false, TOKEN_PROGRAM_ID, ASSOCIATED_TOKEN_PROGRAM_ID);

  const initialBuyLamports = params.initialBuySolLamports ?? BigInt(0);
  const data = await encodeCreateAndBuyIx({
    name: params.name,
    symbol: params.symbol,
    uri: metadataUri,
    initialBuyLamports,
    minTokensOut: params.minTokensOut ?? BigInt(0),
  });

  const instruction = new TransactionInstruction({
    programId: ZRP_LAUNCH_PROGRAM_ID,
    keys: [
      { pubkey: keys.globalConfig, isSigner: false, isWritable: false },
      { pubkey: keys.bondingCurve, isSigner: false, isWritable: true },
      { pubkey: mintKeypair.publicKey, isSigner: true, isWritable: true },
      { pubkey: curveTokenVault, isSigner: false, isWritable: true },
      { pubkey: creatorTokenAccount, isSigner: false, isWritable: true },
      { pubkey: keys.metadata, isSigner: false, isWritable: true },
      { pubkey: ownerPubkey, isSigner: true, isWritable: true },
      { pubkey: config.feeRecipient, isSigner: false, isWritable: true },
      { pubkey: TOKEN_METADATA_PROGRAM_ID, isSigner: false, isWritable: false },
      { pubkey: TOKEN_PROGRAM_ID, isSigner: false, isWritable: false },
      { pubkey: ASSOCIATED_TOKEN_PROGRAM_ID, isSigner: false, isWritable: false },
      { pubkey: SystemProgram.programId, isSigner: false, isWritable: false },
      { pubkey: SYSVAR_RENT_PUBKEY, isSigner: false, isWritable: false },
    ],
    data,
  });

  const transaction = new Transaction().add(instruction);
  transaction.feePayer = ownerPubkey;

  let signature: string;
  try {
    signature = await signBroadcastConfirm(connection, transaction, provider, [mintKeypair]);
  } catch (error: unknown) {
    const message = error instanceof Error ? error.message : "Could not confirm the transaction.";
    throw new AmbiguousZrpLaunchError(message, "", walletAddress, "CREATE", mintKeypair.publicKey.toBase58());
  }

  return {
    signature,
    walletAddress,
    mintAddress: mintKeypair.publicKey.toBase58(),
    bondingCurveAddress: keys.bondingCurve.toBase58(),
  };
}

export interface BuyOnZrpCurveParams {
  rpcUrl: string;
  mintAddress: string;
  /** Exact lamports the user wants to spend. */
  solLamports: bigint;
  /** minTokensOut from quoteZrpBuy() against the live curve, padded for slippage (applySlippageDown). */
  minTokensOut: bigint;
}

export async function buyOnZrpCurve(params: BuyOnZrpCurveParams): Promise<{ signature: string; walletAddress: string }> {
  const { provider, walletAddress } = await connectInjectedWallet();
  const connection = new Connection(params.rpcUrl, "confirmed");
  const ownerPubkey = new PublicKey(walletAddress);
  const mint = new PublicKey(params.mintAddress);
  const keys = deriveZrpLaunchKeys(mint);

  const [config, curveInfo] = await Promise.all([
    loadGlobalConfig(connection, keys.globalConfig),
    connection.getAccountInfo(keys.bondingCurve),
  ]);
  if (!curveInfo) throw new Error("This mint has no ZRP bonding curve.");

  const buyerTokenAccount = getAssociatedTokenAddressSync(mint, ownerPubkey, false, TOKEN_PROGRAM_ID, ASSOCIATED_TOKEN_PROGRAM_ID);
  const curveTokenVault = getAssociatedTokenAddressSync(mint, keys.bondingCurve, true, TOKEN_PROGRAM_ID, ASSOCIATED_TOKEN_PROGRAM_ID);

  const data = await encodeBuyIx({ solIn: params.solLamports, minTokensOut: params.minTokensOut });
  const instruction = new TransactionInstruction({
    programId: ZRP_LAUNCH_PROGRAM_ID,
    keys: [
      { pubkey: keys.globalConfig, isSigner: false, isWritable: false },
      { pubkey: keys.bondingCurve, isSigner: false, isWritable: true },
      { pubkey: mint, isSigner: false, isWritable: false },
      { pubkey: curveTokenVault, isSigner: false, isWritable: true },
      { pubkey: buyerTokenAccount, isSigner: false, isWritable: true },
      { pubkey: ownerPubkey, isSigner: true, isWritable: true },
      { pubkey: config.feeRecipient, isSigner: false, isWritable: true },
      { pubkey: TOKEN_PROGRAM_ID, isSigner: false, isWritable: false },
      { pubkey: ASSOCIATED_TOKEN_PROGRAM_ID, isSigner: false, isWritable: false },
      { pubkey: SystemProgram.programId, isSigner: false, isWritable: false },
    ],
    data,
  });

  const transaction = new Transaction().add(instruction);
  transaction.feePayer = ownerPubkey;

  let signature: string;
  try {
    signature = await signBroadcastConfirm(connection, transaction, provider);
  } catch (error: unknown) {
    const message = error instanceof Error ? error.message : "Could not confirm the transaction.";
    throw new AmbiguousZrpLaunchError(message, "", walletAddress, "BUY");
  }
  return { signature, walletAddress };
}

export interface SellOnZrpCurveParams {
  rpcUrl: string;
  mintAddress: string;
  /** Exact raw token amount the user wants to sell. */
  tokenAmountRaw: bigint;
  /** minSolOut from quoteZrpSell() against the live curve, padded for slippage (applySlippageDown). */
  minSolOut: bigint;
}

export async function sellOnZrpCurve(params: SellOnZrpCurveParams): Promise<{ signature: string; walletAddress: string }> {
  const { provider, walletAddress } = await connectInjectedWallet();
  const connection = new Connection(params.rpcUrl, "confirmed");
  const ownerPubkey = new PublicKey(walletAddress);
  const mint = new PublicKey(params.mintAddress);
  const keys = deriveZrpLaunchKeys(mint);

  const [config, curveInfo] = await Promise.all([
    loadGlobalConfig(connection, keys.globalConfig),
    connection.getAccountInfo(keys.bondingCurve),
  ]);
  if (!curveInfo) throw new Error("This mint has no ZRP bonding curve.");

  const sellerTokenAccount = getAssociatedTokenAddressSync(mint, ownerPubkey, false, TOKEN_PROGRAM_ID, ASSOCIATED_TOKEN_PROGRAM_ID);
  const curveTokenVault = getAssociatedTokenAddressSync(mint, keys.bondingCurve, true, TOKEN_PROGRAM_ID, ASSOCIATED_TOKEN_PROGRAM_ID);

  const data = await encodeSellIx({ tokenIn: params.tokenAmountRaw, minSolOut: params.minSolOut });
  const instruction = new TransactionInstruction({
    programId: ZRP_LAUNCH_PROGRAM_ID,
    keys: [
      { pubkey: keys.globalConfig, isSigner: false, isWritable: false },
      { pubkey: keys.bondingCurve, isSigner: false, isWritable: true },
      { pubkey: mint, isSigner: false, isWritable: false },
      { pubkey: curveTokenVault, isSigner: false, isWritable: true },
      { pubkey: sellerTokenAccount, isSigner: false, isWritable: true },
      { pubkey: ownerPubkey, isSigner: true, isWritable: true },
      { pubkey: config.feeRecipient, isSigner: false, isWritable: true },
      { pubkey: TOKEN_PROGRAM_ID, isSigner: false, isWritable: false },
    ],
    data,
  });

  const transaction = new Transaction().add(instruction);
  transaction.feePayer = ownerPubkey;

  let signature: string;
  try {
    signature = await signBroadcastConfirm(connection, transaction, provider);
  } catch (error: unknown) {
    const message = error instanceof Error ? error.message : "Could not confirm the transaction.";
    throw new AmbiguousZrpLaunchError(message, "", walletAddress, "SELL");
  }
  return { signature, walletAddress };
}
