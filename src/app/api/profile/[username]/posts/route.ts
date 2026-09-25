import { NextRequest, NextResponse } from "next/server";
import { getServerSession } from "next-auth";
import { authOptions } from "@/lib/auth";
import { prisma } from "@/lib/db";
import { rateLimit } from "@/lib/rate-limit";
import { canViewPrivateContent } from "@/lib/permissions";
import { applyPremiumGating } from "@/lib/premium-content";

export async function GET(req: NextRequest, props: { params: Promise<{ username: string }> }) {
  const params = await props.params;
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
    // Clamped: an unbounded ?limit= let one request pull a user's entire
    // post history (with includes), and a non-numeric one reached Prisma
    // as NaN and 500'd.
    const parsedLimit = parseInt(req.nextUrl.searchParams.get("limit") || "10", 10);
    const limit = Math.min(Math.max(Number.isFinite(parsedLimit) ? parsedLimit : 10, 1), 50);

    // ─── Find the user by username ──────────────────────────────────
    const user = await prisma.user.findUnique({
      where: { username },
      select: { id: true, isPrivate: true },
    });

    if (!user) {
      return NextResponse.json({ error: "User not found" }, { status: 404 });
    }

    // ─── Private accounts: only the owner or an approved follower ────
    if (!(await canViewPrivateContent(session?.user?.id, user.id, user.isPrivate))) {
      return NextResponse.json({ posts: [], nextCursor: null });
    }

    // ─── Get blocked users (if logged in) ──────────────────────────
    let blockedIds: string[] = [];
    if (session?.user?.id) {
      // Either direction, same as /api/users/[username]/posts: a profile
      // owner who blocked the viewer must not be readable by them either.
      const blocked = await prisma.blocked.findMany({
        where: {
          OR: [
            { blockerId: session.user.id, blockedId: user.id },
            { blockerId: user.id, blockedId: session.user.id },
          ],
        },
        select: { blockerId: true, blockedId: true },
      });
      blockedIds = blocked.length > 0 ? [user.id] : [];
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
        // ✅ QUOTE REPOST: include the quoted post
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

    // ⚠️ SECURITY: redact pay-per-view content the viewer hasn't paid for
    // before it ever leaves the server - see src/lib/premium-content.ts.
    const gatedPosts = await applyPremiumGating(transformedPosts, session?.user?.id);

    return NextResponse.json({
      posts: gatedPosts,
      nextCursor,
    });
  } catch (error: any) {
    console.error("Error fetching profile posts:", error);
    return NextResponse.json(
      { error: "Failed to fetch posts" },
      { status: 500 }
    );
  }
}
