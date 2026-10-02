"use client";

/*
 * Browser-side, wallet-signed Raydium CPMM pool creation / add-liquidity /
 * remove-liquidity / LP-burn - the real-liquidity counterpart to
 * client-token-mint.ts. Raydium's CPMM program (CPMMoo8L3F4NbTegBCKVNunggL7H1ZpdTHKxQB5qKP1C
 * on mainnet) is an existing, independently audited, publicly deployed
 * program - ZRP never deploys or owns a liquidity program itself. Every
 * instruction here is built from the SDK's raw, documented instruction
 * constructors (makeCreateCpmmPoolInInstruction / makeDepositCpmmInInstruction /
 * makeWithdrawCpmmInInstruction - @raydium-io/raydium-sdk-v2, the official
 * Raydium org package), the same "pure builder, no hidden RPC calls baked
 * in" shape as buildBrowserMintTransaction, so the actual account wiring is
 * inspectable and unit-testable without a live connection.
 *
 * The connected wallet is the fee payer and sole signer throughout - ZRP
 * never custodies user liquidity and never signs on the user's behalf.
 * Known, disclosed limitation: pool creation here targets SPL Token /
 * plain Token-2022 mints only. A Token-2022 mint using transfer-fee or
 * transfer-hook extensions needs the SDK's `supperMintEx` accounts wired
 * in, which this module does not attempt - the create-pool action must
 * stay hidden in the UI for such tokens (see token-scanner.ts risk flags)
 * rather than silently building a transaction that would fail or behave
 * unexpectedly on-chain.
 */

import {
  Connection,
  PublicKey,
  SystemProgram,
  Transaction,
  ComputeBudgetProgram,
} from "@solana/web3.js";
import BN from "bn.js";
import {
  getAssociatedTokenAddressSync,
  createAssociatedTokenAccountIdempotentInstruction,
  createSyncNativeInstruction,
  createBurnInstruction,
  TOKEN_PROGRAM_ID,
  NATIVE_MINT,
} from "@solana/spl-token";
import {
  CREATE_CPMM_POOL_PROGRAM,
  CREATE_CPMM_POOL_FEE_ACC,
  getCpmmPdaAmmConfigId,
  getCreatePoolKeys,
  makeCreateCpmmPoolInInstruction,
  makeDepositCpmmInInstruction,
  makeWithdrawCpmmInInstruction,
} from "@raydium-io/raydium-sdk-v2";
import { connectInjectedWallet } from "./injected-wallet";
import {
  STANDARD_FEE_TIER_INDEX,
  sortMints,
  computeDepositLpAmount,
  computeWithdrawAmounts,
  applySlippageDown,
  applySlippageUp,
  type CreatePoolKeys,
} from "./cpmm-keys";

export type { CreatePoolKeys };
export { computeDepositLpAmount, computeWithdrawAmounts };

export interface BuildCreatePoolTransactionParams {
  ownerPubkey: PublicKey;
  tokenMint: PublicKey;
  tokenProgramId: PublicKey; // TOKEN_PROGRAM_ID or TOKEN_2022_PROGRAM_ID
  tokenRawAmount: bigint;
  quoteMint: PublicKey; // USDC mint, or NATIVE_MINT for SOL
  quoteRawAmount: bigint; // lamports if quoteMint is NATIVE_MINT
  quoteIsNativeSol: boolean;
}

