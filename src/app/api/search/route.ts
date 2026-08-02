import { NextRequest, NextResponse } from "next/server";
import { getServerSession } from "next-auth";
import { authOptions } from "@/lib/auth";
import { prisma } from "@/lib/db";

export async function GET(req: NextRequest) {
  const query = req.nextUrl.searchParams.get("q") || "";

  if (query.length < 2) {
    return NextResponse.json({ users: [], posts: [] });
  }

  try {
    const session = await getServerSession(authOptions);
    const userId = session?.user?.id;

    // ─── Get blocked and muted users ──────────────────────────────
    let excludedAuthorIds: string[] = [];
    if (userId) {
      const [blocked, muted] = await Promise.all([
        prisma.blocked.findMany({
          where: { blockerId: userId },
          select: { blockedId: true },
        }),
        prisma.mute.findMany({
          where: { muterId: userId },
          select: { mutedId: true },
        }),
      ]);
      const blockedIds = blocked.map(b => b.blockedId);
      const mutedIds = muted.map(m => m.mutedId);
      excludedAuthorIds = [...blockedIds, ...mutedIds];
    }

    const [users, posts] = await Promise.all([
      prisma.user.findMany({
        where: {
          OR: [
            { username: { contains: query, mode: "insensitive" } },
            { name: { contains: query, mode: "insensitive" } },
          ],
        },
        select: {
          id: true,
          username: true,
          name: true,
          avatarUrl: true,
          badgeType: true,
        },
        take: 20,
      }),
      prisma.post.findMany({
        where: {
          AND: [
            {
              OR: [
                { content: { contains: query, mode: "insensitive" } },
                { hashtags: { has: query.toLowerCase() } },
              ],
            },
            { authorId: { notIn: excludedAuthorIds } },
            { status: "published" },
          ],
        },
        orderBy: { createdAt: "desc" },
        take: 20,
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
      }),
    ]);

    return NextResponse.json({ users, posts });
  } catch (error) {
    console.error("Search error:", error);
    return NextResponse.json({ error: "Search failed" }, { status: 500 });
  }
}
