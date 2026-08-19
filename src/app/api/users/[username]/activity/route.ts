import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/db";

const DAYS = 371; // ~53 weeks, aligned to a GitHub-style grid

export async function GET(req: NextRequest, props: { params: Promise<{ username: string }> }) {
  const params = await props.params;
  try {
    const user = await prisma.user.findFirst({
      where: { username: { equals: params.username, mode: "insensitive" } },
      select: { id: true },
    });

    if (!user) {
      return NextResponse.json({ error: "User not found" }, { status: 404 });
    }

    const since = new Date();
    since.setDate(since.getDate() - DAYS);
    since.setHours(0, 0, 0, 0);

    const posts = await prisma.post.findMany({
      where: {
        authorId: user.id,
        status: "published",
        createdAt: { gte: since },
      },
      select: { createdAt: true },
    });

    // ─── Aggregate counts per day (YYYY-MM-DD) ───────────────────────
    const counts: Record<string, number> = {};
    for (const post of posts) {
      const key = post.createdAt.toISOString().slice(0, 10);
      counts[key] = (counts[key] || 0) + 1;
    }

    const data = Object.entries(counts).map(([date, count]) => ({ date, count }));

    return NextResponse.json({ data, totalContributions: posts.length });
  } catch (error) {
    console.error("Error fetching activity:", error);
    return NextResponse.json({ error: "Failed to fetch activity" }, { status: 500 });
  }
}