export function buildCreatePoolTransaction(params: BuildCreatePoolTransactionParams): {
  transaction: Transaction;
  keys: CreatePoolKeys;
} {
  const { ownerPubkey, tokenMint, tokenProgramId, tokenRawAmount, quoteMint, quoteRawAmount, quoteIsNativeSol } =
    params;

  const configId = getCpmmPdaAmmConfigId(CREATE_CPMM_POOL_PROGRAM, STANDARD_FEE_TIER_INDEX).publicKey;
  const { mintA, programA, mintB, programB, xIsA } = sortMints(
    tokenMint,
    tokenProgramId,
    quoteMint,
    TOKEN_PROGRAM_ID
  );
  const amountA = xIsA ? tokenRawAmount : quoteRawAmount;
  const amountB = xIsA ? quoteRawAmount : tokenRawAmount;

  const keys = getCreatePoolKeys({ programId: CREATE_CPMM_POOL_PROGRAM, configId, mintA, mintB });

  const userVaultA = getAssociatedTokenAddressSync(mintA, ownerPubkey, false, programA);
  const userVaultB = getAssociatedTokenAddressSync(mintB, ownerPubkey, false, programB);
  const userLpAccount = getAssociatedTokenAddressSync(keys.lpMint, ownerPubkey, false, TOKEN_PROGRAM_ID);

  const transaction = new Transaction();
  transaction.feePayer = ownerPubkey;
  transaction.add(ComputeBudgetProgram.setComputeUnitLimit({ units: 300_000 }));

  transaction.add(createAssociatedTokenAccountIdempotentInstruction(ownerPubkey, userVaultA, ownerPubkey, mintA, programA));
  transaction.add(createAssociatedTokenAccountIdempotentInstruction(ownerPubkey, userVaultB, ownerPubkey, mintB, programB));
  transaction.add(createAssociatedTokenAccountIdempotentInstruction(ownerPubkey, userLpAccount, ownerPubkey, keys.lpMint, TOKEN_PROGRAM_ID));

  // Wrapped-SOL side: the ATA above is created empty - it has to be funded
  // with real lamports and then "synced" so the token program recognizes
  // the new balance, before it can be deposited as an SPL token amount.
  if (quoteIsNativeSol) {
    const wsolVault = xIsA ? userVaultB : userVaultA;
    transaction.add(SystemProgram.transfer({ fromPubkey: ownerPubkey, toPubkey: wsolVault, lamports: Number(quoteRawAmount) }));
    transaction.add(createSyncNativeInstruction(wsolVault));
  }

  transaction.add(
    makeCreateCpmmPoolInInstruction(
      CREATE_CPMM_POOL_PROGRAM,
      ownerPubkey,
      configId,
      keys.authority,
      keys.poolId,
      mintA,
      mintB,
      keys.lpMint,
      userVaultA,
      userVaultB,
      userLpAccount,
      keys.vaultA,
      keys.vaultB,
      CREATE_CPMM_POOL_FEE_ACC,
      programA,
      programB,
      keys.observationId,
      new BN(amountA.toString()),
      new BN(amountB.toString()),
      new BN(0)
    )
  );

  return { transaction, keys: { ...keys, mintA, mintB } };
}

/**
 * Thrown when a liquidity transaction broadcast but its outcome could not
 * be confirmed (e.g. an RPC timeout) - mirrors AmbiguousMintError exactly.
 * The caller must offer "check status" rather than a blind retry, which
 * would risk double-depositing or double-withdrawing real funds.
 */
export class AmbiguousLiquidityError extends Error {
  signature: string;
  constructor(message: string, signature: string) {
    super(message);
    this.name = "AmbiguousLiquidityError";
    this.signature = signature;
  }
}

async function signBroadcastConfirm(connection: Connection, transaction: Transaction, provider: { signTransaction?: (t: Transaction) => Promise<Transaction> }): Promise<string> {
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
    throw new AmbiguousLiquidityError(message, signature);
  }
  if (confirmation.value.err) {
    throw new Error(`Transaction failed on-chain: ${JSON.stringify(confirmation.value.err)}`);
  }
  return signature;
}

export interface CreatePoolFromBrowserParams {
  rpcUrl: string;
  tokenMintAddress: string;
  tokenProgramId: string;
  tokenRawAmount: bigint;
  quoteMintAddress: string;
  quoteRawAmount: bigint;
  quoteIsNativeSol: boolean;
}

