export const runtime = "nodejs";
export const dynamic = "force-dynamic";

import { NextRequest, NextResponse } from "next/server";
// ⚠️ SECURITY: getVerifiedToken is a drop-in for getToken() that overlays the
// database's current role/isAdmin/plan/banned onto the decoded JWT and
// returns null for a banned or deleted account - see src/lib/auth-guards.ts.
import { getVerifiedToken as getToken } from "@/lib/auth-guards";
import { prisma } from "@/lib/db";
import { jsonWithDecimals } from "@/lib/serialize-decimal";
import { parseCursorParams, buildPage } from "@/lib/pagination";

// ─── GET: my own HELP campaigns, any status ──────────────────────────
export async function GET(req: NextRequest) {
  const token = await getToken({ req, secret: process.env.NEXTAUTH_SECRET });
  if (!token) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  try {
    const { cursor, limit } = parseCursorParams(req);
    const campaigns = await prisma.helpCampaign.findMany({
      where: { organizerId: token.id as string },
      orderBy: { createdAt: "desc" },
      take: limit + 1,
      ...(cursor ? { cursor: { id: cursor }, skip: 1 } : {}),
      include: {
        _count: { select: { contributions: true, offers: true } },
        withdrawalRequests: { orderBy: { createdAt: "desc" }, take: 5 },
      },
    });

    const { items, nextCursor } = buildPage(campaigns, limit);
    return jsonWithDecimals({ campaigns: items, nextCursor });
  } catch (error) {
    console.error("Error fetching my HELP campaigns:", error);
    return NextResponse.json({ error: "Failed to fetch campaigns" }, { status: 500 });
  }
}
