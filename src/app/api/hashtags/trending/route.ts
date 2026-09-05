import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/db";
import { getCached, setCached } from "@/lib/redis";

export const dynamic = 'force-dynamic';

export async function GET(req: NextRequest) {
  try {
    const requestedLimit = parseInt(req.nextUrl.searchParams.get("limit") || "10", 10);
    const limit = Math.min(Math.max(Number.isFinite(requestedLimit) ? requestedLimit : 10, 1), 50);

    // ─── CHECK CACHE ───────────────────────────────────────────
    // Cache holds the top 50 so both the compact Home teaser (limit=10)
    // and the full "See all" trending page (limit=50) share one entry.
    let trending = await getCached<{ tag: string; count: number }[]>("trending:hashtags:v2");

    if (!trending) {
      const posts = await prisma.post.findMany({
        take: 1000,
        select: { hashtags: true },
      });

      const hashtagCount: Record<string, number> = {};
      posts.forEach((p) => {
        p.hashtags?.forEach((tag) => {
          hashtagCount[tag] = (hashtagCount[tag] || 0) + 1;
        });
      });

      trending = Object.entries(hashtagCount)
        .sort((a, b) => b[1] - a[1])
        .slice(0, 50)
        .map(([tag, count]) => ({ tag, count }));

      // ─── CACHE FOR 5 MINUTES ──────────────────────────────────
      await setCached("trending:hashtags:v2", trending, 300);
    }

    return NextResponse.json(trending.slice(0, limit));
  } catch (error) {
    console.error("Trending error:", error);
    return NextResponse.json({ error: "Failed to fetch trending hashtags" }, { status: 500 });
  }
}