export async function createPoolFromBrowser(
  params: CreatePoolFromBrowserParams
): Promise<{ signature: string; poolAddress: string; walletAddress: string }> {
  const { provider, walletAddress } = await connectInjectedWallet();
  const connection = new Connection(params.rpcUrl, "confirmed");
  const ownerPubkey = new PublicKey(walletAddress);

  const { transaction, keys } = buildCreatePoolTransaction({
    ownerPubkey,
    tokenMint: new PublicKey(params.tokenMintAddress),
    tokenProgramId: new PublicKey(params.tokenProgramId),
    tokenRawAmount: params.tokenRawAmount,
    quoteMint: new PublicKey(params.quoteMintAddress),
    quoteRawAmount: params.quoteRawAmount,
    quoteIsNativeSol: params.quoteIsNativeSol,
  });

  const signature = await signBroadcastConfirm(connection, transaction, provider);
  return { signature, poolAddress: keys.poolId.toBase58(), walletAddress };
}

export interface PoolOnChainState {
  poolId: PublicKey;
  mintA: PublicKey;
  programA: PublicKey;
  mintB: PublicKey;
  programB: PublicKey;
  lpMint: PublicKey;
  vaultA: PublicKey;
  vaultB: PublicKey;
  authority: PublicKey;
}

export interface AddLiquidityFromBrowserParams {
  rpcUrl: string;
  pool: PoolOnChainState;
  desiredAmountA: bigint;
  desiredAmountB: bigint;
  reserveA: bigint;
  reserveB: bigint;
  lpSupply: bigint;
  slippageBps: number;
}

export async function addLiquidityFromBrowser(
  params: AddLiquidityFromBrowserParams
): Promise<{ signature: string; walletAddress: string }> {
  const { provider, walletAddress } = await connectInjectedWallet();
  const connection = new Connection(params.rpcUrl, "confirmed");
  const ownerPubkey = new PublicKey(walletAddress);
  const { pool, desiredAmountA, desiredAmountB, reserveA, reserveB, lpSupply, slippageBps } = params;

  const lpAmount = computeDepositLpAmount(reserveA, reserveB, lpSupply, desiredAmountA, desiredAmountB);
  const amountMaxA = applySlippageUp(desiredAmountA, slippageBps);
  const amountMaxB = applySlippageUp(desiredAmountB, slippageBps);

  const userVaultA = getAssociatedTokenAddressSync(pool.mintA, ownerPubkey, false, pool.programA);
  const userVaultB = getAssociatedTokenAddressSync(pool.mintB, ownerPubkey, false, pool.programB);
  const userLpAccount = getAssociatedTokenAddressSync(pool.lpMint, ownerPubkey, false, TOKEN_PROGRAM_ID);

  const transaction = new Transaction();
  transaction.feePayer = ownerPubkey;
  transaction.add(ComputeBudgetProgram.setComputeUnitLimit({ units: 300_000 }));
  transaction.add(createAssociatedTokenAccountIdempotentInstruction(ownerPubkey, userVaultA, ownerPubkey, pool.mintA, pool.programA));
  transaction.add(createAssociatedTokenAccountIdempotentInstruction(ownerPubkey, userVaultB, ownerPubkey, pool.mintB, pool.programB));
  transaction.add(createAssociatedTokenAccountIdempotentInstruction(ownerPubkey, userLpAccount, ownerPubkey, pool.lpMint, TOKEN_PROGRAM_ID));

  if (pool.mintA.equals(NATIVE_MINT)) {
    transaction.add(SystemProgram.transfer({ fromPubkey: ownerPubkey, toPubkey: userVaultA, lamports: Number(amountMaxA) }));
    transaction.add(createSyncNativeInstruction(userVaultA));
  } else if (pool.mintB.equals(NATIVE_MINT)) {
    transaction.add(SystemProgram.transfer({ fromPubkey: ownerPubkey, toPubkey: userVaultB, lamports: Number(amountMaxB) }));
    transaction.add(createSyncNativeInstruction(userVaultB));
  }

  transaction.add(
    makeDepositCpmmInInstruction(
      CREATE_CPMM_POOL_PROGRAM,
      ownerPubkey,
      pool.authority,
      pool.poolId,
      userLpAccount,
      userVaultA,
      userVaultB,
      pool.vaultA,
      pool.vaultB,
      pool.mintA,
      pool.mintB,
      pool.lpMint,
      new BN(lpAmount.toString()),
      new BN(amountMaxA.toString()),
      new BN(amountMaxB.toString())
    )
  );

  const signature = await signBroadcastConfirm(connection, transaction, provider);
  return { signature, walletAddress };
}

