import { Connection, PublicKey, Keypair } from "@solana/web3.js";
import { getOrCreateAssociatedTokenAccount, transfer } from "@solana/spl-token";

// ─── Constants (exported) ──────────────────────────────────────────
export const USDC_MINT = new PublicKey(
  process.env.NEXT_PUBLIC_USDC_MINT || "EPjFWdd5AufqSSqeM2qN1xzybapC8G4wEGGkZwyTDt1v"
);
export const PLATFORM_WALLET_PUBLIC_KEY = new PublicKey(
  process.env.NEXT_PUBLIC_PLATFORM_WALLET!
);

// ─── Lazy connection ──────────────────────────────────────────────
let _connection: Connection | null = null;

export function getConnection(): Connection {
  if (!_connection) {
    const rpcUrl = process.env.SOLANA_RPC_URL || process.env.NEXT_PUBLIC_SOLANA_RPC_URL || "https://api.devnet.solana.com";
    if (!rpcUrl.startsWith("http://") && !rpcUrl.startsWith("https://")) {
      throw new Error(`Invalid RPC URL: ${rpcUrl}`);
    }
    _connection = new Connection(rpcUrl, "confirmed");
  }
  return _connection;
}

// ─── Lazy platform wallet ──────────────────────────────────────────
let _platformWallet: Keypair | null = null;

export function getPlatformWallet(): Keypair {
  if (!_platformWallet) {
    const privateKeyBase64 = process.env.SOLANA_PRIVATE_KEY;
    if (!privateKeyBase64) {
      throw new Error("SOLANA_PRIVATE_KEY is not set");
    }
    const privateKeyBytes = Buffer.from(privateKeyBase64, "base64");
    _platformWallet = Keypair.fromSecretKey(privateKeyBytes);
  }
  return _platformWallet;
}

// ─── Verify USDC transaction ──────────────────────────────────────
export async function verifyUsdcTransaction(txHash: string) {
  const connection = getConnection();
  const tx = await connection.getTransaction(txHash, {
    commitment: "confirmed",
    maxSupportedTransactionVersion: 0,
  });
  if (!tx) throw new Error("Transaction not found");
  if (tx.meta?.err) throw new Error(`Transaction failed: ${tx.meta.err}`);
  // In production, parse the transaction to extract the USDC amount and sender.
  // For now, we trust the frontend amount and just check that the transaction is valid.
  return {
    valid: true,
    amount: 0,
    from: "",
    to: PLATFORM_WALLET_PUBLIC_KEY.toBase58(),
  };
}

// ─── Send USDC from platform wallet ──────────────────────────────
export async function sendUsdc(toPublicKey: string, amount: number) {
  const connection = getConnection();
  const wallet = getPlatformWallet();
  const toPubkey = new PublicKey(toPublicKey);

  const fromTokenAccount = await getOrCreateAssociatedTokenAccount(
    connection,
    wallet,
    USDC_MINT,
    wallet.publicKey
  );
  const toTokenAccount = await getOrCreateAssociatedTokenAccount(
    connection,
    wallet,
    USDC_MINT,
    toPubkey
  );

  const tx = await transfer(
    connection,
    wallet,
    fromTokenAccount.address,
    toTokenAccount.address,
    wallet.publicKey,
    amount * 1_000_000 // USDC has 6 decimals
  );
  return tx;
}
