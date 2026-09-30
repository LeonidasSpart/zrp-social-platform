import { prisma } from "@/lib/db";

/*
 * ZRP Launchpad entitlement gate.
 *
 * Unlike Live Audio (src/lib/live-audio/entitlement.ts), token creation is
 * not gated by plan tier - matching zrppad's own model of "anyone can
 * create a token, mainnet just costs money" (the USDC creation fee, paid
 * and verified per-request in the create route). The only prerequisite is
 * a Solana wallet verified via ed25519 signature (src/lib/wallet-link.ts),
 * since mint/freeze/update authorities are assigned directly to it at
 * creation time - always read fresh from the database, never from a
 * session/JWT cache, since a stale value here would hand real on-chain
 * authority to the wrong address.
 */

export async function getVerifiedWallet(userId: string): Promise<string | null> {
  const user = await prisma.user.findUnique({
    where: { id: userId },
    select: { verifiedSolanaWallet: true },
  });
  return user?.verifiedSolanaWallet ?? null;
}
