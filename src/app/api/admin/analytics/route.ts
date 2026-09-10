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
    // Two real bugs fixed here:
    // 1. The old query unioned all 5 tables into one bare `id` column
    //    with no source-table tag, then ran the identical
    //    COUNT(DISTINCT CASE WHEN ...) expression for all 5 output
    //    columns - so every row's users/posts/comments/likes/reposts
    //    values were mathematically guaranteed to be equal (all just
    //    "total rows that day across every table combined", repeated
    //    5 times). A `source` column carried through the UNION and a
    //    conditional COUNT per source is what actually produces 5
    //    independent per-type counts.
    // 2. Postgres COUNT() returns bigint, which Prisma's $queryRaw
    //    surfaces as a JS BigInt - and JSON.stringify (inside
    //    NextResponse.json below) throws "Do not know how to
    //    serialize a BigInt" on that, which this route's own
    //    try/catch was swallowing into a plain 500 any time there was
    //    real activity in the last 30 days. Casting each COUNT to
    //    ::int keeps it a normal number the whole way through.
    const dailyStats = await prisma.$queryRaw`
      SELECT
        DATE("createdAt") as date,
        COUNT(*) FILTER (WHERE source = 'user')::int as users,
        COUNT(*) FILTER (WHERE source = 'post')::int as posts,
        COUNT(*) FILTER (WHERE source = 'comment')::int as comments,
        COUNT(*) FILTER (WHERE source = 'like')::int as likes,
        COUNT(*) FILTER (WHERE source = 'repost')::int as reposts
      FROM (
        SELECT id, "createdAt", 'user' as source FROM "User" WHERE "createdAt" >= ${thirtyDaysAgo}
        UNION ALL
        SELECT id, "createdAt", 'post' as source FROM "Post" WHERE "createdAt" >= ${thirtyDaysAgo}
        UNION ALL
        SELECT id, "createdAt", 'comment' as source FROM "Comment" WHERE "createdAt" >= ${thirtyDaysAgo}
        UNION ALL
        SELECT id, "createdAt", 'like' as source FROM "Like" WHERE "createdAt" >= ${thirtyDaysAgo}
        UNION ALL
        SELECT id, "createdAt", 'repost' as source FROM "Repost" WHERE "createdAt" >= ${thirtyDaysAgo}
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
