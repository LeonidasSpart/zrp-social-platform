import { NextRequest, NextResponse } from "next/server";
import { getServerSession } from "next-auth";
import { authOptions } from "@/lib/auth";
import { prisma } from "@/lib/db";

export async function GET(
  req: NextRequest,
  { params }: { params: { tag: string } }
) {
  try {
    const session = await getServerSession(authOptions);

    const posts = await prisma.post.findMany({
      where: {
        hashtags: { has: params.tag },
      },
      take: 50,
      orderBy: { createdAt: "desc" },
      include: {
        author: {
          select: {
            id: true,
            username: true,
            name: true,
            avatarUrl: true,
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

    if (session && session.user) {
      const likes = await prisma.like.findMany({
        where: {
          userId: session.user.id,
          postId: { in: posts.map((p) => p.id) },
        },
      });
      const likedIds = new Set(likes.map((l) => l.postId));
      posts.forEach((p) => {
        (p as any).liked = likedIds.has(p.id);
      });
    }

    return NextResponse.json(posts);
  } catch (error) {
    console.error("Error fetching hashtag posts:", error);
    return NextResponse.json({ error: "Failed to fetch posts" }, { status: 500 });
  }
}
