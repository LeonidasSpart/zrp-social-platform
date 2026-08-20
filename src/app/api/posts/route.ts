import { NextRequest, NextResponse } from "next/server";
import { getToken } from "next-auth/jwt";
import { prisma } from "@/lib/db";
import {
  getPlanLimits,
  checkPostLength,
  checkImagesPerPost,
} from "@/lib/limits";
import {
  canPostRecruitment,
  canPublishArticle,
} from "@/lib/permissions";
import { rateLimit } from "@/lib/rate-limit";

// ─────────────────────────────────────────────────────────────
// MEDIA HELPERS
// ─────────────────────────────────────────────────────────────

function getMediaPath(url?: string | null) {
  if (!url) return "";

  return url
    .toLowerCase()
    .split("?")[0]
    .split("#")[0]
    .trim();
}

function isGifUrl(url?: string | null) {
  if (!url) return false;

  const normalizedUrl = url.toLowerCase();
  const path = getMediaPath(url);

  /*
   * GIF ALWAYS wins.
   *
   * Check both the URL extension and common CDN
   * query parameters/content indicators.
   */
  if (path.endsWith(".gif")) {
    return true;
  }

  if (
    /[?&](format|fm|f)=gif(?:&|$)/i.test(
      normalizedUrl
    )
  ) {
    return true;
  }

  if (normalizedUrl.includes("image/gif")) {
    return true;
  }

  return false;
}

function isVideoUrl(url?: string | null) {
  if (!url) return false;

  const path = getMediaPath(url);

  const videoExtensions = [
    ".mp4",
    ".webm",
    ".mov",
    ".avi",
    ".mkv",
    ".m4v",
    ".3gp",
    ".ogg",
  ];

  return videoExtensions.some((extension) =>
    path.endsWith(extension)
  );
}

function isVideoMediaType(mediaType?: string | null) {
  return mediaType?.toLowerCase().trim() === "video";
}

// ─────────────────────────────────────────────────────────────
// NORMALIZE MEDIA TYPE
// ─────────────────────────────────────────────────────────────
//
// IMPORTANT:
//
// GIF ALWAYS wins.
//
// However, video storage/CDN URLs do NOT always contain
// ".mp4", ".webm", etc.
//
// Therefore:
//
//   mediaType: "video"
//   imageUrl: "https://storage.example.com/abc123"
//
// MUST remain:
//
//   mediaType: "video"
//
// We must NOT convert it to "image" merely because the
// storage URL has no video extension.
// ─────────────────────────────────────────────────────────────

function normalizeMediaType(
  requestedMediaType: unknown,
  primaryImageUrl: string | null
): string | null {
  if (!primaryImageUrl) {
    return null;
  }

  const requested =
    typeof requestedMediaType === "string"
      ? requestedMediaType.toLowerCase().trim()
      : "";

  // ─────────────────────────────────────────────────────────
  // 1. GIF ALWAYS WINS
  // ─────────────────────────────────────────────────────────

  if (isGifUrl(primaryImageUrl)) {
    return "image";
  }

  // ─────────────────────────────────────────────────────────
  // 2. EXPLICIT VIDEO
  // ─────────────────────────────────────────────────────────
  //
  // Trust the explicit video classification after GIF has
  // already been rejected.
  //
  // This is required for storage/CDN URLs that have no
  // recognizable video extension.
  // ─────────────────────────────────────────────────────────

  if (isVideoMediaType(requested)) {
    return "video";
  }

  // ─────────────────────────────────────────────────────────
  // 3. VIDEO URL DETECTION
  // ─────────────────────────────────────────────────────────

  if (isVideoUrl(primaryImageUrl)) {
    return "video";
  }

  // ─────────────────────────────────────────────────────────
  // 4. EVERYTHING ELSE IS AN IMAGE
  // ─────────────────────────────────────────────────────────

  return "image";
}

// ─── GET (Feed) ─────────────────────────────────────────────────────

