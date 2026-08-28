import { NextRequest, NextResponse } from "next/server";
import { getServerSession } from "next-auth";
import { authOptions } from "@/lib/auth";
import { prisma } from "@/lib/db";
import { rateLimit } from "@/lib/rate-limit";
import { buildWalletLinkMessage, verifyWalletSignature } from "@/lib/wallet-link";

// Step 2 of wallet linking: verify the signature returned by the
// wallet extension against the nonce issued in link-challenge, then
// record the wallet as this account's cryptographically verified
// sender wallet.
export async function POST(req: NextRequest) {
  const session = await getServerSession(authOptions);
  if (!session?.user?.id) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const limit = await rateLimit(req, { limit: 10, window: 300, type: "wallet-link-verify" });
  if (!limit.success) return limit.response;

  const { walletAddress, signature } = await req.json();

  if (!walletAddress || typeof walletAddress !== "string" || !signature || typeof signature !== "string") {
    return NextResponse.json({ error: "Missing wallet address or signature." }, { status: 400 });
  }

  const user = await prisma.user.findUnique({
    where: { id: session.user.id },
    select: { walletLinkNonce: true, walletLinkNonceExpiry: true },
  });

  if (!user?.walletLinkNonce || !user.walletLinkNonceExpiry || user.walletLinkNonceExpiry < new Date()) {
    return NextResponse.json(
      { error: "No pending wallet link request. Please start again." },
      { status: 400 }
    );
  }

  const message = buildWalletLinkMessage(session.user.id, user.walletLinkNonce);

  if (!verifyWalletSignature(walletAddress, message, signature)) {
    return NextResponse.json({ error: "Signature verification failed." }, { status: 400 });
  }

  try {
    await prisma.user.update({
      where: { id: session.user.id },
      data: {
        verifiedSolanaWallet: walletAddress,
        walletLinkNonce: null,
        walletLinkNonceExpiry: null,
      },
    });
  } catch (err: any) {
    if (err?.code === "P2002") {
      return NextResponse.json(
        { error: "This wallet is already linked to a different account." },
        { status: 409 }
      );
    }
    throw err;
  }

  return NextResponse.json({ success: true, verifiedSolanaWallet: walletAddress });
}
