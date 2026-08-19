import { NextRequest, NextResponse } from "next/server";
import { getServerSession } from "next-auth";
import { authOptions } from "@/lib/auth";
import { prisma } from "@/lib/db";

export const dynamic = "force-dynamic";

// ─────────────────────────────────────────────────────────────
// VIDEO FEED
// ─────────────────────────────────────────────────────────────
//
// Cursor-paginated, most recent real video posts first.
//
// IMPORTANT:
//
// GIFs are NEVER allowed into this endpoint's result,
// even if an old database record incorrectly contains:
//
//   mediaType: "video"
//
// while imageUrl is actually:
//
//   something.gif
//
// This protects Shorts from displaying GIFs as <video>.
// ─────────────────────────────────────────────────────────────

export async function GET(req: NextRequest) {
  try {
    const session =
      await getServerSession(
        authOptions
      );

    const userId =
      session?.user?.id;

    const { searchParams } =
      new URL(req.url);

    const cursor =
      searchParams.get("cursor");

    const requestedLimit =
      parseInt(
        searchParams.get(
          "limit"
        ) || "10",
        10
      );

    const limit = Math.min(
      Math.max(
        Number.isFinite(
          requestedLimit
        )
          ? requestedLimit
          : 10,
        1
      ),
      30
    );

    const startId =
      searchParams.get(
        "startId"
      );

    // ─────────────────────────────────────────────────────────
    // BLOCKED / MUTED USERS
    // ─────────────────────────────────────────────────────────

    let excludedAuthorIds: string[] =
      [];

    if (userId) {
      const [
        blocked,
        blockers,
        muted,
      ] = await Promise.all([
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
          ...blocked.map(
            (b) => b.blockedId
          ),
          ...blockers.map(
            (b) => b.blockerId
          ),
          ...muted.map(
            (m) => m.mutedId
          ),
        ])
      );
    }

    // ─────────────────────────────────────────────────────────
    // BASE DATABASE FILTER
    // ─────────────────────────────────────────────────────────
    //
    // We still use mediaType: "video" here for database-level
    // filtering/performance.
    //
    // BUT this is NOT enough by itself because older records
    // may incorrectly have:
    //
    // mediaType = "video"
    //
    // with:
    //
    // imageUrl = "...gif"
    //
    // Therefore every result is also checked by
    // isRealVideoPost() below.
    // ─────────────────────────────────────────────────────────

    const where: any = {
      authorId: {
        notIn: excludedAuthorIds,
      },

      status: "published",

      scheduledAt: null,

      mediaType: "video",

      imageUrl: {
        not: null,
      },
    };

    // ─────────────────────────────────────────────────────────
    // START POST
    // ─────────────────────────────────────────────────────────
    //
    // When opening Shorts from a particular post, make sure the
    // requested post is ACTUALLY a real video.
    //
    // Previously this used findUnique() without the video filter,
    // meaning a GIF could become the first Short.
    // ─────────────────────────────────────────────────────────

    if (
      startId &&
      !cursor
    ) {
      const startPost =
        await prisma.post.findFirst({
          where: {
            id: startId,
            ...where,
          },
          select:
            postSelect(),
        });

      /*
       * Even with the Prisma mediaType filter, perform the
       * final GIF/video check.
       */
      if (
        startPost &&
        isRealVideoPost(
          startPost
        )
      ) {
        const rest =
          await fetchVideoBatch({
            where: {
              ...where,

              id: {
                not: startId,
              },

              createdAt: {
                lt:
                  startPost.createdAt,
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

      /*
       * If startId is not a real video, do NOT return it.
       *
       * Fall through and return the normal latest video feed.
       */
    }

    // ─────────────────────────────────────────────────────────
    // NORMAL CURSOR PAGINATION
    // ─────────────────────────────────────────────────────────

    const result =
      await fetchVideoBatch({
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
        error:
          "Failed to fetch video feed",
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
//
// Because the database can contain old incorrect mediaType
// values, we fetch a larger candidate batch and filter GIFs
// in JavaScript.
//
// This guarantees that:
//
// .gif       -> excluded
// mediaType gif -> excluded
// mp4        -> included
// webm       -> included
// mov        -> included
// avi        -> included
// mkv        -> included
//
// If old bad GIF records exist, they are simply skipped.
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
  /*
   * Fetch extra candidates because some records may be
   * incorrectly marked as video while actually being GIFs.
   *
   * 3x normally gives enough room without creating an
   * unnecessarily large query.
   */
  const candidateLimit = Math.min(
    Math.max(limit * 3, 20),
    100
  );

  const posts =
    await prisma.post.findMany({
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

      select:
        postSelect(),
    });

  /*
   * Final application-level protection.
   *
   * This is the most important line for old data.
   */
  const validVideos =
    posts.filter(
      isRealVideoPost
    );

  /*
   * Only return the requested amount.
   */
  const resultPosts =
    validVideos.slice(
      0,
      limit
    );

  /*
   * The cursor must point to the LAST ACTUAL VIDEO we returned,
   * not the last database candidate.
   *
   * This prevents GIF records from accidentally breaking
   * pagination.
   */
  const nextCursor =
    resultPosts.length === limit
      ? resultPosts[
          resultPosts.length - 1
        ]?.id || null
      : null;

  return {
    posts: resultPosts,
    nextCursor,
  };
}

// ─────────────────────────────────────────────────────────────
// MEDIA HELPERS
// ─────────────────────────────────────────────────────────────

function getMediaPath(
  url?: string | null
) {
  if (!url) {
    return "";
  }

  return url
    .toLowerCase()
    .split("?")[0]
    .split("#")[0];
}

// ─────────────────────────────────────────────────────────────
// GIF DETECTION
// ─────────────────────────────────────────────────────────────
//
// GIF ALWAYS wins.
//
// Even if:
//
// mediaType = "video"
//
// a .gif URL is still treated as GIF.
// ─────────────────────────────────────────────────────────────

function isGifMedia(
  url?: string | null,
  mediaType?: string | null
) {
  const path =
    getMediaPath(url);

  return (
    path.endsWith(".gif") ||
    mediaType?.toLowerCase() ===
      "gif"
  );
}

// ─────────────────────────────────────────────────────────────
// REAL VIDEO DETECTION
// ─────────────────────────────────────────────────────────────

function isRealVideoPost(
  post: {
    imageUrl?: string | null;
    mediaType?: string | null;
  }
) {
  const url =
    post.imageUrl;

  const mediaType =
    post.mediaType;

  /*
   * GIF MUST NEVER be a video.
   *
   * This check happens FIRST.
   */
  if (
    isGifMedia(
      url,
      mediaType
    )
  ) {
    return false;
  }

  if (!url) {
    return false;
  }

  const path =
    getMediaPath(url);

  // ───────────────────────────────────────────────────────
  // KNOWN VIDEO EXTENSIONS
  // ───────────────────────────────────────────────────────

  const videoExtensions = [
    ".mp4",
    ".webm",
    ".mov",
    ".avi",
    ".mkv",
    ".m4v",
    ".3gp",
  ];

  if (
    videoExtensions.some(
      (extension) =>
        path.endsWith(
          extension
        )
    )
  ) {
    return true;
  }

  // ───────────────────────────────────────────────────────
  // EXPLICIT VIDEO TYPE
  // ───────────────────────────────────────────────────────
  //
  // Only trust this AFTER GIF has been excluded.
  // ───────────────────────────────────────────────────────

  if (
    mediaType?.toLowerCase() ===
    "video"
  ) {
    return true;
  }

  // ───────────────────────────────────────────────────────
  // STORAGE PATH FALLBACK
  // ───────────────────────────────────────────────────────

  if (
    path.includes(
      "/video/"
    ) ||
    path.includes(
      "/videos/"
    )
  ) {
    return true;
  }

  return false;
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
        (p) => p.id
      );

    const [
      likes,
      reposts,
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
    ]);

    const likedIds =
      new Set(
        likes.map(
          (l) => l.postId
        )
      );

    const repostedIds =
      new Set(
        reposts.map(
          (r) => r.postId
        )
      );

    posts.forEach((post) => {
      post.liked =
        likedIds.has(
          post.id
        );

      post.reposted =
        repostedIds.has(
          post.id
        );
    });
  }

  return NextResponse.json({
    posts,
    nextCursor,
  });
}
