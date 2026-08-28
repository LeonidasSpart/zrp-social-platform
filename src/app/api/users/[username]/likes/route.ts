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
      return NextResponse.json([]);
    }
    if (!(await canViewPrivateContent(viewerId, profileOwner.id, profileOwner.isPrivate))) {
      return NextResponse.json([]);
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
      return NextResponse.json([]);
    }

    // ─── Fetch likes by profile owner, excluding posts from blocked authors ──
    const likes = await prisma.like.findMany({
      where: {
        userId: profileOwner.id,
        post: {
          authorId: { notIn: excludedAuthorIds },
          status: "published",
        },
      },
      orderBy: { createdAt: "desc" },
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

    return NextResponse.json(posts);
  } catch (error) {
    console.error("Error fetching liked posts:", error);
    return NextResponse.json({ error: "Failed to fetch liked posts" }, { status: 500 });
  }
}
