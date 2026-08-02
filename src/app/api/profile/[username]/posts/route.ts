import { NextRequest, NextResponse } from "next/server";
import { getServerSession } from "next-auth";
import { authOptions } from "@/lib/auth";
import { prisma } from "@/lib/db";
import { rateLimit } from "@/lib/rate-limit";

export async function GET(
  req: NextRequest,
  { params }: { params: { username: string } }
) {
  // ─── RATE LIMIT: 100 requests per minute ──────────────────────
  const limitResult = await rateLimit(req, {
    limit: 100,
    window: 60,
    type: "profile-posts-get",
  });
  if (!limitResult.success) return limitResult.response;

  try {
    const session = await getServerSession(authOptions);
    const { username } = params;

    // ─── Pagination parameters ──────────────────────────────────────
    const cursor = req.nextUrl.searchParams.get("cursor");
    const limit = parseInt(req.nextUrl.searchParams.get("limit") || "10");

    // ─── Find the user by username ──────────────────────────────────
    const user = await prisma.user.findUnique({
      where: { username },
      select: { id: true },
    });

    if (!user) {
      return NextResponse.json({ error: "User not found" }, { status: 404 });
    }

    // ─── Get blocked users (if logged in) ──────────────────────────
    let blockedIds: string[] = [];
    if (session?.user?.id) {
      const blocked = await prisma.blocked.findMany({
        where: { blockerId: session.user.id },
        select: { blockedId: true },
      });
      blockedIds = blocked.map((b) => b.blockedId);
    }

    // ─── If the profile user is blocked, return empty results ──────
    if (blockedIds.includes(user.id)) {
      return NextResponse.json({
        posts: [],
        nextCursor: null,
      });
    }

    // ─── Fetch posts by that user ───────────────────────────────────
    const posts = await prisma.post.findMany({
      take: limit + 1,
      ...(cursor ? { skip: 1, cursor: { id: cursor } } : {}),
      orderBy: { createdAt: "desc" },
      where: {
        authorId: user.id,
        status: "published",
        // ✅ We already checked if the viewer blocked the profile user.
        // No need for another authorId filter; the viewer's blocked list
        // only matters for the author of the post (which is fixed to user.id).
        // If the viewer has blocked the profile user, we returned empty above.
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
        // ✅ QUOTE REPOST – include the quoted post
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

    // ─── Add liked / bookmarked status if logged in ─────────────────
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

      const bookmarks = await prisma.bookmark.findMany({
        where: {
          userId: session.user.id,
          postId: { in: posts.map((p) => p.id) },
        },
      });
      const bookmarkIds = new Set(bookmarks.map((b) => b.postId));
      posts.forEach((p) => {
        (p as any).bookmarked = bookmarkIds.has(p.id);
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
    console.error("Error fetching profile posts:", error);
    return NextResponse.json(
      { error: error.message || "Failed to fetch posts" },
      { status: 500 }
    );
  }
}
