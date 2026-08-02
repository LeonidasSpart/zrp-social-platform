import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/db";

export const dynamic = 'force-dynamic';

export async function GET(req: NextRequest) {
  // Simple authentication: require a secret key to prevent abuse
  const authHeader = req.headers.get("authorization");
  const secret = process.env.CRON_SECRET;
  if (secret && authHeader !== `Bearer ${secret}`) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  try {
    const now = new Date();

    const scheduledPosts = await prisma.post.findMany({
      where: {
        status: "scheduled",
        scheduledAt: { lte: now },
      },
      include: {
        author: {
          select: {
            id: true,
            username: true,
            name: true,
            avatarUrl: true,
            badgeType: true,
          },
        },
      },
    });

    if (scheduledPosts.length === 0) {
      return NextResponse.json({ message: "No posts to publish" });
    }

    // Update to published
    const publishedIds = scheduledPosts.map(p => p.id);
    await prisma.post.updateMany({
      where: { id: { in: publishedIds } },
      data: { status: "published" },
    });

    return NextResponse.json({
      message: `Published ${scheduledPosts.length} scheduled posts.`,
      posts: scheduledPosts,
    });
  } catch (error) {
    console.error("Cron error:", error);
    return NextResponse.json({ error: "Failed to publish scheduled posts" }, { status: 500 });
  }
}
