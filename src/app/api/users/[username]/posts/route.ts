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
    const viewerId = session?.user?.id;

    // ─── Find profile owner ──────────────────────────────────────────
    const profileOwner = await prisma.user.findUnique({
      where: { username: params.username },
      select: { id: true },
    });

    if (!profileOwner) {
      return NextResponse.json({ error: "User not found" }, { status: 404 });
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

    // ─── Fetch original posts by this user ──────────────────────────
    const originalPosts = await prisma.post.findMany({
      where: {
        authorId: profileOwner.id,
        status: "published",
      },
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

    // ─── Fetch reposts by this user ──────────────────────────────────
    const reposts = await prisma.repost.findMany({
      where: {
        userId: profileOwner.id,
        post: {
          status: "published",
          authorId: { notIn: excludedAuthorIds }, // exclude reposts of blocked authors
        },
      },
      orderBy: { createdAt: "desc" },
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

    // ─── Combine and transform ──────────────────────────────────────
    const originalMapped = originalPosts.map(post => ({
      ...post,
      isRepost: false,
      repostId: null,
      repostedAt: null,
      repostOriginalAuthor: null,
    }));

    const repostMapped = reposts.map(repost => ({
      id: repost.post.id,
      content: repost.post.content,
      imageUrl: repost.post.imageUrl,
      createdAt: repost.createdAt, // use repost creation time for sorting
      updatedAt: repost.post.updatedAt,
      views: repost.post.views,
      author: repost.post.author,
      _count: repost.post._count,
      quotePost: repost.post.quotePost,
      isRepost: true,
      repostId: repost.id,
      repostedAt: repost.createdAt,
      repostOriginalAuthor: repost.post.author,
    }));

    // Combine and sort by createdAt descending
    const combined = [...originalMapped, ...repostMapped].sort(
      (a, b) => new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime()
    );

    // ─── Add liked status for viewer ────────────────────────────────
    if (viewerId && combined.length > 0) {
      const postIds = combined.map(p => p.id);
      const likes = await prisma.like.findMany({
        where: {
          userId: viewerId,
          postId: { in: postIds },
        },
      });
      const likedIds = new Set(likes.map(l => l.postId));
      combined.forEach(p => {
        (p as any).liked = likedIds.has(p.id);
      });
    }

    return NextResponse.json(combined);
  } catch (error) {
    console.error("Error fetching profile posts with reposts:", error);
    return NextResponse.json({ error: "Failed to fetch posts" }, { status: 500 });
  }
}
