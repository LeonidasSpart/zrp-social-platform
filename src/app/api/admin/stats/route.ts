import { NextRequest, NextResponse } from "next/server";
import { requireAdmin } from "@/lib/admin";
import { prisma } from "@/lib/db";

export async function GET(req: NextRequest) {
  const adminCheck = await requireAdmin();
  if (!adminCheck.authorized) return adminCheck.response;

  try {
    const [users, posts, comments, reports, pendingReports, roleCounts] = await Promise.all([
      prisma.user.count(),
      prisma.post.count(),
      prisma.comment.count(),
      prisma.report.count(),
      prisma.report.count({ where: { status: "pending" } }),
      prisma.user.groupBy({
        by: ["role"],
        _count: true,
      }),
    ]);

    // ─── Build typed role counts ──────────────────────────────────────
    const roleCountsMap: Record<string, number> = {};
    roleCounts.forEach((item) => {
      roleCountsMap[item.role] = item._count;
    });

    return NextResponse.json({
      users,
      posts,
      comments,
      reports,
      pendingReports,
      roleCounts: roleCountsMap,
    });
  } catch (error) {
    console.error("Stats error:", error);
    return NextResponse.json({ error: "Failed to fetch stats" }, { status: 500 });
  }
}
