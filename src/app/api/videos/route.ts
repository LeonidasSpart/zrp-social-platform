import { NextRequest, NextResponse } from "next/server";
import { getServerSession } from "next-auth";
import { authOptions } from "@/lib/auth";
import { prisma } from "@/lib/db";
import { applyPremiumGating } from "@/lib/premium-content";
import { viewablePostAuthorFilter } from "@/lib/permissions";
// Shared video/GIF/image classifier, also used by ZRP Discover
// (src/lib/discover/candidates.ts) - see src/lib/video-media.ts for
// the extracted logic and its priority rules. Behavior here is
// unchanged from before the extraction.
import { isRealVideoPost } from "@/lib/video-media";

export const dynamic = "force-dynamic";

// ─────────────────────────────────────────────────────────────
// VIDEO FEED
// ─────────────────────────────────────────────────────────────
//
// IMPORTANT:
//
// Videos may be stored at URLs that DO NOT contain a file
// extension.
//
// Therefore:
//
//   mediaType === "video"
//
// is valid AFTER GIF/image protection has been applied.
//
// GIFs must NEVER enter the video feed.
//
// Known image extensions are also rejected.
//
// Known video extensions are accepted even if mediaType is
// missing.
//
// This works with both:
//
//   mediaType: "video"
//   imageUrl: "https://.../file"
//
// and:
//
//   mediaType: "video"
//   imageUrl: "https://.../video.mp4"
// ─────────────────────────────────────────────────────────────

export async function GET(req: NextRequest) {
  try {
    const session = await getServerSession(authOptions);

    const userId = session?.user?.id;

    const { searchParams } = new URL(req.url);

    const cursor = searchParams.get("cursor");

    const requestedLimit = parseInt(
      searchParams.get("limit") || "10",
      10
    );

    const limit = Math.min(
      Math.max(
        Number.isFinite(requestedLimit)
          ? requestedLimit
          : 10,
        1
      ),
      30
    );

    const startId = searchParams.get("startId");

    // ─────────────────────────────────────────────────────────
    // BLOCKED / MUTED USERS
    // ─────────────────────────────────────────────────────────

    let excludedAuthorIds: string[] = [];

    if (userId) {
      const [blocked, blockers, muted] = await Promise.all([
        prisma.blocked.findMany({
          where: {
            blockerId: userId,
          },
          select: {
            blockedId: true,
          },
        }),

        prisma.blocked.findMany({
          where: {
            blockedId: userId,
          },
          select: {
            blockerId: true,
          },
        }),

        prisma.mute.findMany({
          where: {
            muterId: userId,
          },
          select: {
            mutedId: true,
          },
        }),
      ]);

      excludedAuthorIds = Array.from(
        new Set([
          ...blocked.map((item) => item.blockedId),
          ...blockers.map((item) => item.blockerId),
          ...muted.map((item) => item.mutedId),
        ])
      );
    }

    // ─────────────────────────────────────────────────────────
    // DATABASE FILTER
    // ─────────────────────────────────────────────────────────
    //
    // Keep mediaType: "video" here so the database does not
    // have to scan every post.
    //
    // The final validation below protects against old bad
    // records where a GIF was incorrectly marked as video.
    // ─────────────────────────────────────────────────────────

    const where: any = {
      authorId: {
        notIn: excludedAuthorIds,
      },

      // ⚠️ SECURITY: same private-account rule as every other public
      // listing (explore, hashtag, search) - Shorts, including a
      // logged-out visitor's, used to serve private accounts' videos.
      author: viewablePostAuthorFilter(userId),

      status: "published",

      scheduledAt: null,

      mediaType: "video",

      imageUrl: {
        not: null,
      },
    };

    // ─────────────────────────────────────────────────────────
    // START VIDEO
    // ─────────────────────────────────────────────────────────

    if (startId && !cursor) {
      const startPost = await prisma.post.findFirst({
        where: {
          id: startId,
          ...where,
        },
        select: postSelect(),
      });

      if (startPost && isRealVideoPost(startPost)) {
        const rest = await fetchVideoBatch({
          where: {
            ...where,

            id: {
              not: startId,
            },

            createdAt: {
              lt: startPost.createdAt,
            },
          },

          limit,
        });

        const posts = [
          startPost,
          ...rest.posts,
        ];

        return await withLiked(
          posts,
          userId,
          rest.nextCursor
        );
      }

      // If the requested post is not a valid video,
      // continue with the normal video feed.
    }

    // ─────────────────────────────────────────────────────────
    // NORMAL VIDEO FEED
    // ─────────────────────────────────────────────────────────

    const result = await fetchVideoBatch({
      where,
      cursor,
      limit,
    });

    return await withLiked(
      result.posts,
      userId,
      result.nextCursor
    );
  } catch (error) {
    console.error(
      "Error fetching video feed:",
      error
    );

    return NextResponse.json(
      {
        error: "Failed to fetch video feed",
      },
      {
        status: 500,
      }
    );
  }
}

