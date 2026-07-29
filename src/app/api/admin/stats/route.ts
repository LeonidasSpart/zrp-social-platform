import { NextRequest, NextResponse } from "next/server";
import { requireAdmin } from "@/lib/admin";
import { prisma } from "@/lib/db";

export async function GET(req: NextRequest) {
  const adminCheck = await requireAdmin();
  if (!adminCheck.authorized) return adminCheck.response;

  try {
    const [users, posts, comments, reports, blocked] = await Promise.all([
      prisma.user.count(),
      prisma.post.count(),
      prisma.comment.count(),
      prisma.report.count({ where: { status: "pending" } }),
      prisma.blocked.count(),
    ]);

    return NextResponse.json({
      users,
      posts,
      comments,
      pendingReports: reports,
      blocked,
    });
  } catch (error) {
    return NextResponse.json({ error: "Failed to fetch stats" }, { status: 500 });
  }
}
