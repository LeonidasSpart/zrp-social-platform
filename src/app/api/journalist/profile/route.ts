import { NextResponse } from "next/server";
import { getServerSession } from "next-auth";
import { authOptions } from "@/lib/auth";
import { prisma } from "@/lib/db";

/**
 * GET /api/journalist/profile
 *
 * Returns the signed-in user's journalist application/profile (if any)
 * plus a summary of their article counts by status, for the
 * Journalist Dashboard.
 */
export async function GET() {
  try {
    const session = await getServerSession(authOptions);

    if (!session?.user) {
      return NextResponse.json({ success: false, error: "Unauthorized" }, { status: 401 });
    }

    const [user, profile, statusCounts, recentArticles] = await Promise.all([
      prisma.user.findUnique({
        where: { id: session.user.id },
        select: { role: true, badgeType: true },
      }),
      prisma.journalistProfile.findUnique({
        where: { userId: session.user.id },
      }),
      prisma.newsArticle.groupBy({
        by: ["status"],
        where: { authorId: session.user.id },
        _count: { _all: true },
      }),
      prisma.newsArticle.findMany({
        where: { authorId: session.user.id },
        orderBy: [{ updatedAt: "desc" }],
        take: 10,
        select: {
          id: true,
          title: true,
          slug: true,
          status: true,
          category: true,
          coverImage: true,
          views: true,
          reviewNote: true,
          submittedAt: true,
          publishedAt: true,
          createdAt: true,
          updatedAt: true,
        },
      }),
    ]);

    const counts = {
      total: 0,
      draft: 0,
      pendingReview: 0,
      published: 0,
      rejected: 0,
      archived: 0,
    };

    for (const row of statusCounts) {
      counts.total += row._count._all;
      if (row.status === "DRAFT") counts.draft = row._count._all;
      if (row.status === "PENDING_REVIEW") counts.pendingReview = row._count._all;
      if (row.status === "PUBLISHED") counts.published = row._count._all;
      if (row.status === "REJECTED") counts.rejected = row._count._all;
      if (row.status === "ARCHIVED") counts.archived = row._count._all;
    }

    return NextResponse.json({
      success: true,
      isJournalist: user?.role === "JOURNALIST",
      profile,
      counts,
      recentArticles,
    });
  } catch (error) {
    console.error("GET /api/journalist/profile error:", error);
    return NextResponse.json(
      { success: false, error: "Failed to load journalist profile" },
      { status: 500 }
    );
  }
}
