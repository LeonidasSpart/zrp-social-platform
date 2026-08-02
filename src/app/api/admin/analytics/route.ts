import { NextRequest, NextResponse } from "next/server";
import { requireAdmin } from "@/lib/admin";
import { prisma } from "@/lib/db";

export async function GET(req: NextRequest) {
  const adminCheck = await requireAdmin();
  if (!adminCheck.authorized) return adminCheck.response;

  try {
    const now = new Date();
    const thirtyDaysAgo = new Date(now);
    thirtyDaysAgo.setDate(thirtyDaysAgo.getDate() - 30);

    // ─── 1. Aggregates ──────────────────────────────────────────────
    const [usersCount, postsCount, commentsCount, likesCount, repostsCount] = await Promise.all([
      prisma.user.count(),
      prisma.post.count(),
      prisma.comment.count(),
      prisma.like.count(),
      prisma.repost.count(),
    ]);

    // ─── 2. Daily stats (last 30 days) ──────────────────────────────
    const dailyStats = await prisma.$queryRaw`
      SELECT
        DATE("createdAt") as date,
        COUNT(DISTINCT CASE WHEN "createdAt" >= ${thirtyDaysAgo} THEN id END) as users,
        COUNT(DISTINCT CASE WHEN "createdAt" >= ${thirtyDaysAgo} THEN id END) as posts,
        COUNT(DISTINCT CASE WHEN "createdAt" >= ${thirtyDaysAgo} THEN id END) as comments,
        COUNT(DISTINCT CASE WHEN "createdAt" >= ${thirtyDaysAgo} THEN id END) as likes,
        COUNT(DISTINCT CASE WHEN "createdAt" >= ${thirtyDaysAgo} THEN id END) as reposts
      FROM (
        SELECT id, "createdAt" FROM "User" WHERE "createdAt" >= ${thirtyDaysAgo}
        UNION ALL
        SELECT id, "createdAt" FROM "Post" WHERE "createdAt" >= ${thirtyDaysAgo}
        UNION ALL
        SELECT id, "createdAt" FROM "Comment" WHERE "createdAt" >= ${thirtyDaysAgo}
        UNION ALL
        SELECT id, "createdAt" FROM "Like" WHERE "createdAt" >= ${thirtyDaysAgo}
        UNION ALL
        SELECT id, "createdAt" FROM "Repost" WHERE "createdAt" >= ${thirtyDaysAgo}
      ) t
      GROUP BY DATE("createdAt")
      ORDER BY date ASC
    `;

    // ─── 3. Top posts by engagement ──────────────────────────────────
    const topPosts = await prisma.post.findMany({
      take: 10,
      orderBy: {
        likes: { _count: "desc" },
      },
      select: {
        id: true,
        content: true,
        createdAt: true,
        author: {
          select: {
            username: true,
            name: true,
          },
        },
        _count: {
          select: {
            likes: true,
            comments: true,
            reposts: true,
          },
        },
      },
    });

    // Sort by total engagement (likes + comments + reposts)
    const sortedTopPosts = topPosts
      .map((p) => ({
        ...p,
        engagement: p._count.likes + p._count.comments + p._count.reposts,
      }))
      .sort((a, b) => b.engagement - a.engagement)
      .slice(0, 10);

    // ─── 4. Engagement rate ──────────────────────────────────────────
    const postsWithCounts = await prisma.post.findMany({
      select: {
        _count: {
          select: {
            likes: true,
            comments: true,
          },
        },
      },
    });
    const totalLikes = postsWithCounts.reduce((acc, p) => acc + p._count.likes, 0);
    const totalComments = postsWithCounts.reduce((acc, p) => acc + p._count.comments, 0);
    const totalPosts = postsWithCounts.length;
    const avgLikesPerPost = totalPosts > 0 ? (totalLikes / totalPosts).toFixed(1) : 0;
    const avgCommentsPerPost = totalPosts > 0 ? (totalComments / totalPosts).toFixed(1) : 0;

    return NextResponse.json({
      summary: {
        users: usersCount,
        posts: postsCount,
        comments: commentsCount,
        likes: likesCount,
        reposts: repostsCount,
      },
      daily: dailyStats,
      topPosts: sortedTopPosts,
      engagement: {
        avgLikesPerPost: parseFloat(avgLikesPerPost as string),
        avgCommentsPerPost: parseFloat(avgCommentsPerPost as string),
        totalLikes,
        totalComments,
        totalPosts,
      },
    });
  } catch (error) {
    console.error("Analytics error:", error);
    return NextResponse.json({ error: "Failed to fetch analytics" }, { status: 500 });
  }
}
