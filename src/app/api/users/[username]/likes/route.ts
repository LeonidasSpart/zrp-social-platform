import { NextRequest, NextResponse } from "next/server";
import { getServerSession } from "next-auth";
import { authOptions } from "@/lib/auth";
import { prisma } from "@/lib/db";
import { canViewPrivateContent } from "@/lib/permissions";
import { parseCursorParams, buildPage } from "@/lib/pagination";

export async function GET(req: NextRequest, props: { params: Promise<{ username: string }> }) {
  const params = await props.params;
  try {
    const session = await getServerSession(authOptions);
    const viewerId = session?.user?.id;
    const { cursor, limit } = parseCursorParams(req);

    // ─── Find profile owner ──────────────────────────────────────────
    const profileOwner = await prisma.user.findUnique({
      where: { username: params.username },
      select: { id: true, isPrivate: true, publicLikes: true },
    });

    if (!profileOwner) {
      return NextResponse.json({ error: "User not found" }, { status: 404 });
    }

    // ─── Private accounts: only the owner or an approved follower.
    // Even for non-private accounts, likes are only shown if the owner
    // has opted in via publicLikes. ─────────────────────────────────
    const isOwner = viewerId === profileOwner.id;
    if (!isOwner && !profileOwner.publicLikes) {
      return NextResponse.json({ items: [], nextCursor: null });
    }
    if (!(await canViewPrivateContent(viewerId, profileOwner.id, profileOwner.isPrivate))) {
      return NextResponse.json({ items: [], nextCursor: null });
    }

    // ─── Get excluded users (blocked + blockers + muted) ──────────
    let excludedAuthorIds: string[] = [];
    if (viewerId) {
      const [blocked, blockers, muted] = await Promise.all([
        prisma.blocked.findMany({
          where: { blockerId: viewerId },
          select: { blockedId: true },
        }),
        prisma.blocked.findMany({
          where: { blockedId: viewerId },
          select: { blockerId: true },
        }),
        prisma.mute.findMany({
          where: { muterId: viewerId },
          select: { mutedId: true },
        }),
      ]);
      const blockedIds = blocked.map(b => b.blockedId);
      const blockerIds = blockers.map(b => b.blockerId);
      const mutedIds = muted.map(m => m.mutedId);
      excludedAuthorIds = [...blockedIds, ...blockerIds, ...mutedIds];
    }

    // ─── If profile owner is excluded, return empty ──────────────────
    const isExcluded = excludedAuthorIds.includes(profileOwner.id);
    if (isExcluded) {
      return NextResponse.json({ items: [], nextCursor: null });
    }

    // ─── Fetch likes by profile owner, excluding posts from blocked authors ──
    // Cursor/paging is on the Like row itself, not the Post it points
    // to (a Post can be liked by many users, so Post.id alone wouldn't
    // be a valid position marker for "this user's likes, in order").
    const rawLikes = await prisma.like.findMany({
      where: {
        userId: profileOwner.id,
        post: {
          authorId: { notIn: excludedAuthorIds },
          status: "published",
        },
      },
      orderBy: { createdAt: "desc" },
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
            quotePost: {
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
                    quotedBy: true,
                  },
                },
              },
            },
            _count: {
              select: {
                likes: true,
                comments: true,
                reposts: true,
                quotedBy: true,
              },
            },
          },
        },
      },
    });

    const { items: likes, nextCursor } = buildPage(rawLikes, limit);

    // ─── Extract posts from likes ────────────────────────────────────
    let posts = likes.map((like) => like.post);

    // ─── Add liked status for viewer ────────────────────────────────
    if (viewerId && posts.length > 0) {
      const viewerLikes = await prisma.like.findMany({
        where: {
          userId: viewerId,
          postId: { in: posts.map((p) => p.id) },
        },
      });
      const likedIds = new Set(viewerLikes.map((l) => l.postId));
      posts.forEach((p) => {
        (p as any).liked = likedIds.has(p.id);
      });
    }

    return NextResponse.json({ items: posts, nextCursor });
  } catch (error) {
    console.error("Error fetching liked posts:", error);
    return NextResponse.json({ error: "Failed to fetch liked posts" }, { status: 500 });
  }
}
