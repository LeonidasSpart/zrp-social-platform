"use client";

/*
 * Browser-side, client-signed SPL token minting - the atomic, one-click
 * "fee payment + mint in the same transaction, same signature" flow
 * zrppad's create-token.ts always had. Unlike the platform-signed path
 * in src/lib/launchpad/mint-service.ts (still used by NFT creation),
 * the connected wallet is the mint authority, freeze authority, update
 * authority, fee payer and USDC sender from the very first instruction -
 * there is no "platform holds it briefly then hands it off" dance,
 * because the platform never signs this transaction at all. That also
 * means no pre-verified-wallet prerequisite: the wallet that signs this
 * transaction IS the proof of control, stronger than the ed25519
 * link-challenge flow other features use.
 *
 * Reuses the exact Metaplex instruction builder
 * (buildCreateMetadataInstruction) the server-signed path already uses,
 * so both paths produce byte-identical metadata-account behaviour.
 */

import {
  Connection,
  Keypair,
  PublicKey,
  SystemProgram,
  Transaction,
  ComputeBudgetProgram,
} from "@solana/web3.js";
import {
  getAssociatedTokenAddressSync,
  createAssociatedTokenAccountInstruction,
  createAssociatedTokenAccountIdempotentInstruction,
  createInitializeMintInstruction,
  createMintToInstruction,
  createSetAuthorityInstruction,
  createTransferCheckedInstruction,
  AuthorityType,
  MINT_SIZE,
  TOKEN_PROGRAM_ID,
  ASSOCIATED_TOKEN_PROGRAM_ID,
} from "@solana/spl-token";
import { buildCreateMetadataInstruction, METADATA_BURN_ADDRESS } from "./metaplex-metadata";
import { connectInjectedWallet } from "./injected-wallet";

// USDC's standard decimal count on both Solana mainnet and devnet.
const USDC_DECIMALS = 6;

/**
 * Pure instruction construction - no RPC call, no wallet. Exported for
 * unit testing, same rationale as mint-service.ts's own
 * buildMintTransaction: the thing that actually matters here (authority
 * never left with anyone but the owner, a revoked authority set to
 * COption::None, the fee instruction preceding the mint instructions) is
 * cheap to get subtly wrong when hand-assembling SPL Token instructions.
 */
export function buildBrowserMintTransaction(params: {
  ownerPubkey: PublicKey;
  platformPubkey: PublicKey;
  usdcMint: PublicKey;
  feeUsdcRawAmount: bigint;
  mintPubkey: PublicKey;
  mintRent: number;
  decimals: number;
  supply: bigint;
  name: string;
  symbol: string;
  metadataUri: string;
  revokeMint: boolean;
  revokeFreeze: boolean;
  revokeUpdate: boolean;
}): Transaction {
  const {
    ownerPubkey,
    platformPubkey,
    usdcMint,
    feeUsdcRawAmount,
    mintPubkey,
    mintRent,
    decimals,
    supply,
    name,
    symbol,
    metadataUri,
    revokeMint,
    revokeFreeze,
    revokeUpdate,
  } = params;

  const transaction = new Transaction();
  transaction.feePayer = ownerPubkey;

  transaction.add(ComputeBudgetProgram.setComputeUnitLimit({ units: 400_000 }));

  // ─── Creation fee, paid by (and to) the same accounts that sign/
  // receive the rest of this transaction - this is what makes the fee
  // payment and the mint atomic (same signature, same instant), unlike
  // the old "pay externally, paste the signature" flow. Idempotent
  // ATA-create instructions for both sides mean neither the sender nor
  // the platform needs to already hold a USDC account - the owner pays
  // the (tiny, one-time) rent for whichever one doesn't exist yet. ────
  const senderUsdcAta = getAssociatedTokenAddressSync(usdcMint, ownerPubkey);
  const platformUsdcAta = getAssociatedTokenAddressSync(usdcMint, platformPubkey);
  transaction.add(createAssociatedTokenAccountIdempotentInstruction(ownerPubkey, senderUsdcAta, ownerPubkey, usdcMint));
  transaction.add(createAssociatedTokenAccountIdempotentInstruction(ownerPubkey, platformUsdcAta, platformPubkey, usdcMint));
  transaction.add(
    createTransferCheckedInstruction(senderUsdcAta, usdcMint, platformUsdcAta, ownerPubkey, feeUsdcRawAmount, USDC_DECIMALS)
  );

  // ─── Mint creation - owner holds mint+freeze authority from the very
  // first instruction, since it is also the transaction's only signer. ──
  transaction.add(
    SystemProgram.createAccount({
      fromPubkey: ownerPubkey,
      newAccountPubkey: mintPubkey,
      space: MINT_SIZE,
      lamports: mintRent,
      programId: TOKEN_PROGRAM_ID,
    }),
    createInitializeMintInstruction(mintPubkey, decimals, ownerPubkey, ownerPubkey, TOKEN_PROGRAM_ID)
  );

  const ownerAta = getAssociatedTokenAddressSync(mintPubkey, ownerPubkey, false, TOKEN_PROGRAM_ID, ASSOCIATED_TOKEN_PROGRAM_ID);
  transaction.add(
    createAssociatedTokenAccountInstruction(ownerPubkey, ownerAta, ownerPubkey, mintPubkey, TOKEN_PROGRAM_ID, ASSOCIATED_TOKEN_PROGRAM_ID)
  );

  transaction.add(createMintToInstruction(mintPubkey, ownerAta, ownerPubkey, supply, [], TOKEN_PROGRAM_ID));

  transaction.add(
    buildCreateMetadataInstruction({
      mint: mintPubkey,
      mintAuthority: ownerPubkey,
      payer: ownerPubkey,
      updateAuthority: revokeUpdate ? METADATA_BURN_ADDRESS : ownerPubkey,
      name,
      symbol,
      metadataUri,
      isMutable: !revokeUpdate,
    })
  );

  // Revocation instructions only exist when actually revoking - unlike
  // the server-signed path, no unconditional hand-off instruction is
  // needed here, since the owner already holds both authorities from
  // initializeMint above.
  if (revokeMint) {
    transaction.add(createSetAuthorityInstruction(mintPubkey, ownerPubkey, AuthorityType.MintTokens, null, [], TOKEN_PROGRAM_ID));
  }
  if (revokeFreeze) {
    transaction.add(createSetAuthorityInstruction(mintPubkey, ownerPubkey, AuthorityType.FreezeAccount, null, [], TOKEN_PROGRAM_ID));
  }

  return transaction;
}

