import nacl from "tweetnacl";
import bs58 from "bs58";
import crypto from "crypto";

const NONCE_TTL_MS = 10 * 60 * 1000; // 10 minutes

/**
 * The exact message a wallet must sign to prove ownership. Keeping the
 * format fixed and including the userId prevents a signature collected
 * for one account being replayed to link the same wallet to another.
 */
export function buildWalletLinkMessage(userId: string, nonce: string): string {
  return `ZRP wallet verification\nAccount: ${userId}\nNonce: ${nonce}\nThis signature only proves wallet ownership and never authorizes a transaction.`;
}

export function generateWalletLinkNonce(): { nonce: string; expiresAt: Date } {
  return {
    nonce: crypto.randomBytes(24).toString("hex"),
    expiresAt: new Date(Date.now() + NONCE_TTL_MS),
  };
}

/**
 * Verifies an ed25519 signature (as produced by a Solana wallet's
 * signMessage) over the given message, for the given base58 wallet
 * address.
 */
export function verifyWalletSignature(
  walletAddress: string,
  message: string,
  signatureBase58: string
): boolean {
  try {
    const publicKeyBytes = bs58.decode(walletAddress);
    const signatureBytes = bs58.decode(signatureBase58);
    const messageBytes = new TextEncoder().encode(message);

    if (publicKeyBytes.length !== 32) return false;

    return nacl.sign.detached.verify(messageBytes, signatureBytes, publicKeyBytes);
  } catch {
    return false;
  }
}
