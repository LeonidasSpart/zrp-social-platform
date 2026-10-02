/*
 * Server-side, independent verification of Raydium CPMM liquidity
 * transactions. Mirrors verifyUsdcTransaction()'s shape in src/lib/solana.ts
 * exactly: the client reports a transaction signature, this module re-reads
 * the real, already-confirmed transaction from the configured RPC and
 * checks it actually did what's being claimed before anything is written
 * to TokenPool / LiquidityEvent / TokenTrade. A client-reported amount or
 * "success" flag is never trusted on its own - these tables are a cache of
 * chain state, and this module is what keeps that cache honest.
 */

import { Connection, PublicKey, TransactionResponse, VersionedTransactionResponse } from "@solana/web3.js";
import { TOKEN_2022_PROGRAM_ID, TOKEN_PROGRAM_ID } from "@solana/spl-token";
import { CREATE_CPMM_POOL_PROGRAM } from "@raydium-io/raydium-sdk-v2";
import { deriveCreatePoolKeys } from "./cpmm-keys";

// tsconfig targets es5, where BigInt literal syntax (0n) is a compile
// error regardless of the esnext lib - BigInt(0) is used throughout
// instead.
const ZERO = BigInt(0);

export type PoolVerificationStatus = "VERIFIED" | "NOT_FOUND_YET" | "ON_CHAIN_FAILURE";

export interface VerifiedPoolCreation {
  poolId: string;
  lpMint: string;
  vaultA: string;
  vaultB: string;
  mintA: string;
  mintB: string;
  baseMintAmountRaw: bigint;
  quoteMintAmountRaw: bigint;
}

export class PoolVerificationError extends Error {
  status: PoolVerificationStatus;
  constructor(status: PoolVerificationStatus, message: string) {
    super(message);
    this.name = "PoolVerificationError";
    this.status = status;
  }
}

async function fetchConfirmedTransaction(
  connection: Connection,
  signature: string
): Promise<TransactionResponse | VersionedTransactionResponse> {
  const tx = await connection.getTransaction(signature, { commitment: "confirmed", maxSupportedTransactionVersion: 0 });
  if (!tx) {
    // Not an error - the signature may simply not have propagated to this
    // RPC node yet. The caller should treat this as retryable, never as a
    // definite failure.
    throw new PoolVerificationError("NOT_FOUND_YET", "Transaction not found yet. It may still be propagating.");
  }
  if (tx.meta?.err) {
    throw new PoolVerificationError("ON_CHAIN_FAILURE", `Transaction failed on-chain: ${JSON.stringify(tx.meta.err)}`);
  }
  return tx;
}

function getStaticAccountKeys(tx: TransactionResponse | VersionedTransactionResponse): PublicKey[] {
  const message = tx.transaction.message as { getAccountKeys?: () => { staticAccountKeys: PublicKey[] }; accountKeys?: PublicKey[] };
  return message.getAccountKeys ? message.getAccountKeys().staticAccountKeys : (message.accountKeys ?? []);
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
    throw new PoolVerificationError(
      "ON_CHAIN_FAILURE",
      `Transaction does not reference the expected ${label} account - it did not operate on this pool.`
    );
  }
  return index;
}

/**
 * Re-derives the expected pool/vault/LP-mint addresses from (tokenMint,
 * quoteMint) and confirms the given signature is a real, successful
 * CREATE_CPMM_POOL_PROGRAM transaction that created exactly that pool -
 * never a transaction that merely claims to, and never a different pool
 * that happens to share one of the two mints.
 */
export async function verifyPoolCreationTransaction(
  connection: Connection,
  signature: string,
  params: { tokenMintAddress: string; tokenProgramId: string; quoteMintAddress: string; creatorWalletAddress: string }
): Promise<VerifiedPoolCreation> {
  const tokenMint = new PublicKey(params.tokenMintAddress);
  const tokenProgramId = new PublicKey(params.tokenProgramId);
  const quoteMint = new PublicKey(params.quoteMintAddress);
  const creator = new PublicKey(params.creatorWalletAddress);

  if (!tokenProgramId.equals(TOKEN_PROGRAM_ID) && !tokenProgramId.equals(TOKEN_2022_PROGRAM_ID)) {
    throw new PoolVerificationError("ON_CHAIN_FAILURE", "Unsupported token program for pool creation.");
  }

  const keys = deriveCreatePoolKeys(tokenMint, tokenProgramId, quoteMint);
  const tx = await fetchConfirmedTransaction(connection, signature);
  const accountKeys = getStaticAccountKeys(tx);

  requireAccountIndex(accountKeys, CREATE_CPMM_POOL_PROGRAM, "CPMM program");
  requireAccountIndex(accountKeys, keys.poolId, "pool");
  const creatorIndex = requireAccountIndex(accountKeys, creator, "creator wallet");
  if (!tx.transaction.message.isAccountSigner(creatorIndex)) {
    throw new PoolVerificationError("ON_CHAIN_FAILURE", "Claimed creator wallet did not sign this transaction.");
  }

  const vaultAIndex = requireAccountIndex(accountKeys, keys.vaultA, "base vault");
  const vaultBIndex = requireAccountIndex(accountKeys, keys.vaultB, "quote vault");
  const baseMintAmountRaw = tokenBalanceDelta(tx, vaultAIndex);
  const quoteMintAmountRaw = tokenBalanceDelta(tx, vaultBIndex);

  if (baseMintAmountRaw <= ZERO || quoteMintAmountRaw <= ZERO) {
    throw new PoolVerificationError("ON_CHAIN_FAILURE", "Pool vaults were not seeded with positive liquidity.");
  }

  return {
    poolId: keys.poolId.toBase58(),
    lpMint: keys.lpMint.toBase58(),
    vaultA: keys.vaultA.toBase58(),
    vaultB: keys.vaultB.toBase58(),
    mintA: keys.mintA.toBase58(),
    mintB: keys.mintB.toBase58(),
    baseMintAmountRaw,
    quoteMintAmountRaw,
  };
}

