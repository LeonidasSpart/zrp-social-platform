import {
  Connection,
  PublicKey,
  Keypair,
} from "@solana/web3.js";

import {
  getOrCreateAssociatedTokenAccount,
  getAssociatedTokenAddress,
  transfer,
} from "@solana/spl-token";

/*
 * ============================================================
 * Configuration
 * ============================================================
 */

const DEFAULT_RPC_URL = "https://api.devnet.solana.com";

/*
 * IMPORTANT:
 * Do NOT create PublicKey objects at module import time.
 *
 * This prevents Next.js build-time crashes when environment
 * variables are temporarily unavailable.
 */

export function getUsdcMint(): PublicKey {
  const address =
    process.env.NEXT_PUBLIC_USDC_MINT ||
    process.env.NEXT_PUBLIC_USDC_MINT_ADDRESS;

  if (!address) {
    throw new Error(
      "NEXT_PUBLIC_USDC_MINT is not configured."
    );
  }

  try {
    return new PublicKey(address);
  } catch {
    throw new Error(
      `Invalid NEXT_PUBLIC_USDC_MINT: ${address}`
    );
  }
}

export function getPlatformWalletPublicKey(): PublicKey {
  const address =
    process.env.NEXT_PUBLIC_PLATFORM_WALLET ||
    process.env.SOLANA_WALLET_ADDRESS;

  if (!address) {
    throw new Error(
      "NEXT_PUBLIC_PLATFORM_WALLET or SOLANA_WALLET_ADDRESS is not configured."
    );
  }

  try {
    return new PublicKey(address);
  } catch {
    throw new Error(
      `Invalid platform wallet address: ${address}`
    );
  }
}

/*
 * ============================================================
 * Solana connection
 * ============================================================
 */

let connection: Connection | null = null;

export function getConnection(): Connection {
  if (connection) {
    return connection;
  }

  const rpcUrl =
    process.env.SOLANA_RPC_URL ||
    process.env.NEXT_PUBLIC_SOLANA_RPC_URL ||
    DEFAULT_RPC_URL;

  if (
    !rpcUrl.startsWith("http://") &&
    !rpcUrl.startsWith("https://")
  ) {
    throw new Error(
      `Invalid Solana RPC URL: ${rpcUrl}`
    );
  }

  connection = new Connection(
    rpcUrl,
    "confirmed"
  );

  return connection;
}

/*
 * ============================================================
 * Platform wallet
 * SERVER ONLY
 * ============================================================
 */

let platformWallet: Keypair | null = null;

export function getPlatformWallet(): Keypair {
  if (platformWallet) {
    return platformWallet;
  }

  const privateKeyBase64 =
    process.env.SOLANA_PRIVATE_KEY;

  if (!privateKeyBase64) {
    throw new Error(
      "SOLANA_PRIVATE_KEY is not configured."
    );
  }

  let privateKeyBytes: Buffer;

  try {
    privateKeyBytes =
      Buffer.from(
        privateKeyBase64,
        "base64"
      );
  } catch {
    throw new Error(
      "SOLANA_PRIVATE_KEY is not valid base64."
    );
  }

  if (privateKeyBytes.length !== 64) {
    throw new Error(
      `Invalid Solana private key length: ${privateKeyBytes.length} bytes. Expected 64 bytes.`
    );
  }

  const wallet =
    Keypair.fromSecretKey(
      privateKeyBytes
    );

  const configuredAddress =
    process.env.NEXT_PUBLIC_PLATFORM_WALLET ||
    process.env.SOLANA_WALLET_ADDRESS;

  if (
    configuredAddress &&
    wallet.publicKey.toBase58() !==
      configuredAddress
  ) {
    throw new Error(
      "SOLANA_PRIVATE_KEY does not match the configured platform wallet address."
    );
  }

  platformWallet = wallet;

  return platformWallet;
}

/*
 * ============================================================
 * Verify USDC transaction
 * ============================================================
 */

