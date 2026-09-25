import { prisma } from "@/lib/db";

/**
 * ⚠️ SECURITY: binds the on-chain sender of a verified USDC payment to
 * the ZRP account claiming it. Returns an error message to send back
 * (HTTP 400) when the claim must be refused, or null when it may proceed.
 *
 * Two independent checks:
 *
 *  1. The claimant has a verified wallet (linked via
 *     /api/wallet/link-challenge + link-verify): the payment must come
 *     from exactly that wallet. (Pre-existing rule, unchanged.)
 *
 *  2. The on-chain sender wallet is the verified wallet of a DIFFERENT
 *     account: refused. Check 1 alone only ever constrains the claimant,
 *     so an attacker simply never links a wallet and is never checked -
 *     they could watch the platform wallet and submit another user's
 *     public transaction signature first (to /api/creator/tip with their
 *     own alt as recipient, or to fund their own ad campaign), stealing
 *     the payment. A wallet's verified owner is known with certainty
 *     (ed25519 proof over a single-use nonce), so any other account
 *     claiming that wallet's payment is by definition not its sender.
 *
 * Unlinked-sender payments to unlinked claimants keep today's behaviour
 * (see the documented payment model in /api/creator/tip).
 */
export async function checkPaymentSender(
  claimantId: string,
  onChainFrom: string | null | undefined
): Promise<string | null> {
  if (!onChainFrom) return null;

  const [claimant, walletOwner] = await Promise.all([
    prisma.user.findUnique({ where: { id: claimantId }, select: { verifiedSolanaWallet: true } }),
    prisma.user.findUnique({ where: { verifiedSolanaWallet: onChainFrom }, select: { id: true } }),
  ]);

  if (claimant?.verifiedSolanaWallet && claimant.verifiedSolanaWallet !== onChainFrom) {
    return "This transaction was sent from a wallet that isn't linked to your account.";
  }

  if (walletOwner && walletOwner.id !== claimantId) {
    return "This transaction was sent from a wallet linked to a different account.";
  }

  return null;
}
