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
 * ============================================================
 * SOLANA CONFIGURATION
 * ============================================================
 */

const DEFAULT_USDC_MINT =
  "EPjFWdd5AufqSSqeM2qN1xzybapC8G4wEGGkZwyTDt1v";

const DEFAULT_RPC_URL =
  "https://api.devnet.solana.com";

/*
 * IMPORTANT:
 * Do NOT create PublicKey objects at module load time.
 *
 * Next.js evaluates imported modules during build.
 * If an environment variable is missing, something like:
 *
 * new PublicKey(undefined)
 *
 * can produce:
 *
 * Cannot read properties of undefined (reading '_bn')
 *
 * Everything is therefore created lazily.
 */

/* ============================================================
 * USDC
 * ============================================================ */

export function getUsdcMint(): PublicKey {
  const address =
    process.env.NEXT_PUBLIC_USDC_MINT ||
    DEFAULT_USDC_MINT;

  if (!address) {
    throw new Error("USDC mint address is not configured.");
  }

  try {
    return new PublicKey(address);
  } catch {
    throw new Error(
      `Invalid USDC mint address: ${address}`
    );
  }
}

/* ============================================================
 * PLATFORM WALLET PUBLIC KEY
 * ============================================================ */

export function getPlatformWalletPublicKey(): PublicKey {
  const address =
    process.env.NEXT_PUBLIC_PLATFORM_WALLET ||
    process.env.SOLANA_WALLET_ADDRESS;

  if (!address) {
    throw new Error(
      "Platform wallet address is not configured. Set NEXT_PUBLIC_PLATFORM_WALLET."
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

/* ============================================================
 * SOLANA CONNECTION
 * ============================================================ */

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

/* ============================================================
 * PLATFORM WALLET
 *
 * SERVER ONLY
 * ============================================================ */

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
        privateKeyBase64.trim(),
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

  try {
    platformWallet =
      Keypair.fromSecretKey(
        privateKeyBytes
      );
  } catch {
    throw new Error(
      "Unable to create Solana platform wallet from SOLANA_PRIVATE_KEY."
    );
  }

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

/* ============================================================
 * VERIFY USDC TRANSACTION
 * ============================================================ */

export async function verifyUsdcTransaction(
  txHash: string
) {
  if (!txHash || typeof txHash !== "string") {
    throw new Error(
      "Transaction signature is required."
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
      "Transaction not found on Solana."
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

/* ============================================================
 * SEND USDC
 * ============================================================ */

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

  const recipient =
    new PublicKey(toPublicKey);

  const connection = getConnection();
  const wallet = getPlatformWallet();
  const usdcMint = getUsdcMint();

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

  const rawAmount = Math.round(
    amount * 1_000_000
  );

  if (rawAmount <= 0) {
    throw new Error(
      "USDC amount is too small."
    );
  }

  return await transfer(
    connection,
    wallet,
    fromTokenAccount.address,
    toTokenAccount.address,
    wallet.publicKey,
    rawAmount
  );
}
