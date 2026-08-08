import {
  Connection,
  PublicKey,
  Keypair,
} from "@solana/web3.js";

import {
  getOrCreateAssociatedTokenAccount,
  transfer,
} from "@solana/spl-token";

// ─────────────────────────────────────────────────────────────
// Constants
// ─────────────────────────────────────────────────────────────

export const USDC_MINT_ADDRESS =
  process.env.NEXT_PUBLIC_USDC_MINT ||
  "EPjFWdd5AufqSSqeM2qN1xzybapC8G4wEGGkZwyTDt1v";

// ─────────────────────────────────────────────────────────────
// Lazy USDC mint
//
// IMPORTANT:
// Do NOT create PublicKey objects at module-load time.
// Environment variables may not be available during
// Next.js build-time evaluation.
// ─────────────────────────────────────────────────────────────

let _usdcMint: PublicKey | null = null;

export function getUsdcMint(): PublicKey {
  if (!_usdcMint) {
    try {
      _usdcMint = new PublicKey(USDC_MINT_ADDRESS);
    } catch (error) {
      throw new Error(
        `Invalid USDC mint address: ${USDC_MINT_ADDRESS}`
      );
    }
  }

  return _usdcMint;
}

// ─────────────────────────────────────────────────────────────
// Platform wallet public key
//
// IMPORTANT:
// This is intentionally lazy.
// Never do:
// new PublicKey(process.env.NEXT_PUBLIC_PLATFORM_WALLET!)
// at the top of this file.
// ─────────────────────────────────────────────────────────────

let _platformWalletPublicKey: PublicKey | null = null;

export function getPlatformWalletPublicKey(): PublicKey {
  if (!_platformWalletPublicKey) {
    const address =
      process.env.NEXT_PUBLIC_PLATFORM_WALLET ||
      process.env.PLATFORM_WALLET_PUBLIC_KEY;

    if (!address) {
      throw new Error(
        "Platform wallet public key is not configured. " +
          "Set NEXT_PUBLIC_PLATFORM_WALLET in the environment."
      );
    }

    try {
      _platformWalletPublicKey = new PublicKey(address);
    } catch {
      throw new Error(
        "Invalid platform wallet public key."
      );
    }
  }

  return _platformWalletPublicKey;
}

// ─────────────────────────────────────────────────────────────
// Lazy Solana connection
// ─────────────────────────────────────────────────────────────

let _connection: Connection | null = null;

export function getConnection(): Connection {
  if (!_connection) {
    const rpcUrl =
      process.env.SOLANA_RPC_URL ||
      process.env.NEXT_PUBLIC_SOLANA_RPC_URL ||
      "https://api.devnet.solana.com";

    if (
      !rpcUrl.startsWith("http://") &&
      !rpcUrl.startsWith("https://")
    ) {
      throw new Error(
        `Invalid Solana RPC URL: ${rpcUrl}`
      );
    }

    _connection = new Connection(
      rpcUrl,
      "confirmed"
    );
  }

  return _connection;
}

// ─────────────────────────────────────────────────────────────
// Lazy platform wallet
// ─────────────────────────────────────────────────────────────

let _platformWallet: Keypair | null = null;

export function getPlatformWallet(): Keypair {
  if (!_platformWallet) {
    const privateKeyBase64 =
      process.env.SOLANA_PRIVATE_KEY;

    if (!privateKeyBase64) {
      throw new Error(
        "SOLANA_PRIVATE_KEY is not set."
      );
    }

    try {
      const privateKeyBytes = Buffer.from(
        privateKeyBase64,
        "base64"
      );

      _platformWallet =
        Keypair.fromSecretKey(privateKeyBytes);
    } catch {
      throw new Error(
        "Invalid SOLANA_PRIVATE_KEY."
      );
    }
  }

  return _platformWallet;
}

// ─────────────────────────────────────────────────────────────
// Verify USDC transaction
// ─────────────────────────────────────────────────────────────

export async function verifyUsdcTransaction(
  txHash: string
) {
  if (!txHash || typeof txHash !== "string") {
    throw new Error("Transaction signature is required.");
  }

  const connection = getConnection();

  const tx = await connection.getTransaction(
    txHash,
    {
      commitment: "confirmed",
      maxSupportedTransactionVersion: 0,
    }
  );

  if (!tx) {
    throw new Error("Transaction not found.");
  }

  if (tx.meta?.err) {
    throw new Error(
      `Transaction failed: ${JSON.stringify(tx.meta.err)}`
    );
  }

  const platformWallet =
    getPlatformWalletPublicKey();

  const usdcMint = getUsdcMint();

  // ───────────────────────────────────────────────────────────
  // Parse token balance changes
  //
  // We look for USDC entering the platform wallet.
  // ───────────────────────────────────────────────────────────

  const preTokenBalances =
    tx.meta?.preTokenBalances || [];

  const postTokenBalances =
    tx.meta?.postTokenBalances || [];

  let verifiedAmount = 0;

  for (const postBalance of postTokenBalances) {
    if (
      postBalance.mint !==
      usdcMint.toBase58()
    ) {
      continue;
    }

    const accountIndex =
      postBalance.accountIndex;

    const preBalance =
      preTokenBalances.find(
        (balance) =>
          balance.accountIndex ===
          accountIndex
      );

    const preAmount = preBalance
      ? Number(
          preBalance.uiTokenAmount
            ?.uiAmountString || "0"
        )
      : 0;

    const postAmount = Number(
      postBalance.uiTokenAmount
        ?.uiAmountString || "0"
    );

    const difference =
      postAmount - preAmount;

    if (difference > 0) {
      verifiedAmount += difference;
    }
  }

  // ───────────────────────────────────────────────────────────
  // Find sender when possible
  // ───────────────────────────────────────────────────────────

  let from = "";

  if (tx.transaction.message) {
    const accountKeys =
      tx.transaction.message.getAccountKeys();

    const staticKeys =
      accountKeys.staticAccountKeys;

    if (staticKeys.length > 0) {
      from = staticKeys[0].toBase58();
    }
  }

  return {
    valid: true,
    amount: verifiedAmount,
    from,
    to: platformWallet.toBase58(),
    transactionId: txHash,
  };
}

// ─────────────────────────────────────────────────────────────
// Send USDC
// ─────────────────────────────────────────────────────────────

export async function sendUsdc(
  toPublicKey: string,
  amount: number
) {
  if (!toPublicKey) {
    throw new Error(
      "Recipient public key is required."
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

  const wallet = getPlatformWallet();

  const usdcMint = getUsdcMint();

  const toPubkey =
    new PublicKey(toPublicKey);

  // ───────────────────────────────────────────────────────────
  // Sender USDC account
  // ───────────────────────────────────────────────────────────

  const fromTokenAccount =
    await getOrCreateAssociatedTokenAccount(
      connection,
      wallet,
      usdcMint,
      wallet.publicKey
    );

  // ───────────────────────────────────────────────────────────
  // Recipient USDC account
  // ───────────────────────────────────────────────────────────

  const toTokenAccount =
    await getOrCreateAssociatedTokenAccount(
      connection,
      wallet,
      usdcMint,
      toPubkey
    );

  // ───────────────────────────────────────────────────────────
  // USDC uses 6 decimals
  // ───────────────────────────────────────────────────────────

  const rawAmount = Math.round(
    amount * 1_000_000
  );

  const tx = await transfer(
    connection,
    wallet,
    fromTokenAccount.address,
    toTokenAccount.address,
    wallet.publicKey,
    rawAmount
  );

  return tx;
}