// ─────────────────────────────────────────────────────────────
// FETCH VIDEO BATCH
// ─────────────────────────────────────────────────────────────

async function fetchVideoBatch({
  where,
  cursor,
  limit,
}: {
  where: any;
  cursor?: string | null;
  limit: number;
}) {
  const candidateLimit = Math.min(
    Math.max(limit * 5, 30),
    100
  );

  const posts = await prisma.post.findMany({
    take: candidateLimit,

    ...(cursor
      ? {
          skip: 1,
          cursor: {
            id: cursor,
          },
        }
      : {}),

    where,

    orderBy: {
      createdAt: "desc",
    },

    select: postSelect(),
  });

  // Final protection against GIFs/images.
  const validVideos = posts.filter(
    isRealVideoPost
  );

  const resultPosts = validVideos.slice(
    0,
    limit
  );

  const nextCursor =
    resultPosts.length === limit
      ? resultPosts[resultPosts.length - 1]?.id || null
      : null;

  return {
    posts: resultPosts,
    nextCursor,
  };
}

// ─────────────────────────────────────────────────────────────
// POST SELECT
// ─────────────────────────────────────────────────────────────

function postSelect() {
  return {
    id: true,

    content: true,

    imageUrl: true,

    mediaType: true,

    createdAt: true,

    views: true,

    commentsEnabled: true,

    // ⚠️ SECURITY: required by applyPremiumGating() below - it needs the
    // raw authorId to decide "does the viewer own this post" without a
    // second query. Never returned to the client un-gated (see withLiked).
    authorId: true,

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

// ─────────────────────────────────────────────────────────────
// LIKED + REPOSTED
// ─────────────────────────────────────────────────────────────

async function withLiked(
  posts: any[],
  userId:
    | string
    | undefined,
  nextCursor:
    | string
    | null
) {
  if (
    userId &&
    posts.length > 0
  ) {
    const postIds =
      posts.map(
        (post) => post.id
      );

    const [
      likes,
      reposts,
      bookmarks,
    ] = await Promise.all([
      prisma.like.findMany({
        where: {
          userId,

          postId: {
            in: postIds,
          },
        },

        select: {
          postId: true,
        },
      }),

      prisma.repost.findMany({
        where: {
          userId,

          postId: {
            in: postIds,
          },
        },

        select: {
          postId: true,
        },
      }),

      prisma.bookmark.findMany({
        where: {
          userId,

          postId: {
            in: postIds,
          },
        },

        select: {
          postId: true,
        },
      }),
    ]);

    const likedIds =
      new Set(
        likes.map(
          (like) =>
            like.postId
        )
      );

    const repostedIds =
      new Set(
        reposts.map(
          (repost) =>
            repost.postId
        )
      );

    const bookmarkedIds =
      new Set(
        bookmarks.map(
          (bookmark) =>
            bookmark.postId
        )
      );

    posts.forEach(
      (post) => {
        post.liked =
          likedIds.has(
            post.id
          );

        post.reposted =
          repostedIds.has(
            post.id
          );

        post.bookmarked =
          bookmarkedIds.has(
            post.id
          );
      }
    );
  }

  // ⚠️ SECURITY: redact pay-per-view video content the viewer hasn't
  // purchased before it ever leaves the server - same helper every other
  // post-listing route uses (src/lib/premium-content.ts). Before this,
  // /api/videos selected and returned the real `imageUrl` (the playable
  // video URL) for every post regardless of PremiumPost/PremiumPurchase
  // status, so a premium/pay-per-view Short was fully playable by anyone
  // - including a logged-out visitor - who opened Shorts, bypassing the
  // paywall entirely even though the on-chain purchase flow itself was
  // real and independently verified.
  const gatedPosts = await applyPremiumGating(
    posts,
    userId ?? null
  );

  return NextResponse.json({
    posts: gatedPosts,
    nextCursor,
  });
}
