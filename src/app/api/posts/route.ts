import { NextRequest, NextResponse } from "next/server";
import { getServerSession } from "next-auth";
import { authOptions } from "@/lib/auth";
import { prisma } from "@/lib/db";
import { createNotification } from "@/lib/notifications";

export async function GET(req: NextRequest) {
  try {
    const session = await getServerSession(authOptions);

    // ─── Pagination parameters ──────────────────────────────────────
    const cursor = req.nextUrl.searchParams.get("cursor");
    const limit = parseInt(req.nextUrl.searchParams.get("limit") || "10");

    // ─── Get blocked users ──────────────────────────────────────────
    let blockedIds: string[] = [];
    if (session?.user?.id) {
      const blocked = await prisma.blocked.findMany({
        where: { blockerId: session.user.id },
        select: { blockedId: true },
      });
      blockedIds = blocked.map((b) => b.blockedId);
    }

    // ─── Fetch posts ─────────────────────────────────────────────────
    const posts = await prisma.post.findMany({
      take: limit + 1,
      ...(cursor ? { skip: 1, cursor: { id: cursor } } : {}),
      orderBy: { createdAt: "desc" },
      where: {
        authorId: { notIn: blockedIds },
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
        _count: {
          select: {
            likes: true,
            comments: true,
            reposts: true,
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
    } = await req.json();

    if (!content || content.trim().length === 0) {
      if (!isPoll || !poll?.question?.trim()) {
        return NextResponse.json(
          { error: "Content or poll question is required" },
          { status: 400 }
        );
      }
    }

    const postData: any = {
      content: content.trim() || poll.question.trim(),
      imageUrl: imageUrl || null,
      linkUrl: linkUrl || null,
      authorId: session.user.id,
      hashtags: hashtags || [],
      mentions: mentions || [],
      isPoll: !!isPoll,
    };

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
      },
    });

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
