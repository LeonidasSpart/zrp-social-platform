import { NextRequest, NextResponse } from "next/server";
import { getServerSession } from "next-auth";
import { authOptions } from "@/lib/auth";
import { prisma } from "@/lib/db";
import { canViewPrivateContent } from "@/lib/permissions";
import { parseCursorParams, buildPage } from "@/lib/pagination";

export async function GET(req: NextRequest, props: { params: Promise<{ id: string }> }) {
  const params = await props.params;
  try {
    const postId = params.id;
    const session = await getServerSession(authOptions);
    const viewerId = session?.user?.id;
    const { cursor, limit } = parseCursorParams(req);

    const originalPost = await prisma.post.findUnique({
      where: { id: postId },
      select: { authorId: true, author: { select: { isPrivate: true } } },
    });
    if (!originalPost) {
      return NextResponse.json({ error: "Post not found" }, { status: 404 });
    }
    if (!(await canViewPrivateContent(viewerId, originalPost.authorId, originalPost.author.isPrivate))) {
      return NextResponse.json({ items: [], nextCursor: null });
    }

    const rawQuotes = await prisma.post.findMany({
      where: { quotePostId: postId },
      orderBy: { createdAt: "desc" },
      take: limit + 1,
      ...(cursor ? { cursor: { id: cursor }, skip: 1 } : {}),
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
          select: { likes: true, comments: true, reposts: true, quotedBy: true },
        },
      },
    });

    const { items: quotes, nextCursor } = buildPage(rawQuotes, limit);

    // Add liked status
    if (viewerId && quotes.length > 0) {
      const likes = await prisma.like.findMany({
        where: {
          userId: viewerId,
          postId: { in: quotes.map(p => p.id) },
        },
        select: { postId: true },
      });
      const likedIds = new Set(likes.map(l => l.postId));
      quotes.forEach(p => (p as any).liked = likedIds.has(p.id));
    }

    return NextResponse.json({ items: quotes, nextCursor });
  } catch (error) {
    console.error("Error fetching quotes:", error);
    return NextResponse.json({ error: "Failed to fetch quotes" }, { status: 500 });
  }
}