export async function GET(req: NextRequest) {
  try {
    const token = await getToken({
      req,
      secret: process.env.NEXTAUTH_SECRET,
    });

    const userId = token?.id;

    const { searchParams } = new URL(req.url);
    const cursor = searchParams.get("cursor");
    const tab = searchParams.get("tab") || "for-you";
    const take = 10;

    const where: any = {
      status: "published",
    };

    const needsFollowing =
      tab === "following" && !!userId;

    const [
      blockedIds,
      blockedBy,
      muted,
      following,
    ] = await Promise.all([
      userId
        ? prisma.blocked.findMany({
            where: {
              blockerId: userId,
            },
            select: {
              blockedId: true,
            },
          })
        : Promise.resolve([]),

      userId
        ? prisma.blocked.findMany({
            where: {
              blockedId: userId,
            },
            select: {
              blockerId: true,
            },
          })
        : Promise.resolve([]),

      userId
        ? prisma.mute.findMany({
            where: {
              muterId: userId,
            },
            select: {
              mutedId: true,
            },
          })
        : Promise.resolve([]),

      needsFollowing
        ? prisma.follow.findMany({
            where: {
              followerId: userId,
            },
            select: {
              followingId: true,
            },
          })
        : Promise.resolve([]),
    ]);

    if (userId) {
      const excludedUserIds = [
        ...blockedIds.map(
          (b) => b.blockedId
        ),
        ...blockedBy.map(
          (b) => b.blockerId
        ),
      ];

      if (excludedUserIds.length > 0) {
        where.authorId = {
          notIn: excludedUserIds,
        };
      }

      const mutedIds = muted.map(
        (m) => m.mutedId
      );

      if (mutedIds.length > 0) {
        where.authorId = {
          ...(where.authorId || {}),
          notIn: mutedIds,
        };
      }
    }

    if (needsFollowing) {
      const followingIds = following.map(
        (f) => f.followingId
      );

      if (followingIds.length === 0) {
        return NextResponse.json({
          posts: [],
          nextCursor: null,
        });
      }

      where.authorId = {
        in: followingIds,
      };
    }

    const posts =
      await prisma.post.findMany({
        where,
        orderBy: {
          createdAt: "desc",
        },
        take: take + 1,
        skip: cursor ? 1 : 0,
        cursor: cursor
          ? {
              id: cursor,
            }
          : undefined,

        select: {
          id: true,
          content: true,
          imageUrl: true,
          imageUrls: true,
          mediaType: true,
          linkUrl: true,
          createdAt: true,
          updatedAt: true,
          views: true,
          commentsEnabled: true,
          type: true,
          company: true,
          location: true,
          applyUrl: true,
          body: true,
          quotePostId: true,
          hashtags: true,
          mentions: true,
          isPoll: true,
          authorId: true,

          author: {
            select: {
              id: true,
              username: true,
              name: true,
              avatarUrl: true,
              badgeType: true,
              plan: true,
            },
          },

          poll: {
            include: {
              votes_user: {
                where: userId
                  ? {
                      userId,
                    }
                  : undefined,
                select: {
                  optionIndex: true,
                },
              },
            },
          },

          _count: {
            select: {
              likes: true,
              reposts: true,
              comments: true,
            },
          },
        },
      });

    let nextCursor: string | null = null;

    if (posts.length > take) {
      const nextItem = posts.pop();

      nextCursor =
        nextItem?.id || null;
    }

    if (
      userId &&
      posts.length > 0
    ) {
      const likes =
        await prisma.like.findMany({
          where: {
            userId: userId as string,
            postId: {
              in: posts.map(
                (p) => p.id
              ),
            },
          },
          select: {
            postId: true,
          },
        });

      const likedIds = new Set(
        likes.map(
          (l) => l.postId
        )
      );

      posts.forEach(
        (p: any) => {
          p.liked =
            likedIds.has(
              p.id
            );
        }
      );
    }

    return NextResponse.json({
      posts,
      nextCursor,
    });
  } catch (error) {
    console.error(
      "Feed error:",
      error
    );

    return NextResponse.json(
      {
        error:
          "Internal server error",
      },
      {
        status: 500,
      }
    );
  }
}

