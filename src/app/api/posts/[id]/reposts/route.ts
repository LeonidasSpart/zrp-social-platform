import { NextRequest, NextResponse } from "next/server";
import { getServerSession } from "next-auth";
import { authOptions } from "@/lib/auth";
import { prisma } from "@/lib/db";
import { canViewPrivateContent } from "@/lib/permissions";

export async function GET(req: NextRequest, props: { params: Promise<{ id: string }> }) {
  const params = await props.params;
  try {
    const postId = params.id;
    const session = await getServerSession(authOptions);
    const viewerId = session?.user?.id;

    const post = await prisma.post.findUnique({
      where: { id: postId },
      select: { authorId: true, author: { select: { isPrivate: true } } },
    });
    if (!post) {
      return NextResponse.json({ error: "Post not found" }, { status: 404 });
    }
    if (!(await canViewPrivateContent(viewerId, post.authorId, post.author.isPrivate))) {
      return NextResponse.json([]);
    }

    const reposts = await prisma.repost.findMany({
      where: { postId },
      orderBy: { createdAt: "desc" },
      // Stopgap hard cap - a viral post's repost list was previously
      // unbounded. See users/[username]/posts/route.ts for the same
      // pattern applied earlier.
      take: 100,
      include: {
        user: {
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

    const users = reposts.map(r => r.user);

    // Check if viewer follows each user
    if (viewerId && users.length > 0) {
      const follows = await prisma.follow.findMany({
        where: {
          followerId: viewerId,
          followingId: { in: users.map(u => u.id) },
        },
        select: { followingId: true },
      });
      const followingIds = new Set(follows.map(f => f.followingId));
      users.forEach(u => (u as any).isFollowing = followingIds.has(u.id));
    }

    return NextResponse.json(users);
  } catch (error) {
    console.error("Error fetching reposts:", error);
    return NextResponse.json({ error: "Failed to fetch reposts" }, { status: 500 });
  }
}
