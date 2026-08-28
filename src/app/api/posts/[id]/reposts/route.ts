import { NextRequest, NextResponse } from "next/server";
import { getServerSession } from "next-auth";
import { authOptions } from "@/lib/auth";
import { prisma } from "@/lib/db";
import { canViewPrivateContent } from "@/lib/permissions";
import { parseCursorParams, buildPage } from "@/lib/pagination";

export async function GET(req: NextRequest, props: { params: Promise<{ id: string }> }) {
  const params = await props.params;
  try {
    const postId = params.id;
    const session = await getServerSession(authOptions);
    const viewerId = session?.user?.id;
    const { cursor, limit } = parseCursorParams(req);

    const post = await prisma.post.findUnique({
      where: { id: postId },
      select: { authorId: true, author: { select: { isPrivate: true } } },
    });
    if (!post) {
      return NextResponse.json({ error: "Post not found" }, { status: 404 });
    }
    if (!(await canViewPrivateContent(viewerId, post.authorId, post.author.isPrivate))) {
      return NextResponse.json({ items: [], nextCursor: null });
    }

    // Cursor/paging is on the Repost row itself, not the reposting
    // user's id.
    const rawReposts = await prisma.repost.findMany({
      where: { postId },
      orderBy: { createdAt: "desc" },
      take: limit + 1,
      ...(cursor ? { cursor: { id: cursor }, skip: 1 } : {}),
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

    const { items: reposts, nextCursor } = buildPage(rawReposts, limit);
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

    return NextResponse.json({ items: users, nextCursor });
  } catch (error) {
    console.error("Error fetching reposts:", error);
    return NextResponse.json({ error: "Failed to fetch reposts" }, { status: 500 });
  }
}