export interface RemoveLiquidityFromBrowserParams {
  rpcUrl: string;
  pool: PoolOnChainState;
  lpAmountToBurn: bigint;
  reserveA: bigint;
  reserveB: bigint;
  lpSupply: bigint;
  slippageBps: number;
}

export async function removeLiquidityFromBrowser(
  params: RemoveLiquidityFromBrowserParams
): Promise<{ signature: string; walletAddress: string }> {
  const { provider, walletAddress } = await connectInjectedWallet();
  const connection = new Connection(params.rpcUrl, "confirmed");
  const ownerPubkey = new PublicKey(walletAddress);
  const { pool, lpAmountToBurn, reserveA, reserveB, lpSupply, slippageBps } = params;

  const { amountA, amountB } = computeWithdrawAmounts(reserveA, reserveB, lpSupply, lpAmountToBurn);
  const amountMinA = applySlippageDown(amountA, slippageBps);
  const amountMinB = applySlippageDown(amountB, slippageBps);

  const userVaultA = getAssociatedTokenAddressSync(pool.mintA, ownerPubkey, false, pool.programA);
  const userVaultB = getAssociatedTokenAddressSync(pool.mintB, ownerPubkey, false, pool.programB);
  const userLpAccount = getAssociatedTokenAddressSync(pool.lpMint, ownerPubkey, false, TOKEN_PROGRAM_ID);

  const transaction = new Transaction();
  transaction.feePayer = ownerPubkey;
  transaction.add(ComputeBudgetProgram.setComputeUnitLimit({ units: 300_000 }));
  transaction.add(createAssociatedTokenAccountIdempotentInstruction(ownerPubkey, userVaultA, ownerPubkey, pool.mintA, pool.programA));
  transaction.add(createAssociatedTokenAccountIdempotentInstruction(ownerPubkey, userVaultB, ownerPubkey, pool.mintB, pool.programB));

  transaction.add(
    makeWithdrawCpmmInInstruction(
      CREATE_CPMM_POOL_PROGRAM,
      ownerPubkey,
      pool.authority,
      pool.poolId,
      userLpAccount,
      userVaultA,
      userVaultB,
      pool.vaultA,
      pool.vaultB,
      pool.mintA,
      pool.mintB,
      pool.lpMint,
      new BN(lpAmountToBurn.toString()),
      new BN(amountMinA.toString()),
      new BN(amountMinB.toString())
    )
  );

  const signature = await signBroadcastConfirm(connection, transaction, provider);
  return { signature, walletAddress };
}

export interface BurnLpFromBrowserParams {
  rpcUrl: string;
  lpMintAddress: string;
  lpRawAmount: bigint;
}

/**
 * Burns the connected wallet's own LP tokens - the classic "liquidity
 * locked forever" trust signal. This is a plain SPL Token burn (Raydium
 * CPMM LP mints are always standard SPL Token mints, never Token-2022 or
 * a position NFT - unlike a concentrated-liquidity position, a constant-
 * product LP share genuinely is a fungible balance), so no Raydium-
 * specific instruction is needed here at all.
 */
export async function burnLpFromBrowser(
  params: BurnLpFromBrowserParams
): Promise<{ signature: string; walletAddress: string }> {
  const { provider, walletAddress } = await connectInjectedWallet();
  const connection = new Connection(params.rpcUrl, "confirmed");
  const ownerPubkey = new PublicKey(walletAddress);
  const lpMint = new PublicKey(params.lpMintAddress);
  const lpAccount = getAssociatedTokenAddressSync(lpMint, ownerPubkey, false, TOKEN_PROGRAM_ID);

  const transaction = new Transaction();
  transaction.feePayer = ownerPubkey;
  transaction.add(createBurnInstruction(lpAccount, lpMint, ownerPubkey, params.lpRawAmount));

  const signature = await signBroadcastConfirm(connection, transaction, provider);
  return { signature, walletAddress };
}
