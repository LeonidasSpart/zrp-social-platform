import { NextRequest, NextResponse } from "next/server";
import { getServerSession } from "next-auth";
import { authOptions } from "@/lib/auth";
import { prisma } from "@/lib/db";
import { canViewPrivateContent, viewablePostAuthorFilter } from "@/lib/permissions";
import { isBlockedEitherWay } from "@/lib/auth-guards";
import { parseCursorParams, buildPage } from "@/lib/pagination";
import { applyPremiumGating } from "@/lib/premium-content";

export async function GET(req: NextRequest, props: { params: Promise<{ username: string }> }) {
  const params = await props.params;
  try {
    const session = await getServerSession(authOptions);
    const viewerId = session?.user?.id;
    const { cursor, limit } = parseCursorParams(req);

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
      return NextResponse.json({ items: [], nextCursor: null });
    }

    // Same block rule as the sibling posts/likes/media/replies tabs:
    // a profile owner blocked either way sees nothing here.
    if (viewerId && viewerId !== user.id && (await isBlockedEitherWay(viewerId, user.id))) {
      return NextResponse.json({ items: [], nextCursor: null });
    }

    // Get posts this user has reposted. Cursor/paging is on the Repost
    // row itself, not the Post (a Post can be reposted by many users).
    // The reposted post itself must be one the VIEWER may see: published,
    // and not by a private account the viewer doesn't follow.
    const rawReposts = await prisma.repost.findMany({
      where: {
        userId: user.id,
        post: { status: "published", author: viewablePostAuthorFilter(viewerId) },
      },
      take: limit + 1,
      ...(cursor ? { cursor: { id: cursor }, skip: 1 } : {}),
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
            poll: {
              include: {
                votes_user: {
                  where: viewerId ? { userId: viewerId } : undefined,
                  select: { optionIndex: true },
                },
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

    const { items: reposts, nextCursor } = buildPage(rawReposts, limit);
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

    // ⚠️ SECURITY: redact pay-per-view content the viewer hasn't paid
    // for - see src/lib/premium-content.ts.
    const gatedPosts = await applyPremiumGating(posts, viewerId);

    return NextResponse.json({ items: gatedPosts, nextCursor });
  } catch (error) {
    console.error("Error fetching reposts:", error);
    return NextResponse.json({ error: "Failed to fetch reposts" }, { status: 500 });
  }
}
