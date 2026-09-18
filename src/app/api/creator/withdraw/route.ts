import { NextRequest, NextResponse } from "next/server";
import { Prisma } from "@prisma/client";
// ⚠️ SECURITY: getVerifiedToken is a drop-in for getToken() that overlays the
// database's current role/isAdmin/plan/banned onto the decoded JWT and
// returns null for a banned or deleted account - see src/lib/auth-guards.ts.
import { getVerifiedToken as getToken } from "@/lib/auth-guards";
import { prisma } from "@/lib/db";
import { rateLimit } from "@/lib/rate-limit";
import { jsonWithDecimals } from "@/lib/serialize-decimal";

export async function POST(req: NextRequest) {
  const limit = await rateLimit(req, { limit: 5, window: 300, type: "creator-withdraw" });
  if (!limit.success) return limit.response;

  try {
    const token = await getToken({ req, secret: process.env.NEXTAUTH_SECRET });
    if (!token) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }

    const userId = token.id as string;
    const body = await req.json();
    const { amount } = body;

    if (!amount || typeof amount !== "number" || !Number.isFinite(amount) || amount <= 0) {
      return NextResponse.json({ error: "Invalid withdrawal details." }, { status: 400 });
    }

    // ⚠️ SECURITY: the destination wallet is never taken from the
    // request body. It used to be (`body.walletAddress`, stored as-is
    // and later paid out verbatim by the admin approval route's
    // sendUsdc() call), which meant anyone who could make one
    // authenticated POST here - a stolen session, an XSS payload, a
    // compromised device - could redirect a creator's entire earned
    // balance to an address of their choosing, with no further check
    // at approval time. The sibling HELP-campaign withdrawal route
    // (src/app/api/help/[id]/withdraw/route.ts) already gets this
    // right: it reads the organizer's cryptographically verified wallet
    // (linked via /api/wallet/link-challenge + link-verify, which
    // requires a real ed25519 signature over a single-use nonce - see
    // src/lib/wallet-link.ts) and uses that as the sole destination.
    // This route now does the same for creator withdrawals.
    const [profile, user] = await Promise.all([
      prisma.creatorProfile.findUnique({ where: { userId } }),
      prisma.user.findUnique({ where: { id: userId }, select: { verifiedSolanaWallet: true } }),
    ]);

    if (!profile) {
      return NextResponse.json({ error: "Creator profile not found." }, { status: 404 });
    }

    if (!user?.verifiedSolanaWallet) {
      return NextResponse.json(
        { error: "Link and verify a Solana wallet before withdrawing." },
        { status: 400 }
      );
    }

    const walletAddress = user.verifiedSolanaWallet;

    // ⚠️ CORRECTNESS: convert once, at the boundary, to a Prisma.Decimal
    // and use that same value everywhere below - the balance comparison,
    // the decrement, the stored WithdrawalRequest.amount, and any
    // refund. `amount` arrives as a plain JS number (JSON has no
    // separate decimal type); comparing and arithmetic-ing a float
    // against a `Decimal(18,6)` column at three different call sites
    // (as this route used to) risks each one coercing it slightly
    // differently. A single Prisma.Decimal built from the validated
    // input removes that ambiguity entirely.
    const amountDecimal = new Prisma.Decimal(amount);

    // ⚠️ SECURITY: reserve the withdrawal amount atomically. The old
    // code checked `profile.balance < amount` and then created the
    // withdrawal request as a separate step - two concurrent requests
    // could both read the same balance, both pass the check, and both
    // get approved, over-committing funds the creator doesn't have.
    //
    // `updateMany` with the balance check baked into the `where` clause
    // is a compare-and-swap: the decrement only applies to a row that
    // still has at least `amount` available *at the moment the DB
    // executes it*, so only one of two racing requests can win.
    const reservation = await prisma.creatorProfile.updateMany({
      where: { id: profile.id, balance: { gte: amountDecimal } },
      data: { balance: { decrement: amountDecimal } },
    });

    if (reservation.count === 0) {
      return NextResponse.json({ error: "Insufficient balance." }, { status: 400 });
    }

    let withdrawal;
    try {
      withdrawal = await prisma.withdrawalRequest.create({
        data: {
          creatorProfileId: profile.id,
          userId,
          amount: amountDecimal,
          walletAddress,
          status: "PENDING",
        },
      });
    } catch (err) {
      // The reservation succeeded but recording the request failed -
      // release the funds back rather than leaving them stuck in limbo.
      await prisma.creatorProfile.update({
        where: { id: profile.id },
        data: { balance: { increment: amountDecimal } },
      });
      throw err;
    }

    return jsonWithDecimals({
      withdrawal,
      message: "Withdrawal request submitted. It will be processed within 24-48 hours.",
    });
  } catch (error) {
    console.error("Withdrawal error:", error);
    return NextResponse.json({ error: "Internal server error" }, { status: 500 });
  }
}
