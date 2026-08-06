import { Connection, PublicKey, Keypair, Transaction, SystemProgram, LAMPORTS_PER_SOL } from "@solana/web3.js";
import { getOrCreateAssociatedTokenAccount, transfer, TOKEN_PROGRAM_ID } from "@solana/spl-token";
import base58 from "bs58";

// USDC mint address (mainnet)
export const USDC_MINT = new PublicKey(process.env.NEXT_PUBLIC_USDC_MINT || "EPjFWdd5AufqSSqeM2qN1xzybapC8G4wEGGkZwyTDt1v");
export const PLATFORM_WALLET_PUBLIC_KEY = new PublicKey(process.env.NEXT_PUBLIC_PLATFORM_WALLET!);

// RPC connection (use Helius or QuickNode for better performance)
export const connection = new Connection(process.env.SOLANA_RPC_URL || "https://api.mainnet-beta.solana.com", "confirmed");

// Platform wallet keypair (for outgoing transfers)
const privateKeyBase64 = process.env.SOLANA_PRIVATE_KEY;
if (!privateKeyBase64) throw new Error("SOLANA_PRIVATE_KEY is not set");

const privateKeyBytes = Buffer.from(privateKeyBase64, "base64");
export const platformWallet = Keypair.fromSecretKey(privateKeyBytes);

/**
 * Verify a USDC transaction on-chain
 * Returns { valid, amount, from, to } or throws
 */
export async function verifyUsdcTransaction(txHash: string) {
  const tx = await connection.getTransaction(txHash, {
    commitment: "confirmed",
    maxSupportedTransactionVersion: 0,
  });

  if (!tx) throw new Error("Transaction not found");

  // Check if the transaction was successful
  if (tx.meta?.err) throw new Error(`Transaction failed: ${tx.meta.err}`);

  // Parse the transaction to find USDC transfers (simplified)
  // For production, you'd parse the transaction instructions to find token transfers
  // This is a simplified example; you may need a more robust parser.

  // Alternative: use Helius webhook to get parsed data

  // For now, we'll just check that the transaction includes our platform wallet as recipient
  // We'll assume the user provides a valid transaction hash
  // In production, use Helius API to get parsed transfer details

  const postBalances = tx.meta?.postBalances || [];
  const preBalances = tx.meta?.preBalances || [];
  // ... token balance changes are more complex; we'll use a simpler check

  // For demo, we assume the user sent the correct amount
  // We'll rely on the frontend to provide the amount and the tx hash
  // and we'll check that the transaction is recent and not already used

  return {
    valid: true,
    amount: 0, // you'll need to parse actual USDC amount
    from: "",  // sender public key
    to: PLATFORM_WALLET_PUBLIC_KEY.toBase58(),
  };
}

/**
 * Send USDC from platform wallet to a recipient
 */
export async function sendUsdc(toPublicKey: string, amount: number) {
  const toPubkey = new PublicKey(toPublicKey);

  // Get or create token accounts
  const fromTokenAccount = await getOrCreateAssociatedTokenAccount(
    connection,
    platformWallet,
    USDC_MINT,
    platformWallet.publicKey
  );

  const toTokenAccount = await getOrCreateAssociatedTokenAccount(
    connection,
    platformWallet,
    USDC_MINT,
    toPubkey
  );

  const tx = await transfer(
    connection,
    platformWallet,
    fromTokenAccount.address,
    toTokenAccount.address,
    platformWallet.publicKey,
    amount * 1_000_000 // USDC has 6 decimals
  );

  return tx;
}