export async function verifyUsdcTransaction(txHash: string) {
  if (!txHash) {
    throw new Error("Transaction signature is required.");
  }

  const connection = getConnection();

  const tx = await connection.getTransaction(txHash, {
    commitment: "confirmed",
    maxSupportedTransactionVersion: 0,
  });

  if (!tx) {
    throw new Error("Transaction not found.");
  }

  if (tx.meta?.err) {
    throw new Error(`Transaction failed: ${JSON.stringify(tx.meta.err)}`);
  }

  const usdcMint = getUsdcMint();
  const platformPubkey = getPlatformWalletPublicKey();

  // Derive the platform's associated token account for USDC.
  const platformAta = await getAssociatedTokenAddress(
    usdcMint,
    platformPubkey
  );
  const platformAtaStr = platformAta.toBase58();

  const preBalances = tx.meta?.preTokenBalances ?? [];
  const postBalances = tx.meta?.postTokenBalances ?? [];

  // Resolve account keys so we can map accountIndex -> pubkey string.
  const accountKeys = tx.transaction.message.getAccountKeys
    ? tx.transaction.message.getAccountKeys().staticAccountKeys
    : (tx.transaction.message as any).accountKeys;

  const indexToAddress = (index: number): string =>
    accountKeys[index]?.toBase58?.() ?? String(accountKeys[index]);

  // Find the platform's USDC token account balance before/after.
  const postPlatform = postBalances.find(
    (b) =>
      b.mint === usdcMint.toBase58() &&
      indexToAddress(b.accountIndex) === platformAtaStr
  );
  const prePlatform = preBalances.find(
    (b) =>
      b.mint === usdcMint.toBase58() &&
      indexToAddress(b.accountIndex) === platformAtaStr
  );

  if (!postPlatform) {
    throw new Error(
      "Transaction did not credit the platform's USDC account."
    );
  }

  const postAmount = postPlatform.uiTokenAmount.uiAmount ?? 0;
  const preAmount = prePlatform?.uiTokenAmount.uiAmount ?? 0;

  const received = postAmount - preAmount;

  if (!Number.isFinite(received) || received <= 0) {
    throw new Error(
      "No positive USDC transfer detected to the platform wallet."
    );
  }

  // Identify the sender: whichever non-platform USDC account lost balance.
  let fromAddress = "";

  for (const post of postBalances) {
    if (post.mint !== usdcMint.toBase58()) continue;

    const addr = indexToAddress(post.accountIndex);
    if (addr === platformAtaStr) continue;

    const pre = preBalances.find(
      (b) => b.accountIndex === post.accountIndex && b.mint === usdcMint.toBase58()
    );

    const preAmt = pre?.uiTokenAmount.uiAmount ?? 0;
    const postAmt = post.uiTokenAmount.uiAmount ?? 0;

    if (preAmt - postAmt > 0) {
      // This account's balance decreased: treat it as the sender's token account owner.
      fromAddress = post.owner ?? "";
      break;
    }
  }

  return {
    valid: true,
    amount: received,
    from: fromAddress,
    to: platformPubkey.toBase58(),
  };
}

/*
 * ============================================================
 * Send USDC from platform wallet
 * ============================================================
 */

export async function sendUsdc(
  toPublicKey: string,
  amount: number
) {
  if (!toPublicKey) {
    throw new Error(
      "Recipient wallet address is required."
    );
  }

  if (
    !Number.isFinite(amount) ||
    amount <= 0
  ) {
    throw new Error(
      "USDC amount must be greater than zero."
    );
  }

  const connection = getConnection();

  const wallet =
    getPlatformWallet();

  const usdcMint =
    getUsdcMint();

  const recipient =
    new PublicKey(toPublicKey);

  const fromTokenAccount =
    await getOrCreateAssociatedTokenAccount(
      connection,
      wallet,
      usdcMint,
      wallet.publicKey
    );

  const toTokenAccount =
    await getOrCreateAssociatedTokenAccount(
      connection,
      wallet,
      usdcMint,
      recipient
    );

  /*
   * USDC uses 6 decimals.
   */

  const rawAmount =
    Math.round(
      amount * 1_000_000
    );

  if (rawAmount <= 0) {
    throw new Error(
      "USDC amount is too small."
    );
  }

  const signature =
    await transfer(
      connection,
      wallet,
      fromTokenAccount.address,
      toTokenAccount.address,
      wallet.publicKey,
      rawAmount
    );

  return signature;
}