// ─── POST (Create) ──────────────────────────────────────────────────

export async function POST(
  req: NextRequest
) {
  const limit =
    await rateLimit(req, {
      limit: 20,
      window: 600,
      type: "posts-create",
    });

  if (!limit.success) {
    return limit.response;
  }

  try {
    const token =
      await getToken({
        req,
        secret:
          process.env.NEXTAUTH_SECRET,
      });

    if (!token) {
      return NextResponse.json(
        {
          error:
            "Unauthorized",
        },
        {
          status: 401,
        }
      );
    }

    const user =
      await prisma.user.findUnique({
        where: {
          id: token.id as string,
        },
        select: {
          plan: true,
          id: true,
        },
      });

    if (!user) {
      return NextResponse.json(
        {
          error:
            "User not found",
        },
        {
          status: 404,
        }
      );
    }

    const body =
      await req.json();

    const {
      content = "",
      imageUrl,
      imageUrls,
      mediaType,
      linkUrl,
      quotePostId,
      poll,
      scheduledAt,
      commentsEnabled = true,
      type = "POST",
      company,
      location,
      applyUrl,
      articleBody,
    } = body;

    // ─────────────────────────────────────────────────────────
    // NORMALIZE MEDIA
    // ─────────────────────────────────────────────────────────

    const normalizedImageUrls: string[] =
      Array.isArray(imageUrls) &&
      imageUrls.length > 0
        ? imageUrls.filter(
            (url): url is string =>
              typeof url === "string" &&
              url.trim().length > 0
          )
        : imageUrl &&
            typeof imageUrl ===
              "string"
          ? [imageUrl]
          : [];

    const primaryImageUrl:
      | string
      | null =
      normalizedImageUrls[0] ||
      null;

    // ─────────────────────────────────────────────────────────
    // SERVER-SIDE MEDIA TYPE PROTECTION
    // ─────────────────────────────────────────────────────────
    //
    // GIFs are always protected from being stored as video.
    //
    // Explicit video uploads remain video even when their
    // storage/CDN URL has no ".mp4" extension.
    // ─────────────────────────────────────────────────────────

    const normalizedMediaType =
      normalizeMediaType(
        mediaType,
        primaryImageUrl
      );

    // ─────────────────────────────────────────────────────────
    // TYPE-SPECIFIC PLAN CHECKS
    // ─────────────────────────────────────────────────────────

    if (
      type ===
        "RECRUITMENT" &&
      !canPostRecruitment(user)
    ) {
      return NextResponse.json(
        {
          error:
            "Recruitment posts require a Business or Enterprise plan.",
        },
        {
          status: 403,
        }
      );
    }

    if (
      type ===
        "ARTICLE" &&
      !canPublishArticle(user)
    ) {
      return NextResponse.json(
        {
          error:
            "Article publishing requires a Business or Enterprise plan.",
        },
        {
          status: 403,
        }
      );
    }

    // ─────────────────────────────────────────────────────────
    // BASIC LIMIT CHECKS
    // ─────────────────────────────────────────────────────────

    const plan =
      user.plan;

    const limits =
      getPlanLimits(plan);

    const lengthCheck =
      checkPostLength(
        content.length,
        plan
      );

    if (!lengthCheck.allowed) {
      return NextResponse.json(
        {
          error:
            lengthCheck.message,
        },
        {
          status: 400,
        }
      );
    }

    if (
      normalizedImageUrls.length >
      0
    ) {
      const imageCheck =
        checkImagesPerPost(
          normalizedImageUrls.length,
          plan
        );

      if (!imageCheck.allowed) {
        return NextResponse.json(
          {
            error:
              imageCheck.message,
          },
          {
            status: 400,
          }
        );
      }
    }

    // ─────────────────────────────────────────────────────────
    // SCHEDULED POSTS
    // ─────────────────────────────────────────────────────────

    if (scheduledAt) {
      const scheduledCount =
        await prisma.post.count({
          where: {
            authorId:
              user.id,
            scheduledAt: {
              not: null,
            },
            status:
              "scheduled",
            createdAt: {
              gte: new Date(
                new Date().getFullYear(),
                new Date().getMonth(),
                1
              ),
            },
          },
        });

      if (
        scheduledCount >=
        limits.scheduledPostsPerMonth
      ) {
        return NextResponse.json(
          {
            error: `You've reached your monthly limit of ${limits.scheduledPostsPerMonth} scheduled posts.`,
          },
          {
            status: 400,
          }
        );
      }
    }

    // ─────────────────────────────────────────────────────────
    // CREATE POLL
    // ─────────────────────────────────────────────────────────

    let pollId = null;

    if (
      poll &&
      poll.options &&
      poll.options.length > 1
    ) {
      const newPoll =
        await prisma.poll.create({
          data: {
            question:
              poll.question,
            options:
              poll.options,
            expiresAt:
              poll.expiresAt
                ? new Date(
                    poll.expiresAt
                  )
                : null,
          },
        });

      pollId =
        newPoll.id;
    }

    // ─────────────────────────────────────────────────────────
    // CREATE POST
    // ─────────────────────────────────────────────────────────

    const postData: any = {
      content,

      imageUrl:
        primaryImageUrl,

      imageUrls:
        normalizedImageUrls,

      /*
       * IMPORTANT:
       *
       * Use ONLY the server-normalized
       * media type.
       */
      mediaType:
        normalizedMediaType,

      linkUrl,

      authorId:
        user.id,

      quotePostId:
        quotePostId ||
        null,

      pollId,

      isPoll:
        !!pollId,

      commentsEnabled,

      scheduledAt:
        scheduledAt
          ? new Date(
              scheduledAt
            )
          : null,

      status:
        scheduledAt
          ? "scheduled"
          : "published",

      type,

      company:
        type ===
        "RECRUITMENT"
          ? company
          : null,

      location:
        type ===
        "RECRUITMENT"
          ? location
          : null,

      applyUrl:
        type ===
        "RECRUITMENT"
          ? applyUrl
          : null,

      body:
        type ===
        "ARTICLE"
          ? articleBody
          : null,
    };

    const post =
      await prisma.post.create({
        data: postData,
      });

    // ─────────────────────────────────────────────────────────
    // HASHTAGS + MENTIONS
    // ─────────────────────────────────────────────────────────

    const hashtags =
      content.match(
        /#[a-zA-Z0-9_]+/g
      ) || [];

    const mentions =
      content.match(
        /@[a-zA-Z0-9_]+/g
      ) || [];

    if (
      hashtags.length ||
      mentions.length
    ) {
      await prisma.post.update({
        where: {
          id: post.id,
        },

        data: {
          hashtags:
            hashtags.map(
              (h: string) =>
                h
                  .slice(1)
                  .toLowerCase()
            ),

          mentions:
            mentions.map(
              (m: string) =>
                m.slice(1)
            ),
        },
      });
    }

    // ─────────────────────────────────────────────────────────
    // FETCH FULL POST
    // ─────────────────────────────────────────────────────────

    const fullPost =
      await prisma.post.findUnique({
        where: {
          id: post.id,
        },

        include: {
          author: {
            select: {
              id: true,
              username: true,
              name: true,
              avatarUrl: true,
              badgeType: true,
              plan: true,
            },
          },

          poll: {
            include: {
              votes_user: {
                where:
                  token?.id
                    ? {
                        userId:
                          token.id as string,
                      }
                    : undefined,

                select: {
                  optionIndex:
                    true,
                },
              },
            },
          },

          _count: {
            select: {
              likes: true,
              reposts: true,
              comments: true,
            },
          },
        },
      });

    return NextResponse.json(
      {
        post: fullPost,
      },
      {
        status: 201,
      }
    );
  } catch (error) {
    console.error(
      "Create post error:",
      error
    );

    return NextResponse.json(
      {
        error:
          "Internal server error",
      },
      {
        status: 500,
      }
    );
  }
}
