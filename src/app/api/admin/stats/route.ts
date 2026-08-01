import { NextRequest, NextResponse } from "next/server";
import { getServerSession } from "next-auth";
import { authOptions } from "@/lib/auth";
import { prisma } from "@/lib/db";

export async function GET(req: NextRequest) {
  const session = await getServerSession(authOptions);
  if (!session?.user?.isAdmin) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

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
