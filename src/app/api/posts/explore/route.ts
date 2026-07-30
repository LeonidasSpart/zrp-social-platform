import { NextRequest, NextResponse } from "next/server";
import { getServerSession } from "next-auth";
import { authOptions } from "@/lib/auth";
import { prisma } from "@/lib/db";

export async function GET(req: NextRequest) {
  try {
    const session = await getServerSession(authOptions);

    const posts = await prisma.post.findMany({
      take: 50,
      orderBy: { createdAt: "desc" },
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
        _count: {
          select: {
            likes: true,
            comments: true,
            reposts: true,
          },
        },
      },
    });

    const sortedPosts = posts.sort((a, b) => {
      const engagementA = a._count.likes + a._count.comments + a._count.reposts;
      const engagementB = b._count.likes + b._count.comments + b._count.reposts;
      return engagementB - engagementA;
    });

    if (session && session.user) {
      const likes = await prisma.like.findMany({
        where: {
          userId: session.user.id,
          postId: { in: sortedPosts.map((p) => p.id) },
        },
      });
      const likedIds = new Set(likes.map((l) => l.postId));
      sortedPosts.forEach((p) => {
        (p as any).liked = likedIds.has(p.id);
      });
    }

    return NextResponse.json(sortedPosts);
  } catch (error) {
    console.error("Error fetching explore posts:", error);
    return NextResponse.json({ error: "Failed to fetch explore posts" }, { status: 500 });
  }
}
