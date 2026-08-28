import { NextRequest, NextResponse } from "next/server";
import { getServerSession } from "next-auth";
import { authOptions } from "@/lib/auth";
import { prisma } from "@/lib/db";
import { rateLimit } from "@/lib/rate-limit";
import { buildWalletLinkMessage, generateWalletLinkNonce } from "@/lib/wallet-link";

// Step 1 of wallet linking: issue a one-time message for the user's
// wallet extension to sign. The signature proves they control the
// private key for the wallet address they're linking, which lets
// payment flows (tips, purchases) later verify that an on-chain
// payment actually came from *this* account's own wallet rather than
// an arbitrary one someone typed in.
export async function POST(req: NextRequest) {
  const session = await getServerSession(authOptions);
  if (!session?.user?.id) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const limit = await rateLimit(req, { limit: 10, window: 300, type: "wallet-link-challenge" });
  if (!limit.success) return limit.response;

  const { nonce, expiresAt } = generateWalletLinkNonce();

  await prisma.user.update({
    where: { id: session.user.id },
    data: {
      walletLinkNonce: nonce,
      walletLinkNonceExpiry: expiresAt,
    },
  });

  const message = buildWalletLinkMessage(session.user.id, nonce);

  return NextResponse.json({ message, expiresAt });
}
