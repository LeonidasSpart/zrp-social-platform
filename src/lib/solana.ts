import {
  Connection,
  PublicKey,
  Keypair,
} from "@solana/web3.js";

import {
  getOrCreateAssociatedTokenAccount,
  transfer,
} from "@solana/spl-token";

/*
 * ─────────────────────────────────────────────
 * Configuration
 * ─────────────────────────────────────────────
 */

const DEFAULT_USDC_MINT =
  "EPjFWdd5AufqSSqeM2qN1xzybapC8G4wEGGkZwyTDt1v";

const DEFAULT_RPC_URL =
  "https://api.devnet.solana.com";

/*
 * Never construct PublicKey at module import time
 * from a potentially undefined environment variable.
 */

export function getUsdcMint(): PublicKey {
  const address =
    process.env.NEXT_PUBLIC_USDC_MINT ||
    DEFAULT_USDC_MINT;

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
      "NEXT_PUBLIC_PLATFORM_WALLET or SOLANA_WALLET_ADDRESS is not set"
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
 * ─────────────────────────────────────────────
 * Solana connection
 * ─────────────────────────────────────────────
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
 * ─────────────────────────────────────────────
 * Platform wallet
 * ─────────────────────────────────────────────
 *
 * SERVER ONLY.
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
      "SOLANA_PRIVATE_KEY is not set"
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
      "SOLANA_PRIVATE_KEY is not valid base64"
    );
  }

  if (privateKeyBytes.length !== 64) {
    throw new Error(
      `Invalid Solana private key length: ${privateKeyBytes.length} bytes. Expected 64 bytes.`
    );
  }

  platformWallet =
    Keypair.fromSecretKey(
      privateKeyBytes
    );

  /*
   * Optional safety check:
   * make sure the private key corresponds to
   * the configured public platform wallet.
   */
  const configuredAddress =
    process.env.NEXT_PUBLIC_PLATFORM_WALLET ||
    process.env.SOLANA_WALLET_ADDRESS;

  if (
    configuredAddress &&
    platformWallet.publicKey.toBase58() !==
      configuredAddress
  ) {
    platformWallet = null;

    throw new Error(
      "SOLANA_PRIVATE_KEY does not match the configured platform wallet address."
    );
  }

  return platformWallet;
}

/*
 * ─────────────────────────────────────────────
 * Verify USDC transaction
 * ─────────────────────────────────────────────
 */

export async function verifyUsdcTransaction(
  txHash: string
) {
  if (!txHash) {
    throw new Error(
      "Transaction signature is required"
    );
  }

  const connection = getConnection();

  const tx =
    await connection.getTransaction(
      txHash,
      {
        commitment: "confirmed",
        maxSupportedTransactionVersion: 0,
      }
    );

  if (!tx) {
    throw new Error(
      "Transaction not found"
    );
  }

  if (tx.meta?.err) {
    throw new Error(
      `Transaction failed: ${JSON.stringify(
        tx.meta.err
      )}`
    );
  }

  return {
    valid: true,
    amount: 0,
    from: "",
    to: getPlatformWalletPublicKey().toBase58(),
  };
}

/*
 * ─────────────────────────────────────────────
 * Send USDC from platform wallet
 * ─────────────────────────────────────────────
 */

export async function sendUsdc(
  toPublicKey: string,
  amount: number
) {
  if (!toPublicKey) {
    throw new Error(
      "Recipient wallet address is required"
    );
  }

  if (
    !Number.isFinite(amount) ||
    amount <= 0
  ) {
    throw new Error(
      "USDC amount must be greater than zero"
    );
  }

  const connection = getConnection();
  const wallet = getPlatformWallet();
  const usdcMint = getUsdcMint();

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
   * USDC = 6 decimals.
   */
  const rawAmount = Math.round(
    amount * 1_000_000
  );

  if (rawAmount <= 0) {
    throw new Error(
      "USDC amount is too small"
    );
  }

  const signature = await transfer(
    connection,
    wallet,
    fromTokenAccount.address,
    toTokenAccount.address,
    wallet.publicKey,
    rawAmount
  );

  return signature;
}
