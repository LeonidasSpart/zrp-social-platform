import { NextRequest, NextResponse } from "next/server";
import { getServerSession } from "next-auth";
import { authOptions } from "@/lib/auth";
import { prisma } from "@/lib/db";
import { createNotification } from "@/lib/notifications";
import { rateLimit } from "@/lib/rate-limit";
import { getUserPlan, getPlanLimits, checkPostLength, checkImagesPerPost, checkScheduledPostsCount } from "@/lib/limits";

export async function GET(req: NextRequest) {
  // ─── RATE LIMIT: 100 requests per minute ──────────────────────
  const limitResult = await rateLimit(req, {
    limit: 100,
    window: 60,
    type: "posts-get",
  });
  if (!limitResult.success) return limitResult.response;

  try {
    const session = await getServerSession(authOptions);

    // ─── Pagination parameters ──────────────────────────────────────
    const cursor = req.nextUrl.searchParams.get("cursor");
    const limit = parseInt(req.nextUrl.searchParams.get("limit") || "10");

    // ─── Get users to exclude (blocked + blockers) ──────────────────
    let excludedAuthorIds: string[] = [];
    if (session?.user?.id) {
      const [blocked, blockers] = await Promise.all([
        prisma.blocked.findMany({
          where: { blockerId: session.user.id },
          select: { blockedId: true },
        }),
        prisma.blocked.findMany({
          where: { blockedId: session.user.id },
          select: { blockerId: true },
        }),
      ]);
      const blockedIds = blocked.map((b) => b.blockedId);
      const blockerIds = blockers.map((b) => b.blockerId);
      excludedAuthorIds = [...blockedIds, ...blockerIds];

      // ─── Also get muted users ──────────────────────────────────────
      const muted = await prisma.mute.findMany({
        where: { muterId: session.user.id },
        select: { mutedId: true },
      });
      const mutedIds = muted.map((m) => m.mutedId);
      excludedAuthorIds = [...excludedAuthorIds, ...mutedIds];
    }

    // ─── Fetch posts ─────────────────────────────────────────────────
    const posts = await prisma.post.findMany({
      take: limit + 1,
      ...(cursor ? { skip: 1, cursor: { id: cursor } } : {}),
      orderBy: { createdAt: "desc" },
      where: {
        authorId: { notIn: excludedAuthorIds },
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
        poll: {
          include: {
            votes_user: {
              where: session ? { userId: session.user.id } : undefined,
              select: { optionIndex: true },
            },
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

    // ─── Determine next cursor ──────────────────────────────────────
    let nextCursor: string | null = null;
    if (posts.length > limit) {
      const nextPost = posts.pop();
      nextCursor = nextPost?.id || null;
    }

    // ─── Add liked status ────────────────────────────────────────────
    if (session?.user?.id) {
      const likes = await prisma.like.findMany({
        where: {
          userId: session.user.id,
          postId: { in: posts.map((p) => p.id) },
        },
      });
      const likedIds = new Set(likes.map((l) => l.postId));
      posts.forEach((p) => {
        (p as any).liked = likedIds.has(p.id);
      });
    }

    // ─── Transform poll votes ───────────────────────────────────────
    const transformedPosts = posts.map((post) => {
      const result = { ...post };
      if (post.poll) {
        const poll = post.poll as any;
        poll.userVote = poll.votes_user?.[0]?.optionIndex ?? null;
        delete poll.votes_user;
        result.poll = poll;
      }
      return result;
    });

    return NextResponse.json({
      posts: transformedPosts,
      nextCursor,
    });
  } catch (error: any) {
    console.error("Error fetching posts:", error);
    return NextResponse.json(
      { error: error.message || "Failed to fetch posts" },
      { status: 500 }
    );
  }
}

export async function POST(req: NextRequest) {
  // ─── RATE LIMIT: 30 posts per hour ─────────────────────────────
  const limitResult = await rateLimit(req, {
    limit: 30,
    window: 3600,
    type: "posts-create",
  });
  if (!limitResult.success) return limitResult.response;

  const session = await getServerSession(authOptions);
  if (!session || !session.user) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  try {
    const {
      content,
      imageUrl,
      linkUrl,
      hashtags,
      mentions,
      isPoll = false,
      poll,
      status = "published",
      scheduledAt,
      quotePostId,
    } = await req.json();

    // ─── Get user with plan ──────────────────────────────────────────
    const user = await prisma.user.findUnique({
      where: { id: session.user.id },
      select: { plan: true },
    });
    const plan = getUserPlan(user);
    const limits = getPlanLimits(plan);

    // ─── 1. Check post length ────────────────────────────────────────
    const contentLength = content?.trim()?.length || 0;
    const lengthCheck = checkPostLength(contentLength, plan);
    if (!lengthCheck.allowed) {
      return NextResponse.json({ error: lengthCheck.message }, { status: 400 });
    }

    // ─── 2. Check images per post ────────────────────────────────────
    // Currently we have a single imageUrl; treat it as 1 if provided.
    const imageCount = imageUrl ? 1 : 0;
    const imageCheck = checkImagesPerPost(imageCount, plan);
    if (!imageCheck.allowed) {
      return NextResponse.json({ error: imageCheck.message }, { status: 400 });
    }

    // ─── 3. Check scheduled posts limit (if scheduling) ────────────
    if (status === "scheduled") {
      if (!scheduledAt) {
        return NextResponse.json(
          { error: "Scheduled date is required for scheduled posts." },
          { status: 400 }
        );
      }
      const scheduledDate = new Date(scheduledAt);
      if (scheduledDate <= new Date()) {
        return NextResponse.json(
          { error: "Scheduled time must be in the future." },
          { status: 400 }
        );
      }

      // Count scheduled posts in the current month
      const now = new Date();
      const startOfMonth = new Date(now.getFullYear(), now.getMonth(), 1);
      const endOfMonth = new Date(now.getFullYear(), now.getMonth() + 1, 1);
      const scheduledCount = await prisma.post.count({
        where: {
          authorId: session.user.id,
          status: "scheduled",
          scheduledAt: {
            gte: startOfMonth,
            lt: endOfMonth,
          },
        },
      });
      const scheduledCheck = checkScheduledPostsCount(scheduledCount, plan);
      if (!scheduledCheck.allowed) {
        return NextResponse.json({ error: scheduledCheck.message }, { status: 400 });
      }
    }

    // ─── Validate quotePostId ──────────────────────────────────────
    if (quotePostId) {
      const originalPost = await prisma.post.findUnique({
        where: { id: quotePostId },
        select: { id: true },
      });
      if (!originalPost) {
        return NextResponse.json(
          { error: "Original post not found" },
          { status: 404 }
        );
      }
    }

    // ─── Content validation ────────────────────────────────────────
    if (!content || content.trim().length === 0) {
      if (!isPoll || !poll?.question?.trim()) {
        return NextResponse.json(
          { error: "Content or poll question is required" },
          { status: 400 }
        );
      }
    }

    // ─── Build post data ──────────────────────────────────────────
    const postData: any = {
      content: content.trim() || poll.question.trim(),
      imageUrl: imageUrl || null,
      linkUrl: linkUrl || null,
      authorId: session.user.id,
      hashtags: hashtags || [],
      mentions: mentions || [],
      isPoll: !!isPoll,
      status: status || "published",
      scheduledAt: status === "scheduled" ? new Date(scheduledAt) : null,
      quotePostId: quotePostId || null,
    };

    // ─── Poll handling ──────────────────────────────────────────────
    let pollId = null;
    if (isPoll && poll && poll.options && poll.options.length >= 2) {
      const validOptions = poll.options.filter((o: string) => o.trim().length > 0);
      if (validOptions.length >= 2) {
        const createdPoll = await prisma.poll.create({
          data: {
            question: poll.question.trim(),
            options: validOptions,
            votes: validOptions.reduce((acc: any, _: string, idx: number) => {
              acc[idx] = 0;
              return acc;
            }, {}),
            expiresAt: poll.expiresAt ? new Date(poll.expiresAt) : null,
          },
        });
        pollId = createdPoll.id;
        postData.pollId = pollId;
      } else {
        return NextResponse.json(
          { error: "Poll must have at least 2 valid options" },
          { status: 400 }
        );
      }
    }

    // ─── Create post ────────────────────────────────────────────────
    const post = await prisma.post.create({
      data: postData,
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
        poll: {
          include: {
            votes_user: true,
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
      },
    });

    // ─── Create notifications for mentions ──────────────────────────
    if (mentions && mentions.length > 0) {
      const mentionedUsers = await prisma.user.findMany({
        where: {
          username: { in: mentions.map((m: string) => m.toLowerCase()) },
        },
        select: { id: true },
      });

      for (const user of mentionedUsers) {
        await createNotification({
          userId: user.id,
          type: "mention",
          fromUserId: session.user.id,
          postId: post.id,
        });
      }
    }

    // ─── Transform response ─────────────────────────────────────────
    const result = { ...post };
    if (result.poll) {
      const p = result.poll as any;
      p.userVote = null;
      delete p.votes_user;
      result.poll = p;
    }

    return NextResponse.json(result, { status: 201 });
  } catch (error: any) {
    console.error("Error creating post:", error);
    return NextResponse.json(
      { error: error.message || "Something went wrong" },
      { status: 500 }
    );
  }
}
