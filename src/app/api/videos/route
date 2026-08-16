import { NextRequest, NextResponse } from "next/server";
import { getServerSession } from "next-auth";
import { authOptions } from "@/lib/auth";
import { prisma } from "@/lib/db";

export const dynamic = "force-dynamic";

// ─── Video feed: cursor-paginated, most recent video posts first ────
// Used by the fullscreen swipeable video viewer (tap a video → keep
// swiping to see more, TikTok/X-video-tab style).
export async function GET(req: NextRequest) {
  try {
    const session = await getServerSession(authOptions);
    const userId = session?.user?.id;
    const { searchParams } = new URL(req.url);
    const cursor = searchParams.get("cursor");
    const limit = Math.min(parseInt(searchParams.get("limit") || "10", 10), 30);
    // Optional: prioritize opening on a specific post first, then continue from there
    const startId = searchParams.get("startId");

    let excludedAuthorIds: string[] = [];
    if (userId) {
      const [blocked, blockers, muted] = await Promise.all([
        prisma.blocked.findMany({ where: { blockerId: userId }, select: { blockedId: true } }),
        prisma.blocked.findMany({ where: { blockedId: userId }, select: { blockerId: true } }),
        prisma.mute.findMany({ where: { muterId: userId }, select: { mutedId: true } }),
      ]);
      excludedAuthorIds = [
        ...blocked.map((b) => b.blockedId),
        ...blockers.map((b) => b.blockerId),
        ...muted.map((m) => m.mutedId),
      ];
    }

    const where: any = {
      authorId: { notIn: excludedAuthorIds },
      status: "published",
      scheduledAt: null,
      mediaType: "video",
      imageUrl: { not: null },
    };

    // If opening directly on a specific video, fetch that one first,
    // unpaginated, so the viewer can show it instantly.
    if (startId && !cursor) {
      const startPost = await prisma.post.findUnique({
        where: { id: startId },
        select: postSelect(),
      });
      if (startPost) {
        const rest = await prisma.post.findMany({
          take: limit,
          where: { ...where, id: { not: startId }, createdAt: { lt: startPost.createdAt } },
          orderBy: { createdAt: "desc" },
          select: postSelect(),
        });
        const posts = [startPost, ...rest];
        return await withLiked(posts, userId, rest.length === limit ? rest[rest.length - 1]?.id : null);
      }
    }

    const posts = await prisma.post.findMany({
      take: limit,
      ...(cursor ? { skip: 1, cursor: { id: cursor } } : {}),
      where,
      orderBy: { createdAt: "desc" },
      select: postSelect(),
    });

    const nextCursor = posts.length === limit ? posts[posts.length - 1].id : null;
    return await withLiked(posts, userId, nextCursor);
  } catch (error) {
    console.error("Error fetching video feed:", error);
    return NextResponse.json({ error: "Failed to fetch video feed" }, { status: 500 });
  }
}

function postSelect() {
  return {
    id: true,
    content: true,
    imageUrl: true,
    mediaType: true,
    createdAt: true,
    views: true,
    commentsEnabled: true,
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
  } as const;
}

async function withLiked(posts: any[], userId: string | undefined, nextCursor: string | null) {
  if (userId && posts.length > 0) {
    const postIds = posts.map((p) => p.id);
    // Also compute reposted, not just liked - previously missing here,
    // same gap the home feed had before it was fixed: the repost button
    // would work when tapped, but always render as "not reposted" on
    // load/refresh even for a Short the person had already reposted.
    const [likes, reposts] = await Promise.all([
      prisma.like.findMany({
        where: { userId, postId: { in: postIds } },
        select: { postId: true },
      }),
      prisma.repost.findMany({
        where: { userId, postId: { in: postIds } },
        select: { postId: true },
      }),
    ]);
    const likedIds = new Set(likes.map((l) => l.postId));
    const repostedIds = new Set(reposts.map((r) => r.postId));
    posts.forEach((p) => {
      p.liked = likedIds.has(p.id);
      p.reposted = repostedIds.has(p.id);
    });
  }
  return NextResponse.json({ posts, nextCursor });
}
