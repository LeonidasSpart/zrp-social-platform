import { NextResponse } from "next/server";
import { requireStaff } from "@/lib/admin";
import { prisma } from "@/lib/db";
import { buildFeedRoster } from "@/lib/news/feeds";

export const dynamic = "force-dynamic";

/**
 * GET /api/admin/news-network/feeds
 *
 * Every provisioned editorial feed, plus how many the roster defines,
 * so the dashboard can show "X of Y provisioned, Z enabled" truthfully.
 */
export async function GET() {
  const staffCheck = await requireStaff();
  if (!staffCheck.authorized) return staffCheck.response;

  try {
    const feeds = await prisma.newsFeed.findMany({
      orderBy: [{ enabled: "desc" }, { isPilot: "desc" }, { displayName: "asc" }],
      include: {
        user: { select: { id: true, username: true, avatarUrl: true, banned: true } },
        _count: { select: { publications: true } },
      },
    });

    return NextResponse.json(
      {
        success: true,
        feeds,
        roster: { defined: buildFeedRoster().length, provisioned: feeds.length },
      },
      { headers: { "Cache-Control": "no-store" } }
    );
  } catch (error) {
    console.error("ZRP News admin feeds error:", error);
    return NextResponse.json({ success: false, error: "Failed to load feeds" }, { status: 500 });
  }
}
