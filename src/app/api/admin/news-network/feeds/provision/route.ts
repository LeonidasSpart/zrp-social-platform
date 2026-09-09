import { NextRequest, NextResponse } from "next/server";
import { requireAdmin } from "@/lib/admin";
import { logAdminAction } from "@/lib/audit-log";
import { prisma } from "@/lib/db";
import { buildFeedRoster, provisionFeeds } from "@/lib/news/feeds";

export const dynamic = "force-dynamic";
export const maxDuration = 300;

/**
 * POST /api/admin/news-network/feeds/provision
 *
 * Body: { scope: "pilot" | "all" }
 *
 * Creates the editorial accounts for the roster. Full admin only, and
 * audited.
 *
 * Every feed is created DISABLED, so provisioning the full roster
 * creates 100+ accounts that publish nothing at all until someone
 * enables them one at a time. Re-running is safe: existing feeds are
 * refreshed, and an admin's enable/disable and cadence choices are
 * never overwritten.
 */
export async function POST(request: NextRequest) {
  const adminCheck = await requireAdmin();
  if (!adminCheck.authorized) return adminCheck.response;

  try {
    const body = await request.json().catch(() => ({}));
    const scope = body?.scope === "all" ? "all" : "pilot";

    const roster = buildFeedRoster();
    const definitions = scope === "all" ? roster : roster.filter((feed) => feed.isPilot);

    const result = await provisionFeeds(prisma, definitions);

    await logAdminAction({
      actor: adminCheck.session,
      action: "news_network.feeds_provision",
      targetType: "NewsFeed",
      metadata: {
        scope,
        requested: definitions.length,
        created: result.created.length,
        updated: result.updated.length,
        skipped: result.skipped.length,
      },
    });

    return NextResponse.json({
      success: true,
      scope,
      requested: definitions.length,
      ...result,
      note: "All feeds are created disabled. Enable them individually once verified.",
    });
  } catch (error) {
    console.error("ZRP News admin provision error:", error);
    return NextResponse.json(
      { success: false, error: "Failed to provision editorial feeds" },
      { status: 500 }
    );
  }
}
