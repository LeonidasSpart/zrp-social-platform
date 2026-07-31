import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/db";
import { getCached, setCached } from "@/lib/redis";

export const dynamic = 'force-dynamic';

export async function GET(req: NextRequest) {
  try {
    // ─── CHECK CACHE ───────────────────────────────────────────
    const cached = await getCached("trending:hashtags");
    if (cached) {
      return NextResponse.json(cached);
    }

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

    const trending = Object.entries(hashtagCount)
      .sort((a, b) => b[1] - a[1])
      .slice(0, 10)
      .map(([tag, count]) => ({ tag, count }));

    // ─── CACHE FOR 5 MINUTES ──────────────────────────────────
    await setCached("trending:hashtags", trending, 300);

    return NextResponse.json(trending);
  } catch (error) {
    console.error("Trending error:", error);
    return NextResponse.json({ error: "Failed to fetch trending hashtags" }, { status: 500 });
  }
}