export interface VerifiedLiquidityEvent {
  lpAmountRaw: bigint;
  baseAmountRaw: bigint;
  quoteAmountRaw: bigint;
}

/**
 * Confirms a signature is a real add-liquidity (deposit) or
 * remove-liquidity (withdraw) transaction against an already-known pool,
 * by requiring the pool's own vault accounts to appear in the transaction
 * and move in the expected direction - a transaction for an unrelated
 * pool, or one that never touched these vaults, is rejected.
 */
export async function verifyLiquidityTransaction(
  connection: Connection,
  signature: string,
  params: { poolId: string; vaultA: string; vaultB: string; lpMint: string; walletAddress: string; type: "ADD" | "REMOVE" }
): Promise<VerifiedLiquidityEvent> {
  const poolId = new PublicKey(params.poolId);
  const vaultA = new PublicKey(params.vaultA);
  const vaultB = new PublicKey(params.vaultB);
  const lpMint = new PublicKey(params.lpMint);
  const wallet = new PublicKey(params.walletAddress);

  const tx = await fetchConfirmedTransaction(connection, signature);
  const accountKeys = getStaticAccountKeys(tx);

  requireAccountIndex(accountKeys, CREATE_CPMM_POOL_PROGRAM, "CPMM program");
  requireAccountIndex(accountKeys, poolId, "pool");
  const walletIndex = requireAccountIndex(accountKeys, wallet, "wallet");
  if (!tx.transaction.message.isAccountSigner(walletIndex)) {
    throw new PoolVerificationError("ON_CHAIN_FAILURE", "Claimed wallet did not sign this transaction.");
  }
  const vaultAIndex = requireAccountIndex(accountKeys, vaultA, "base vault");
  const vaultBIndex = requireAccountIndex(accountKeys, vaultB, "quote vault");

  const vaultADelta = tokenBalanceDelta(tx, vaultAIndex);
  const vaultBDelta = tokenBalanceDelta(tx, vaultBIndex);

  const expectPositive = params.type === "ADD";
  if (expectPositive ? vaultADelta <= ZERO || vaultBDelta <= ZERO : vaultADelta >= ZERO || vaultBDelta >= ZERO) {
    throw new PoolVerificationError(
      "ON_CHAIN_FAILURE",
      `Pool vault balances did not move in the direction expected for ${params.type}.`
    );
  }

  // The wallet's own LP token account for this pool's LP mint - minted on
  // ADD, burned on REMOVE. Located by (mint, owner) rather than a fixed
  // account index, since its position among the transaction's accounts
  // depends on account-creation order, unlike the pool's own fixed vaults.
  const lpEntries = (tx.meta?.postTokenBalances ?? []).filter(
    (b) => b.mint === lpMint.toBase58() && b.owner === wallet.toBase58()
  );
  if (lpEntries.length === 0) {
    throw new PoolVerificationError("ON_CHAIN_FAILURE", "Transaction did not touch the wallet's LP token account.");
  }
  const lpDelta = lpEntries.reduce((sum, post) => sum + tokenBalanceDelta(tx, post.accountIndex), ZERO);
  if (expectPositive ? lpDelta <= ZERO : lpDelta >= ZERO) {
    throw new PoolVerificationError("ON_CHAIN_FAILURE", `LP balance did not move in the direction expected for ${params.type}.`);
  }

  return {
    lpAmountRaw: lpDelta < ZERO ? -lpDelta : lpDelta,
    baseAmountRaw: vaultADelta < ZERO ? -vaultADelta : vaultADelta,
    quoteAmountRaw: vaultBDelta < ZERO ? -vaultBDelta : vaultBDelta,
  };
}

/**
 * Confirms a signature genuinely burned LP tokens from the claimed
 * wallet's own LP token account for the claimed LP mint - never trusts a
 * client-reported burn amount.
 */
export async function verifyLpBurnTransaction(
  connection: Connection,
  signature: string,
  params: { lpMint: string; walletAddress: string }
): Promise<{ lpAmountRaw: bigint }> {
  const lpMint = new PublicKey(params.lpMint);
  const wallet = new PublicKey(params.walletAddress);

  const tx = await fetchConfirmedTransaction(connection, signature);
  const accountKeys = getStaticAccountKeys(tx);
  const walletIndex = requireAccountIndex(accountKeys, wallet, "wallet");
  if (!tx.transaction.message.isAccountSigner(walletIndex)) {
    throw new PoolVerificationError("ON_CHAIN_FAILURE", "Claimed wallet did not sign this transaction.");
  }

  const lpBalanceEntries = (tx.meta?.preTokenBalances ?? []).filter(
    (b) => b.mint === lpMint.toBase58() && b.owner === wallet.toBase58()
  );
  if (lpBalanceEntries.length === 0) {
    throw new PoolVerificationError("ON_CHAIN_FAILURE", "Transaction did not touch the claimed LP mint.");
  }

  let burned = ZERO;
  for (const pre of lpBalanceEntries) {
    const post = tx.meta?.postTokenBalances?.find((b) => b.accountIndex === pre.accountIndex);
    const preAmount = BigInt(pre.uiTokenAmount.amount);
    const postAmount = post ? BigInt(post.uiTokenAmount.amount) : ZERO;
    if (postAmount < preAmount) burned += preAmount - postAmount;
  }

  if (burned <= ZERO) {
    throw new PoolVerificationError("ON_CHAIN_FAILURE", "No LP tokens were actually burned in this transaction.");
  }

  return { lpAmountRaw: burned };
}
