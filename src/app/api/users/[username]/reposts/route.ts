import { NextRequest, NextResponse } from "next/server";
import { getServerSession } from "next-auth";
import { authOptions } from "@/lib/auth";
import { prisma } from "@/lib/db";
import { canViewPrivateContent } from "@/lib/permissions";

export async function GET(req: NextRequest, props: { params: Promise<{ username: string }> }) {
  const params = await props.params;
  try {
    const session = await getServerSession(authOptions);
    const viewerId = session?.user?.id;

    // Find the user
    const user = await prisma.user.findUnique({
      where: { username: params.username },
      select: { id: true, isPrivate: true, publicFollowing: true },
    });
    if (!user) {
      return NextResponse.json({ error: "User not found" }, { status: 404 });
    }

    // ─── Private accounts: only the owner or an approved follower ────
    if (!(await canViewPrivateContent(viewerId, user.id, user.isPrivate))) {
      return NextResponse.json([]);
    }

    // Get posts this user has reposted
    const reposts = await prisma.repost.findMany({
      where: { userId: user.id },
      // Stopgap hard cap, see users/[username]/posts/route.ts.
      take: 100,
      include: {
        post: {
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
              select: { likes: true, comments: true, reposts: true, quotedBy: true },
            },
          },
        },
      },
      orderBy: { createdAt: "desc" },
    });

    const posts = reposts.map((r) => r.post);

    // Add liked status for viewer
    if (viewerId && posts.length > 0) {
      const likes = await prisma.like.findMany({
        where: {
          userId: viewerId,
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
    console.error("Error fetching reposts:", error);
    return NextResponse.json({ error: "Failed to fetch reposts" }, { status: 500 });
  }
}
