import { NextResponse } from "next/server";
import { getServerSession } from "next-auth";
import { authOptions } from "@/lib/auth";
import { prisma } from "@/lib/db";

export const dynamic = "force-dynamic";

// GET /api/wallet - the signed-in user's own ownership-verified Solana
// wallet (set by /api/wallet/link-verify), which is where creator and
// HELP withdrawals are paid. Owner-only; never another user's.
export async function GET() {
  const session = await getServerSession(authOptions);
  if (!session?.user?.id) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const user = await prisma.user.findUnique({
    where: { id: session.user.id },
    select: { verifiedSolanaWallet: true },
  });

  return NextResponse.json({ verifiedSolanaWallet: user?.verifiedSolanaWallet ?? null });
}
