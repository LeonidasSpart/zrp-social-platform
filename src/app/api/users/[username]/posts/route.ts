import { NextRequest, NextResponse } from "next/server";
import { getServerSession } from "next-auth";
import { authOptions } from "@/lib/auth";
import { prisma } from "@/lib/db";

export async function GET(
  req: NextRequest,
  { params }: { params: { username: string } }
) {
  try {
    const session = await getServerSession(authOptions);

    const user = await prisma.user.findUnique({
      where: { username: params.username },
      select: { id: true },
    });

    if (!user) {
      return NextResponse.json({ error: "User not found" }, { status: 404 });
    }

    const posts = await prisma.post.findMany({
      where: { authorId: user.id },
      take: 20,
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

    const postsWithCounts = await Promise.all(
      posts.map(async (post) => {
        const [likesCount, commentsCount, repostsCount] = await Promise.all([
          prisma.like.count({ where: { postId: post.id } }),
          prisma.comment.count({ where: { postId: post.id } }),
          prisma.repost.count({ where: { postId: post.id } }),
        ]);
        return {
          ...post,
          _count: {
            likes: likesCount,
            comments: commentsCount,
            reposts: repostsCount,
          },
        };
      })
    );

    return NextResponse.json(postsWithCounts);
  } catch (error) {
    console.error("Error fetching user posts:", error);
    return NextResponse.json({ error: "Failed to fetch posts" }, { status: 500 });
  }
}
