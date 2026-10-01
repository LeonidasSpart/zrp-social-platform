export const runtime = "nodejs";
export const dynamic = "force-dynamic";

import { NextRequest, NextResponse } from "next/server";
// ⚠️ SECURITY: getVerifiedToken is a drop-in for getToken() that overlays the
// database's current role/isAdmin/plan/banned onto the decoded JWT and
// returns null for a banned or deleted account - see src/lib/auth-guards.ts.
import { getVerifiedToken as getToken } from "@/lib/auth-guards";
import { prisma } from "@/lib/db";
import { rateLimitByIpAndUser } from "@/lib/rate-limit";
import { jsonWithDecimals } from "@/lib/serialize-decimal";

const VALID_STATUSES = new Set(["APPROVED", "REJECTED"]);

// ─── POST: approve/reject a whitelist application - creator-only. Never
// triggers any fund movement - see IdoCampaign's model doc comment. ────
export async function POST(req: NextRequest, { params }: { params: Promise<{ id: string; appId: string }> }) {
  try {
    const token = await getToken({ req, secret: process.env.NEXTAUTH_SECRET });
    if (!token) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    const userId = token.id as string;

    const limit = await rateLimitByIpAndUser(req, userId, { limit: 60, window: 3600, type: "ido-whitelist-review" });
    if (!limit.success) return limit.response;

    const { id, appId } = await params;
    const body = await req.json();
    const { status, reviewNote } = body;

    if (typeof status !== "string" || !VALID_STATUSES.has(status)) {
      return NextResponse.json({ error: "status must be APPROVED or REJECTED." }, { status: 400 });
    }
    if (reviewNote !== undefined && reviewNote !== null && (typeof reviewNote !== "string" || reviewNote.length > 1000)) {
      return NextResponse.json({ error: "Review note must be 1000 characters or fewer." }, { status: 400 });
    }

    const campaign = await prisma.idoCampaign.findUnique({ where: { id }, select: { creatorId: true } });
    if (!campaign) {
      return NextResponse.json({ error: "IDO campaign not found." }, { status: 404 });
    }
    if (campaign.creatorId !== userId) {
      return NextResponse.json({ error: "Only this campaign's creator can review applications." }, { status: 403 });
    }

    const application = await prisma.idoWhitelistApplication.findUnique({ where: { id: appId } });
    if (!application || application.campaignId !== id) {
      return NextResponse.json({ error: "Application not found." }, { status: 404 });
    }

    const updated = await prisma.idoWhitelistApplication.update({
      where: { id: appId },
      data: {
        status: status as "APPROVED" | "REJECTED",
        reviewNote: typeof reviewNote === "string" && reviewNote ? reviewNote : null,
        reviewedAt: new Date(),
      },
    });

    return jsonWithDecimals({ application: updated });
  } catch (error) {
    console.error("IDO whitelist review error:", error);
    return NextResponse.json({ error: "Failed to review application. Please try again." }, { status: 500 });
  }
}
