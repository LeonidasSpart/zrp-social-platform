import { NextRequest, NextResponse } from "next/server";
import { getToken } from "next-auth/jwt";
import { prisma } from "@/lib/db";
import { getPlanLimits, checkPostLength, checkImagesPerPost } from "@/lib/limits";
import { canPostRecruitment, canPublishArticle } from "@/lib/permissions";
import { rateLimit } from "@/lib/rate-limit";

// ─── GET (Feed) ─────────────────────────────────────────────────────
export async function GET(req: NextRequest) {
  try {
    const token = await getToken({ req, secret: process.env.NEXTAUTH_SECRET });
    const userId = token?.id;

    const { searchParams } = new URL(req.url);
    const cursor = searchParams.get("cursor");
    const tab = searchParams.get("tab") || "for-you";
    const take = 10;

    // ─── Build where clause ──────────────────────────────────────
    const where: any = { status: "published" };

    // Blocked/blockedBy/muted/following were previously fetched with
    // sequential awaits - each is independent (all keyed only on
    // userId, none depends on another's result), so they were paying
    // 3-4 avoidable sequential database round-trips on every single
    // feed load, the highest-traffic route in the app. Running them
    // concurrently cuts that to the time of the single slowest one.
    const needsFollowing = tab === "following" && !!userId;
    const [blockedIds, blockedBy, muted, following] = await Promise.all([
      userId
        ? prisma.blocked.findMany({ where: { blockerId: userId }, select: { blockedId: true } })
        : Promise.resolve([]),
      userId
        ? prisma.blocked.findMany({ where: { blockedId: userId }, select: { blockerId: true } })
        : Promise.resolve([]),
      userId
        ? prisma.mute.findMany({ where: { muterId: userId }, select: { mutedId: true } })
        : Promise.resolve([]),
      needsFollowing
        ? prisma.follow.findMany({ where: { followerId: userId }, select: { followingId: true } })
        : Promise.resolve([]),
    ]);

    if (userId) {
      const excludedUserIds = [
        ...blockedIds.map((b) => b.blockedId),
        ...blockedBy.map((b) => b.blockerId),
      ];
      if (excludedUserIds.length > 0) {
        where.authorId = { notIn: excludedUserIds };
      }

      const mutedIds = muted.map((m) => m.mutedId);
      if (mutedIds.length > 0) {
        where.authorId = { ...(where.authorId || {}), notIn: mutedIds };
      }
    }

    // For "following" tab
    if (needsFollowing) {
      const followingIds = following.map((f) => f.followingId);
      if (followingIds.length === 0) {
        return NextResponse.json({ posts: [], nextCursor: null });
      }
      where.authorId = { in: followingIds };
    }

    const posts = await prisma.post.findMany({
      where,
      orderBy: { createdAt: "desc" },
      take: take + 1,
      skip: cursor ? 1 : 0,
      cursor: cursor ? { id: cursor } : undefined,
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
              where: userId ? { userId } : undefined,
              select: { optionIndex: true },
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
      nextCursor = nextItem!.id;
    }

    // ─── Add liked status for the viewer ──────────────────────────
    // This was missing entirely on this route (the main "For You" /
    // "Following" home feed) - every post came back with no `liked`
    // field, so the frontend always rendered them as unliked here,
    // regardless of what was actually in the database. Other feeds
    // (explore, profile, hashtag, single post) already computed this
    // correctly; this brings the home feed in line with that pattern.
    if (userId && posts.length > 0) {
      const likes = await prisma.like.findMany({
        where: {
          userId: userId as string,
          postId: { in: posts.map(p => p.id) },
        },
        select: { postId: true },
      });
      const likedIds = new Set(likes.map(l => l.postId));
      posts.forEach((p: any) => {
        p.liked = likedIds.has(p.id);
      });
    }

    return NextResponse.json({ posts, nextCursor });
  } catch (error) {
    console.error("Feed error:", error);
    return NextResponse.json({ error: "Internal server error" }, { status: 500 });
  }
}

// ─── POST (Create) ──────────────────────────────────────────────────
export async function POST(req: NextRequest) {
  // Rate limit: 20 posts per 10 minutes - generous for normal use,
  // blocks spam-posting bots/scripts.
  const limit = await rateLimit(req, { limit: 20, window: 600, type: "posts-create" });
  if (!limit.success) return limit.response;

  try {
    const token = await getToken({ req, secret: process.env.NEXTAUTH_SECRET });
    if (!token) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }

    const user = await prisma.user.findUnique({
      where: { id: token.id as string },
      select: { plan: true, id: true },
    });
    if (!user) {
      return NextResponse.json({ error: "User not found" }, { status: 404 });
    }

    const body = await req.json();
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

    // ─── Normalize media: support both the legacy single imageUrl and
    // the new multi-image imageUrls array, without breaking either ────
    const normalizedImageUrls: string[] = Array.isArray(imageUrls) && imageUrls.length > 0
      ? imageUrls
      : (imageUrl ? [imageUrl] : []);
    const primaryImageUrl: string | null = normalizedImageUrls[0] || null;

    // ─── Type‑specific plan checks ──────────────────────────────
    if (type === "RECRUITMENT" && !canPostRecruitment(user)) {
      return NextResponse.json(
        { error: "Recruitment posts require a Business or Enterprise plan." },
        { status: 403 }
      );
    }
    if (type === "ARTICLE" && !canPublishArticle(user)) {
      return NextResponse.json(
        { error: "Article publishing requires a Business or Enterprise plan." },
        { status: 403 }
      );
    }

    // ─── Basic limit checks ──────────────────────────────────────
    const plan = user.plan;
    const limits = getPlanLimits(plan);

    const lengthCheck = checkPostLength(content.length, plan);
    if (!lengthCheck.allowed) {
      return NextResponse.json({ error: lengthCheck.message }, { status: 400 });
    }

    if (normalizedImageUrls.length > 0) {
      const imageCheck = checkImagesPerPost(normalizedImageUrls.length, plan);
      if (!imageCheck.allowed) {
        return NextResponse.json({ error: imageCheck.message }, { status: 400 });
      }
    }

    if (scheduledAt) {
      const scheduledCount = await prisma.post.count({
        where: {
          authorId: user.id,
          scheduledAt: { not: null },
          status: "scheduled",
          createdAt: { gte: new Date(new Date().getFullYear(), new Date().getMonth(), 1) },
        },
      });
      if (scheduledCount >= limits.scheduledPostsPerMonth) {
        return NextResponse.json(
          { error: `You've reached your monthly limit of ${limits.scheduledPostsPerMonth} scheduled posts.` },
          { status: 400 }
        );
      }
    }

    // ─── Create post ──────────────────────────────────────────────
    let pollId = null;
    if (poll && poll.options && poll.options.length > 1) {
      const newPoll = await prisma.poll.create({
        data: {
          question: poll.question,
          options: poll.options,
          expiresAt: poll.expiresAt ? new Date(poll.expiresAt) : null,
        },
      });
      pollId = newPoll.id;
    }

    const postData: any = {
      content,
      imageUrl: primaryImageUrl,
      imageUrls: normalizedImageUrls,
      mediaType: mediaType || (primaryImageUrl ? (primaryImageUrl.match(/\.(mp4|webm|ogg)$/) ? "video" : "image") : null),
      linkUrl,
      authorId: user.id,
      quotePostId: quotePostId || null,
      pollId,
      isPoll: !!pollId,
      commentsEnabled,
      scheduledAt: scheduledAt ? new Date(scheduledAt) : null,
      status: scheduledAt ? "scheduled" : "published",
      type,
      company: type === "RECRUITMENT" ? company : null,
      location: type === "RECRUITMENT" ? location : null,
      applyUrl: type === "RECRUITMENT" ? applyUrl : null,
      body: type === "ARTICLE" ? articleBody : null,
    };

    const post = await prisma.post.create({ data: postData });

    // ─── Extract hashtags and mentions ──────────────────────────
    const hashtags = content.match(/#[a-zA-Z0-9_]+/g) || [];
    const mentions = content.match(/@[a-zA-Z0-9_]+/g) || [];

    if (hashtags.length || mentions.length) {
      await prisma.post.update({
        where: { id: post.id },
        data: {
          hashtags: hashtags.map((h: string) => h.slice(1).toLowerCase()),
          mentions: mentions.map((m: string) => m.slice(1)),
        },
      });
    }

    // ─── Fetch full post with author and counts ──────────────────
    const fullPost = await prisma.post.findUnique({
      where: { id: post.id },
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
              where: token?.id ? { userId: token.id as string } : undefined,
              select: { optionIndex: true },
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

    return NextResponse.json({ post: fullPost }, { status: 201 });
  } catch (error) {
    console.error("Create post error:", error);
    return NextResponse.json({ error: "Internal server error" }, { status: 500 });
  }
}
