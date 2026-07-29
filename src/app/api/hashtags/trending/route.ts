import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/db";

export async function GET(req: NextRequest) {
  try {
    // Get all posts and extract hashtags
    const posts = await prisma.post.findMany({
      take: 1000,
      select: { hashtags: true },
    });

    // Count hashtag occurrences
    const hashtagCount: Record<string, number> = {};
    posts.forEach((post) => {
      post.hashtags?.forEach((tag) => {
        hashtagCount[tag] = (hashtagCount[tag] || 0) + 1;
      });
    });

    // Sort by count and return top 10
    const trending = Object.entries(hashtagCount)
      .sort((a, b) => b[1] - a[1])
      .slice(0, 10)
      .map(([tag, count]) => ({ tag, count }));

    return NextResponse.json(trending);
  } catch (error) {
    console.error("Error fetching trending hashtags:", error);
    return NextResponse.json({ error: "Failed to fetch trending hashtags" }, { status: 500 });
  }
}
