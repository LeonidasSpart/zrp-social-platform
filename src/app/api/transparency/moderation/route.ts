import { NextResponse } from "next/server";
import { prisma } from "@/lib/db";

// Public moderation transparency endpoint. Deliberately requires no
// authentication and returns aggregate counts only - never a reporter's
// identity, a reported user's identity, or any post/comment content.
// Backed entirely by the existing Report model; nothing new is tracked
// to build this.
// force-dynamic defers execution to request time instead of the build
// step - this environment's build has no DB connection (only Railway's
// production runtime does), matching the same fix already applied to
// sitemap.ts. revalidate still lets Next.js cache the response between
// real requests.
export const dynamic = "force-dynamic";
export const revalidate = 3600;

const REASONS = [
  "Spam",
  "Harassment or bullying",
  "Inappropriate content",
  "Misinformation",
  "Hate speech",
  "Impersonation",
  "Other",
];

const STATUSES = ["pending", "reviewed", "dismissed", "actioned"] as const;

const ACTION_TYPES = [
  "DELETE_POST",
  "WARN_USER",
  "BAN_USER",
  "MUTE_USER",
  "DELETE_COMMENT",
  "OTHER",
];

export async function GET() {
  try {
    const now = new Date();
    const since30 = new Date(now.getTime() - 30 * 24 * 60 * 60 * 1000);
    const since90 = new Date(now.getTime() - 90 * 24 * 60 * 60 * 1000);
    // Monthly buckets going back 12 months, oldest first.
    const monthsBack = 12;
    const seriesStart = new Date(now.getFullYear(), now.getMonth() - (monthsBack - 1), 1);

    const [
      totalReports,
      last30,
      last90,
      byReasonRaw,
      byStatusRaw,
      byActionTypeRaw,
      actionedForResolution,
      seriesRaw,
      appealsByStatusRaw,
    ] = await Promise.all([
      prisma.report.count(),
      prisma.report.count({ where: { createdAt: { gte: since30 } } }),
      prisma.report.count({ where: { createdAt: { gte: since90 } } }),
      prisma.report.groupBy({
        by: ["reason"],
        _count: { _all: true },
      }),
      prisma.report.groupBy({
        by: ["status"],
        _count: { _all: true },
      }),
      prisma.report.groupBy({
        by: ["actionType"],
        where: { status: "actioned", actionType: { not: null } },
        _count: { _all: true },
      }),
      prisma.report.findMany({
        where: { status: "actioned", actionedAt: { not: null } },
        select: { createdAt: true, actionedAt: true },
      }),
      prisma.report.findMany({
        where: { createdAt: { gte: seriesStart } },
        select: { createdAt: true, status: true },
      }),
      prisma.appeal.groupBy({
        by: ["status"],
        _count: { _all: true },
      }),
    ]);

    // Normalize reason/status/actionType counts against the known
    // taxonomies so every category always appears, even at zero -
    // real absence of a category is itself real information.
    const reasonCounts = new Map(byReasonRaw.map((r) => [r.reason, r._count._all]));
    const byReason = REASONS.map((reason) => ({
      reason,
      count: reasonCounts.get(reason) ?? 0,
    }));
    // Any reason value in the data that isn't in the known list (e.g.
    // legacy/free-text values) still gets counted, not silently dropped.
    const knownReasons = new Set(REASONS);
    const otherReasonCount = byReasonRaw
      .filter((r) => !knownReasons.has(r.reason))
      .reduce((sum, r) => sum + r._count._all, 0);
    if (otherReasonCount > 0) {
      const otherEntry = byReason.find((r) => r.reason === "Other");
      if (otherEntry) otherEntry.count += otherReasonCount;
    }

    const statusCounts = new Map(byStatusRaw.map((r) => [r.status, r._count._all]));
    const byStatus = STATUSES.map((status) => ({
      status,
      count: statusCounts.get(status) ?? 0,
    }));

    const actionCounts = new Map(
      byActionTypeRaw.map((r) => [r.actionType as string, r._count._all])
    );
    const byActionType = ACTION_TYPES.map((actionType) => ({
      actionType,
      count: actionCounts.get(actionType) ?? 0,
    }));

    // Median resolution time, in hours, for reports that received a
    // real moderation action. Median rather than mean so a handful of
    // very old/slow cases can't distort the headline number.
    const resolutionHours = actionedForResolution
      .map((r) => (r.actionedAt!.getTime() - r.createdAt.getTime()) / (1000 * 60 * 60))
      .filter((h) => h >= 0)
      .sort((a, b) => a - b);

    let medianResolutionHours: number | null = null;
    if (resolutionHours.length > 0) {
      const mid = Math.floor(resolutionHours.length / 2);
      medianResolutionHours =
        resolutionHours.length % 2 === 0
          ? (resolutionHours[mid - 1] + resolutionHours[mid]) / 2
          : resolutionHours[mid];
    }

    // Monthly time series: reports received vs. reports actioned,
    // bucketed by the report's own createdAt month.
    const seriesMap = new Map<string, { received: number; actioned: number }>();
    for (let i = 0; i < monthsBack; i++) {
      const d = new Date(seriesStart.getFullYear(), seriesStart.getMonth() + i, 1);
      const key = `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}`;
      seriesMap.set(key, { received: 0, actioned: 0 });
    }
    for (const r of seriesRaw) {
      const key = `${r.createdAt.getFullYear()}-${String(r.createdAt.getMonth() + 1).padStart(2, "0")}`;
      const bucket = seriesMap.get(key);
      if (!bucket) continue;
      bucket.received += 1;
      if (r.status === "actioned") bucket.actioned += 1;
    }
    const series = Array.from(seriesMap.entries()).map(([month, counts]) => ({
      month,
      ...counts,
    }));

    const appealCounts = new Map(appealsByStatusRaw.map((a) => [a.status, a._count._all]));
    const appeals = {
      pending: appealCounts.get("pending") ?? 0,
      upheld: appealCounts.get("upheld") ?? 0,
      overturned: appealCounts.get("overturned") ?? 0,
    };

    return NextResponse.json({
      generatedAt: now.toISOString(),
      totals: {
        allTime: totalReports,
        last30Days: last30,
        last90Days: last90,
      },
      byReason,
      byStatus,
      byActionType,
      medianResolutionHours,
      series,
      appeals,
    });
  } catch (error) {
    console.error("Moderation transparency error:", error);
    return NextResponse.json(
      { error: "Unable to load moderation transparency data" },
      { status: 500 }
    );
  }
}
