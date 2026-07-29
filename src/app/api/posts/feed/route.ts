import { NextRequest, NextResponse } from "next/server";
import { getServerSession } from "next-auth";
import { authOptions } from "@/lib/auth";
import { prisma } from "@/lib/db";

export async function GET(req: NextRequest) {
  const session = await getServerSession(authOptions);
  if (!session || !session.user) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  try {
    const followed = await prisma.follow.findMany({
      where: { followerId: session.user.id },
      select: { followingId: true },
    });
    const followedIds = followed.map(f => f.followingId);
    followedIds.push(session.user.id); // include own posts

    const posts = await prisma.post.findMany({
      where: {
        authorId: { in: followedIds },
      },
      take: 30,
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

    const likes = await prisma.like.findMany({
      where: {
        userId: session.user.id,
        postId: { in: posts.map(p => p.id) },
      },
    });
    const likedIds = new Set(likes.map(l => l.postId));
    posts.forEach(p => {
      (p as any).liked = likedIds.has(p.id);
    });

    return NextResponse.json(posts);
  } catch (error) {
    console.error("Error fetching feed:", error);
    return NextResponse.json({ error: "Failed to fetch feed" }, { status: 500 });
  }
}
