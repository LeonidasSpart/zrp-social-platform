import { NextRequest, NextResponse } from "next/server";
import { requireAdmin } from "@/lib/admin";
import { prisma } from "@/lib/db";
import { logAdminAction } from "@/lib/audit-log";
import { computeGiftEligibility } from "@/lib/live-gifts/eligibility";

/** Single-user eligibility detail (drill-down from the Gift Eligibility list). */
export async function GET(_req: NextRequest, props: { params: Promise<{ userId: string }> }) {
  const adminCheck = await requireAdmin();
  if (!adminCheck.authorized) return adminCheck.response;
  const { userId } = await props.params;

  const user = await prisma.user.findUnique({
    where: { id: userId },
    select: { id: true, username: true, name: true, avatarUrl: true, badgeType: true },
  });
  if (!user) return NextResponse.json({ error: "User not found." }, { status: 404 });

  const eligibility = await computeGiftEligibility(userId);
  return NextResponse.json({ ...eligibility, user });
}

/**
 * Sets or clears this user's UserGiftPolicy - the single row
 * gift-service.ts's sendGift() itself reads to actually enforce the
 * restriction (see its GIFT_RESTRICTED check). This is the real
 * enforcement switch, not a display-only flag.
 */
export async function PATCH(req: NextRequest, props: { params: Promise<{ userId: string }> }) {
  const adminCheck = await requireAdmin();
  if (!adminCheck.authorized) return adminCheck.response;
  const { userId } = await props.params;

  const target = await prisma.user.findUnique({ where: { id: userId }, select: { id: true } });
  if (!target) return NextResponse.json({ error: "User not found." }, { status: 404 });

  const body = await req.json().catch(() => null);
  if (!body || typeof body.canSendGifts !== "boolean") {
    return NextResponse.json({ error: "canSendGifts (boolean) is required." }, { status: 400 });
  }
  const reason = typeof body.reason === "string" ? body.reason.trim().slice(0, 1000) : null;
  if (!body.canSendGifts && !reason) {
    return NextResponse.json({ error: "A reason is required when restricting a user." }, { status: 400 });
  }

  const policy = await prisma.userGiftPolicy.upsert({
    where: { userId },
    create: {
      userId,
      canSendGifts: body.canSendGifts,
      reason,
      updatedBy: adminCheck.session.user.id,
    },
    update: {
      canSendGifts: body.canSendGifts,
      reason,
      updatedBy: adminCheck.session.user.id,
    },
  });

  await logAdminAction({
    actor: adminCheck.session,
    action: body.canSendGifts ? "live_gifts.eligibility_unrestrict" : "live_gifts.eligibility_restrict",
    targetType: "User",
    targetId: userId,
    metadata: { canSendGifts: body.canSendGifts, reason },
  });

  return NextResponse.json({ policy });
}
