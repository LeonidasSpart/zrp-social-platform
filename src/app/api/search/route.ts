import { NextRequest, NextResponse } from "next/server";
import { getServerSession } from "next-auth";
import { authOptions } from "@/lib/auth";
import { prisma } from "@/lib/db";
import { viewablePostAuthorFilter } from "@/lib/permissions";

export async function GET(req: NextRequest) {
  const query = req.nextUrl.searchParams.get("q") || "";
  const type = req.nextUrl.searchParams.get("type") || "all";

  if (query.length < 2) {
    return NextResponse.json({ users: [], posts: [] });
  }

  try {
    const session = await getServerSession(authOptions);
    const userId = session?.user?.id;

    // ─── Get excluded users (blocked + blockers + muted) ──────────
    let excludedAuthorIds: string[] = [];
    if (userId) {
      const [blocked, blockers, muted] = await Promise.all([
        prisma.blocked.findMany({
          where: { blockerId: userId },
          select: { blockedId: true },
        }),
        prisma.blocked.findMany({
          where: { blockedId: userId },
          select: { blockerId: true },
        }),
        prisma.mute.findMany({
          where: { muterId: userId },
          select: { mutedId: true },
        }),
      ]);
      const blockedIds = blocked.map(b => b.blockedId);
      const blockerIds = blockers.map(b => b.blockerId);
      const mutedIds = muted.map(m => m.mutedId);
      excludedAuthorIds = [...blockedIds, ...blockerIds, ...mutedIds];
    }

    const results: any = {};

    // ─── Search users ──────────────────────────────────────────────
    if (type === "users" || type === "all") {
      const users = await prisma.user.findMany({
        where: {
          AND: [
            {
              OR: [
                { username: { contains: query, mode: "insensitive" } },
                { name: { contains: query, mode: "insensitive" } },
              ],
            },
            { id: { notIn: excludedAuthorIds } }, // ✅ exclude blocked/muted
            { banned: false },
          ],
        },
        select: {
          id: true,
          username: true,
          name: true,
          avatarUrl: true,
          badgeType: true,
        },
        take: 10, // limit to 10 for mention autocomplete
      });
      results.users = users;
    }

    // ─── Search posts ──────────────────────────────────────────────
    if (type === "posts" || type === "all") {
      const posts = await prisma.post.findMany({
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
            { author: viewablePostAuthorFilter(userId) },
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
      results.posts = posts;
    }

    return NextResponse.json(results);
  } catch (error) {
    console.error("Search error:", error);
    return NextResponse.json({ error: "Search failed" }, { status: 500 });
  }
}
