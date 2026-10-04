import { NextRequest, NextResponse } from "next/server";
import { requireAdmin } from "@/lib/admin";
import { prisma } from "@/lib/db";
import { logAdminAction } from "@/lib/audit-log";
import { adjustCoinBalance, listCoinAdjustments } from "@/lib/live-gifts/coin-adjustment";
import { LiveAudioError, liveAudioErrorResponseBody } from "@/lib/live-audio/errors";

/**
 * Admin coin-balance adjustment (mission spec section 12). NEVER a direct
 * CoinWallet.balance mutation - adjustCoinBalance() writes a CoinAdjustment
 * ledger row (before/delta/after/reason) in the same transaction as the
 * balance change, and this route additionally mirrors the action into the
 * general admin audit log for cross-feature auditability.
 */
export async function POST(req: NextRequest, props: { params: Promise<{ userId: string }> }) {
  const adminCheck = await requireAdmin();
  if (!adminCheck.authorized) return adminCheck.response;
  const { userId } = await props.params;

  const target = await prisma.user.findUnique({ where: { id: userId }, select: { id: true } });
  if (!target) return NextResponse.json({ error: "User not found." }, { status: 404 });

  const body = await req.json().catch(() => null);
  if (!body) return NextResponse.json({ error: "Invalid request body." }, { status: 400 });

  const delta = Number(body.delta);
  const reason = typeof body.reason === "string" ? body.reason : "";

  try {
    const result = await adjustCoinBalance({
      adminId: adminCheck.session.user.id,
      userId,
      delta,
      reason,
    });

    await logAdminAction({
      actor: adminCheck.session,
      action: "live_gifts.coin_adjustment",
      targetType: "CoinWallet",
      targetId: userId,
      metadata: { delta, beforeBalance: result.beforeBalance, afterBalance: result.afterBalance, reason },
    });

    return NextResponse.json({ adjustment: result });
  } catch (err) {
    if (err instanceof LiveAudioError) {
      return NextResponse.json(liveAudioErrorResponseBody(err), { status: err.status });
    }
    throw err;
  }
}

/** History of adjustments for one user - shown inline on the Coin Wallets row/detail. */
export async function GET(req: NextRequest, props: { params: Promise<{ userId: string }> }) {
  const adminCheck = await requireAdmin();
  if (!adminCheck.authorized) return adminCheck.response;
  const { userId } = await props.params;

  const adjustments = await listCoinAdjustments(userId);
  return NextResponse.json({ adjustments });
}
