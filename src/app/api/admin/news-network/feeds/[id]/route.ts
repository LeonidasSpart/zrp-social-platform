import { NextRequest, NextResponse } from "next/server";
import { requireAdmin } from "@/lib/admin";
import { logAdminAction } from "@/lib/audit-log";
import { prisma } from "@/lib/db";

export const dynamic = "force-dynamic";

type RouteContext = { params: Promise<{ id: string }> };

/**
 * PATCH /api/admin/news-network/feeds/[id]
 *
 * Enable/disable a feed and tune its cadence. Full admin only, audited.
 * The per-feed limits are bounded here as well as in the scheduler:
 * "post every minute" must not be reachable through the UI.
 */
export async function PATCH(request: NextRequest, context: RouteContext) {
  const adminCheck = await requireAdmin();
  if (!adminCheck.authorized) return adminCheck.response;

  try {
    const { id } = await context.params;
    const body = await request.json();

    const data: Record<string, unknown> = {};

    if (typeof body.enabled === "boolean") data.enabled = body.enabled;

    if (body.minMinutesBetweenPosts !== undefined) {
      const value = Number(body.minMinutesBetweenPosts);
      if (!Number.isInteger(value) || value < 30 || value > 1440) {
        return NextResponse.json(
          { success: false, error: "minMinutesBetweenPosts must be between 30 and 1440" },
          { status: 400 }
        );
      }
      data.minMinutesBetweenPosts = value;
    }

    if (body.maxPostsPerDay !== undefined) {
      const value = Number(body.maxPostsPerDay);
      if (!Number.isInteger(value) || value < 0 || value > 24) {
        return NextResponse.json(
          { success: false, error: "maxPostsPerDay must be between 0 and 24" },
          { status: 400 }
        );
      }
      data.maxPostsPerDay = value;
    }

    if (Object.keys(data).length === 0) {
      return NextResponse.json({ success: false, error: "Nothing to update" }, { status: 400 });
    }

    const feed = await prisma.newsFeed.update({ where: { id }, data });

    await logAdminAction({
      actor: adminCheck.session,
      action: data.enabled === undefined ? "news_network.feed_update" : data.enabled ? "news_network.feed_enable" : "news_network.feed_disable",
      targetType: "NewsFeed",
      targetId: id,
      metadata: { key: feed.key, ...data },
    });

    return NextResponse.json({ success: true, feed });
  } catch (error) {
    console.error("ZRP News admin feed update error:", error);
    return NextResponse.json({ success: false, error: "Failed to update feed" }, { status: 500 });
  }
}
