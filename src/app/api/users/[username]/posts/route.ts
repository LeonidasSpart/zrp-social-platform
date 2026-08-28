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
      select: { id: true, isPrivate: true },
    });

    if (!profileOwner) {
      return NextResponse.json({ error: "User not found" }, { status: 404 });
    }

    // ─── Private accounts: only the owner or an approved follower ────
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

    // ─── Fetch ONLY original posts by this user ─────────────────────
    // (No reposts – we only want posts authored by the user)
    const posts = await prisma.post.findMany({
      where: {
        authorId: profileOwner.id,
        status: "published",
      },
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
    });

    // ─── Add liked status for viewer ────────────────────────────────
    if (viewerId && posts.length > 0) {
      const likes = await prisma.like.findMany({
        where: {
          userId: viewerId,
          postId: { in: posts.map(p => p.id) },
        },
        select: { postId: true },
      });
      const likedIds = new Set(likes.map(l => l.postId));
      posts.forEach(p => {
        (p as any).liked = likedIds.has(p.id);
      });
    }

    return NextResponse.json(posts);
  } catch (error) {
    console.error("Error fetching user posts:", error);
    return NextResponse.json({ error: "Failed to fetch posts" }, { status: 500 });
  }
}
