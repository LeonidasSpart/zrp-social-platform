import { NextRequest, NextResponse } from "next/server";
import { requireAdmin } from "@/lib/admin";
import { logAdminAction } from "@/lib/audit-log";
import { prisma } from "@/lib/db";

export const dynamic = "force-dynamic";

type RouteContext = { params: Promise<{ id: string }> };

/**
 * PATCH /api/admin/news-network/sources/[id]
 *
 * Enable/disable a source, adjust its polling interval, clear its
 * backoff after a fix, or record that its images may be reused.
 */
export async function PATCH(request: NextRequest, context: RouteContext) {
  const adminCheck = await requireAdmin();
  if (!adminCheck.authorized) return adminCheck.response;

  try {
    const { id } = await context.params;
    const body = await request.json();
    const data: Record<string, unknown> = {};

    if (typeof body.enabled === "boolean") {
      data.enabled = body.enabled;
      if (!body.enabled) data.status = "DISABLED";
    }

    if (typeof body.allowImages === "boolean") data.allowImages = body.allowImages;

    if (body.trustTier !== undefined) {
      const trustTier = Number(body.trustTier);
      if (![1, 2, 3].includes(trustTier)) {
        return NextResponse.json(
          { success: false, error: "trustTier must be 1, 2 or 3" },
          { status: 400 }
        );
      }
      data.trustTier = trustTier;
    }

    if (body.fetchIntervalMinutes !== undefined) {
      const value = Number(body.fetchIntervalMinutes);
      if (!Number.isInteger(value) || value < 15 || value > 1440) {
        return NextResponse.json(
          { success: false, error: "fetchIntervalMinutes must be between 15 and 1440" },
          { status: 400 }
        );
      }
      data.fetchIntervalMinutes = value;
    }

    // Clearing backoff resets the failure counter too, otherwise the
    // very next failure jumps straight back to a 12-hour wait.
    if (body.clearBackoff === true) {
      data.backoffUntil = null;
      data.consecutiveFailures = 0;
      data.status = data.enabled === false ? "DISABLED" : "HEALTHY";
      data.lastError = null;
    }

    if (Object.keys(data).length === 0) {
      return NextResponse.json({ success: false, error: "Nothing to update" }, { status: 400 });
    }

    const source = await prisma.newsSource.update({ where: { id }, data });

    await logAdminAction({
      actor: adminCheck.session,
      action: "news_network.source_update",
      targetType: "NewsSource",
      targetId: id,
      metadata: { key: source.key, ...data },
    });

    return NextResponse.json({ success: true, source });
  } catch (error) {
    console.error("ZRP News admin source update error:", error);
    return NextResponse.json({ success: false, error: "Failed to update source" }, { status: 500 });
  }
}

/**
 * DELETE /api/admin/news-network/sources/[id]
 *
 * Removes a source and its attribution records. Prefer disabling: a
 * deleted source takes its attribution history with it.
 */
export async function DELETE(_request: NextRequest, context: RouteContext) {
  const adminCheck = await requireAdmin();
  if (!adminCheck.authorized) return adminCheck.response;

  try {
    const { id } = await context.params;
    const source = await prisma.newsSource.delete({ where: { id } });

    await logAdminAction({
      actor: adminCheck.session,
      action: "news_network.source_delete",
      targetType: "NewsSource",
      targetId: id,
      metadata: { key: source.key, feedUrl: source.feedUrl },
    });

    return NextResponse.json({ success: true });
  } catch (error) {
    console.error("ZRP News admin source delete error:", error);
    return NextResponse.json({ success: false, error: "Failed to delete source" }, { status: 500 });
  }
}
