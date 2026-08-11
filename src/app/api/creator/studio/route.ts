import { NextRequest, NextResponse } from "next/server";
import { getServerSession } from "next-auth";
import { authOptions } from "@/lib/auth";
import { prisma } from "@/lib/db";

export const dynamic = "force-dynamic";

const DAYS = 30;

function dayKey(date: Date) {
  return date.toISOString().slice(0, 10);
}

function buildDayRange(days: number) {
  const keys: string[] = [];
  const today = new Date();
  today.setHours(0, 0, 0, 0);
  for (let i = days - 1; i >= 0; i--) {
    const d = new Date(today);
    d.setDate(d.getDate() - i);
    keys.push(dayKey(d));
  }
  return keys;
}

export async function GET(req: NextRequest) {
  try {
    const session = await getServerSession(authOptions);
    const userId = session?.user?.id;
    if (!userId) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }

    const since = new Date();
    since.setDate(since.getDate() - DAYS);
    since.setHours(0, 0, 0, 0);

    // ─── Content: this creator's posts, with counts ──────────────────
    const posts = await prisma.post.findMany({
      where: { authorId: userId, status: "published" },
      select: {
        id: true,
        content: true,
        imageUrl: true,
        createdAt: true,
        views: true,
        _count: { select: { likes: true, comments: true, reposts: true } },
      },
      orderBy: { createdAt: "desc" },
      take: 200, // cap for performance; recent creators won't exceed this
    });

    const postIds = posts.map((p) => p.id);

    // ─── Top posts by engagement score ─────────────────────────────
    const scored = posts
      .map((p) => ({
        ...p,
        score: p._count.likes + p._count.comments * 2 + p._count.reposts * 3,
      }))
      .sort((a, b) => b.score - a.score)
      .slice(0, 5);

    // ─── Daily engagement trend (likes + comments + reposts events) ──
    const dayRange = buildDayRange(DAYS);
    const dailyEngagement: Record<string, { likes: number; comments: number; reposts: number }> = {};
    dayRange.forEach((k) => (dailyEngagement[k] = { likes: 0, comments: 0, reposts: 0 }));

    if (postIds.length > 0) {
      const [likes, comments, reposts] = await Promise.all([
        prisma.like.findMany({
          where: { postId: { in: postIds }, createdAt: { gte: since } },
          select: { createdAt: true },
        }),
        prisma.comment.findMany({
          where: { postId: { in: postIds }, createdAt: { gte: since } },
          select: { createdAt: true },
        }),
        prisma.repost.findMany({
          where: { postId: { in: postIds }, createdAt: { gte: since } },
          select: { createdAt: true },
        }),
      ]);

      likes.forEach((l) => {
        const k = dayKey(l.createdAt);
        if (dailyEngagement[k]) dailyEngagement[k].likes++;
      });
      comments.forEach((c) => {
        const k = dayKey(c.createdAt);
        if (dailyEngagement[k]) dailyEngagement[k].comments++;
      });
      reposts.forEach((r) => {
        const k = dayKey(r.createdAt);
        if (dailyEngagement[k]) dailyEngagement[k].reposts++;
      });
    }

    const engagementTrend = dayRange.map((k) => ({
      date: k,
      likes: dailyEngagement[k].likes,
      comments: dailyEngagement[k].comments,
      reposts: dailyEngagement[k].reposts,
      total: dailyEngagement[k].likes + dailyEngagement[k].comments + dailyEngagement[k].reposts,
    }));

    const totalViews = posts.reduce((sum, p) => sum + (p.views || 0), 0);
    const totalLikes = posts.reduce((sum, p) => sum + p._count.likes, 0);
    const totalComments = posts.reduce((sum, p) => sum + p._count.comments, 0);
    const totalReposts = posts.reduce((sum, p) => sum + p._count.reposts, 0);

    // ─── Audience: follower growth ────────────────────────────────────
    const [totalFollowers, recentFollows] = await Promise.all([
      prisma.follow.count({ where: { followingId: userId } }),
      prisma.follow.findMany({
        where: { followingId: userId, createdAt: { gte: since } },
        select: { createdAt: true },
      }),
    ]);

    const dailyNewFollowers: Record<string, number> = {};
    dayRange.forEach((k) => (dailyNewFollowers[k] = 0));
    recentFollows.forEach((f) => {
      const k = dayKey(f.createdAt);
      if (dailyNewFollowers[k] !== undefined) dailyNewFollowers[k]++;
    });

    // Reconstruct cumulative total per day, working backward from today's total
    // (approximation: doesn't subtract unfollows within the window, which is
    // the standard simple approach without a full daily-snapshot system).
    const followersInWindow = recentFollows.length;
    let runningTotal = totalFollowers - followersInWindow;
    const audienceTrend = dayRange.map((k) => {
      runningTotal += dailyNewFollowers[k];
      return { date: k, newFollowers: dailyNewFollowers[k], totalFollowers: runningTotal };
    });

    const newFollowersInWindow = followersInWindow;

    return NextResponse.json({
      content: {
        topPosts: scored,
        engagementTrend,
        totals: {
          views: totalViews,
          likes: totalLikes,
          comments: totalComments,
          reposts: totalReposts,
          postCount: posts.length,
        },
      },
      audience: {
        totalFollowers,
        newFollowersInWindow,
        trend: audienceTrend,
      },
    });
  } catch (error) {
    console.error("Error fetching creator studio data:", error);
    return NextResponse.json({ error: "Failed to fetch creator studio data" }, { status: 500 });
  }
}
