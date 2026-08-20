import { NextRequest, NextResponse } from "next/server";
import { getServerSession } from "next-auth";
import { authOptions } from "@/lib/auth";
import { prisma } from "@/lib/db";

export const dynamic = "force-dynamic";

// ─────────────────────────────────────────────────────────────
// VIDEO FEED
// ─────────────────────────────────────────────────────────────
//
// IMPORTANT:
//
// This endpoint is intentionally STRICT.
//
// A post is returned as a video ONLY when its media URL has a
// known video extension.
//
// We DO NOT trust:
//
//   mediaType: "video"
//
// by itself.
//
// This is important because old database records may contain:
//
//   mediaType: "video"
//   imageUrl: "...gif"
//
// Such records MUST NOT enter the video feed or Shorts.
//
// Supported videos:
//
//   .mp4
//   .webm
//   .mov
//   .avi
//   .mkv
//   .m4v
//   .3gp
//
// GIFs and all normal image formats are rejected.
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
    // BASE DATABASE FILTER
    // ─────────────────────────────────────────────────────────
    //
    // mediaType: "video" is still used as a database filter so
    // we do not scan every post.
    //
    // BUT mediaType alone is NEVER trusted.
    //
    // isRealVideoPost() performs the final validation.
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
    // START VIDEO
    // ─────────────────────────────────────────────────────────
    //
    // Used by VideoFeedViewer when opening a video from PostCard.
    //
    // A GIF can NEVER become the first item.
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

      // The requested post is not a valid video.
      // Fall through to the normal video feed.
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
//
// We fetch extra candidates because old records may have:
//
//   mediaType = "video"
//
// while actually being GIFs/images.
//
// Only posts that pass isRealVideoPost() are returned.
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

  // ─────────────────────────────────────────────────────────
  // STRICT FINAL FILTER
  // ─────────────────────────────────────────────────────────

  const validVideos = posts.filter(
    isRealVideoPost
  );

  const resultPosts = validVideos.slice(
    0,
    limit
  );

  // Cursor is always based on the last REAL VIDEO returned.
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
// MEDIA PATH
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
    .split("#")[0]
    .trim();
}

// ─────────────────────────────────────────────────────────────
// GIF DETECTION
// ─────────────────────────────────────────────────────────────
//
// GIF ALWAYS WINS.
//
// We check both:
//
// 1. File extension
// 2. Common URL parameters used by image/CDN services
//
// Examples:
//
// image.gif
// image.gif?width=800
// image.gif#something
// ?format=gif
// ?fm=gif
// ?f=gif
// ─────────────────────────────────────────────────────────────

function isGifMedia(
  url?: string | null,
  mediaType?: string | null
) {
  if (!url) {
    return mediaType?.toLowerCase() === "gif";
  }

  const normalizedUrl = url.toLowerCase();

  const path = getMediaPath(url);

  if (path.endsWith(".gif")) {
    return true;
  }

  if (
    mediaType?.toLowerCase() === "gif"
  ) {
    return true;
  }

  // Common image/CDN GIF indicators.
  if (
    /[?&](format|fm|f)=gif(?:&|$)/i.test(
      normalizedUrl
    )
  ) {
    return true;
  }

  if (
    normalizedUrl.includes(
      "image/gif"
    )
  ) {
    return true;
  }

  return false;
}

// ─────────────────────────────────────────────────────────────
// IMAGE DETECTION
// ─────────────────────────────────────────────────────────────
//
// These formats are NEVER videos.
// ─────────────────────────────────────────────────────────────

function isImageMedia(
  url?: string | null
) {
  if (!url) {
    return false;
  }

  const path = getMediaPath(url);

  const imageExtensions = [
    ".jpg",
    ".jpeg",
    ".png",
    ".gif",
    ".webp",
    ".svg",
    ".avif",
    ".bmp",
    ".ico",
    ".tif",
    ".tiff",
    ".heic",
    ".heif",
  ];

  return imageExtensions.some(
    (extension) =>
      path.endsWith(extension)
  );
}

// ─────────────────────────────────────────────────────────────
// REAL VIDEO DETECTION
// ─────────────────────────────────────────────────────────────
//
// IMPORTANT:
//
// We deliberately DO NOT have:
//
//   if (mediaType === "video") return true;
//
// anymore.
//
// That was the dangerous fallback that allowed old GIF records
// to enter Shorts.
//
// A video must have a known video extension.
// ─────────────────────────────────────────────────────────────

function isRealVideoPost(
  post: {
    imageUrl?: string | null;
    mediaType?: string | null;
  }
) {
  const url = post.imageUrl;

  const mediaType =
    post.mediaType?.toLowerCase();

  if (!url) {
    return false;
  }

  // ───────────────────────────────────────────────────────
  // 1. GIF ALWAYS REJECTED
  // ───────────────────────────────────────────────────────

  if (
    isGifMedia(
      url,
      mediaType
    )
  ) {
    return false;
  }

  // ───────────────────────────────────────────────────────
  // 2. KNOWN IMAGE FORMATS REJECTED
  // ───────────────────────────────────────────────────────

  if (
    isImageMedia(url)
  ) {
    return false;
  }

  const path =
    getMediaPath(url);

  // ───────────────────────────────────────────────────────
  // 3. ONLY KNOWN VIDEO EXTENSIONS ARE ACCEPTED
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

  const hasVideoExtension =
    videoExtensions.some(
      (extension) =>
        path.endsWith(
          extension
        )
    );

  if (!hasVideoExtension) {
    return false;
  }

  // ───────────────────────────────────────────────────────
  // 4. FINAL MEDIA TYPE CHECK
  // ───────────────────────────────────────────────────────
  //
  // If the URL is a known video format, accept it even if
  // mediaType is missing.
  //
  // But if the database explicitly says it is an image/GIF,
  // reject it.
  // ───────────────────────────────────────────────────────

  if (
    mediaType === "image" ||
    mediaType === "gif"
  ) {
    return false;
  }

  return true;
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
        (post) => post.id
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
      }
    );
  }

  return NextResponse.json({
    posts,
    nextCursor,
  });
}
