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
// A record marked "video" is STILL rejected if the URL clearly
// identifies a GIF.
// ─────────────────────────────────────────────────────────────

function isGifMedia(
  url?: string | null,
  mediaType?: string | null
) {
  const normalizedType =
    mediaType?.toLowerCase().trim();

  if (!url) {
    return normalizedType === "gif";
  }

  const normalizedUrl =
    url.toLowerCase();

  const path =
    getMediaPath(url);

  // .gif
  if (path.endsWith(".gif")) {
    return true;
  }

  // mediaType = gif
  if (normalizedType === "gif") {
    return true;
  }

  // CDN parameters
  if (
    /[?&](format|fm|f)=gif(?:&|$)/i.test(
      normalizedUrl
    )
  ) {
    return true;
  }

  // MIME indicator in URL
  if (
    normalizedUrl.includes("image/gif")
  ) {
    return true;
  }

  return false;
}

// ─────────────────────────────────────────────────────────────
// IMAGE DETECTION
// ─────────────────────────────────────────────────────────────

function isImageMedia(
  url?: string | null
) {
  if (!url) {
    return false;
  }

  const path =
    getMediaPath(url);

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
// DO NOT require a video file extension.
//
// Railway/storage/CDN URLs can be extensionless.
//
// Priority:
//
// 1. GIF -> reject
// 2. Known image -> reject
// 3. mediaType === "video" -> accept
// 4. Known video extension -> accept
// 5. Otherwise -> reject
// ─────────────────────────────────────────────────────────────

function isRealVideoPost(
  post: {
    imageUrl?: string | null;
    mediaType?: string | null;
  }
) {
  const url = post.imageUrl;

  const mediaType =
    post.mediaType?.toLowerCase().trim();

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
  // 3. KNOWN VIDEO EXTENSIONS
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
        path.endsWith(extension)
    );

  if (hasVideoExtension) {
    // Never allow an explicit image type through.
    if (
      mediaType === "image" ||
      mediaType === "gif"
    ) {
      return false;
    }

    return true;
  }

  // ───────────────────────────────────────────────────────
  // 4. EXTENSIONLESS VIDEO
  // ───────────────────────────────────────────────────────
  //
  // This is the important fix.
  //
  // If the database says video and the URL is not a known
  // image/GIF, accept it.
  //
  // This supports storage/CDN URLs such as:
  //
  // https://storage.example.com/abc123
  //
  // where there is no .mp4 at the end.
  // ───────────────────────────────────────────────────────

  if (mediaType === "video") {
    return true;
  }

  // ───────────────────────────────────────────────────────
  // 5. EVERYTHING ELSE IS REJECTED
  // ───────────────────────────────────────────────────────

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