export interface MintTokenFromBrowserParams {
  rpcUrl: string;
  platformWalletAddress: string;
  usdcMintAddress: string;
  feeUsdcRawAmount: bigint;
  decimals: number;
  supply: bigint;
  name: string;
  symbol: string;
  // Origin the metadata.json route is served from (e.g.
  // window.location.origin) - the full URI is derived here, once the
  // mint keypair (and so its address) is generated below, rather than
  // passed in, since the caller cannot know the mint address in advance.
  metadataOrigin: string;
  revokeMint: boolean;
  revokeFreeze: boolean;
  revokeUpdate: boolean;
}

export interface MintTokenFromBrowserResult {
  signature: string;
  mintAddress: string;
  ownerWalletAddress: string;
}

/**
 * Thrown specifically when the mint transaction was broadcast
 * (sendRawTransaction returned a signature) but its on-chain outcome
 * could not be confirmed - e.g. an RPC timeout. The mint may have
 * genuinely succeeded. Carries the mint address and signature so the
 * caller can offer "finish recording it" instead of a blind retry,
 * which would otherwise mint (and charge the 15 USDC fee) a second
 * time for a token that may already exist.
 */
export class AmbiguousMintError extends Error {
  mintAddress: string;
  signature: string;

  constructor(message: string, mintAddress: string, signature: string) {
    super(message);
    this.name = "AmbiguousMintError";
    this.mintAddress = mintAddress;
    this.signature = signature;
  }
}

/**
 * Connects the user's injected wallet, builds the atomic fee+mint
 * transaction, has the wallet sign it, and broadcasts + confirms it.
 * Throws on any failure - never returns a partial/fabricated result;
 * the caller (the create-token page) only calls the server to record a
 * token after this has genuinely resolved.
 */
export async function mintTokenFromBrowser(params: MintTokenFromBrowserParams): Promise<MintTokenFromBrowserResult> {
  const { provider, walletAddress } = await connectInjectedWallet();
  if (typeof provider.signTransaction !== "function") {
    throw new Error("This wallet does not support signing transactions. Try Phantom, Solflare or Backpack.");
  }

  const connection = new Connection(params.rpcUrl, "confirmed");
  const ownerPubkey = new PublicKey(walletAddress);
  const platformPubkey = new PublicKey(params.platformWalletAddress);
  const usdcMint = new PublicKey(params.usdcMintAddress);
  const mintKeypair = Keypair.generate();

  const mintRent = await connection.getMinimumBalanceForRentExemption(MINT_SIZE);
  const metadataUri = new URL(
    `/api/launchpad/tokens/${mintKeypair.publicKey.toBase58()}/metadata.json`,
    params.metadataOrigin
  ).toString();

  const transaction = buildBrowserMintTransaction({
    ownerPubkey,
    platformPubkey,
    usdcMint,
    feeUsdcRawAmount: params.feeUsdcRawAmount,
    mintPubkey: mintKeypair.publicKey,
    mintRent,
    decimals: params.decimals,
    supply: params.supply,
    name: params.name,
    symbol: params.symbol,
    metadataUri,
    revokeMint: params.revokeMint,
    revokeFreeze: params.revokeFreeze,
    revokeUpdate: params.revokeUpdate,
  });

  const { blockhash, lastValidBlockHeight } = await connection.getLatestBlockhash("confirmed");
  transaction.recentBlockhash = blockhash;
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
    // The transaction was already broadcast (we have a signature) - a
    // thrown error here (e.g. an RPC timeout) means the outcome is
    // unknown, not "failed". Throwing the generic error the old code
    // did would show the user an ordinary failure message and risk a
    // blind retry that pays the 15 USDC fee and mints a second token
    // for one that may have already succeeded.
    const message = error instanceof Error ? error.message : "Could not confirm the mint transaction.";
    throw new AmbiguousMintError(message, mintKeypair.publicKey.toBase58(), signature);
  }
  if (confirmation.value.err) {
    // A definite on-chain failure - the transaction landed and failed
    // atomically, so nothing moved. Safe to report as a normal failure.
    throw new Error(`Transaction failed on-chain: ${JSON.stringify(confirmation.value.err)}`);
  }

  return { signature, mintAddress: mintKeypair.publicKey.toBase58(), ownerWalletAddress: walletAddress };
}
