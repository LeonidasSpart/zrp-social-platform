import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/db";

export async function GET(req: NextRequest) {
  const query = req.nextUrl.searchParams.get("q");
  const type = req.nextUrl.searchParams.get("type") || "all";

  if (!query || query.length < 2) {
    return NextResponse.json({ users: [], posts: [] });
  }

  try {
    let users: any[] = [];
    let posts: any[] = [];

    if (type === "all" || type === "users") {
      users = await prisma.user.findMany({
        where: {
          OR: [
            { username: { contains: query, mode: "insensitive" } },
            { name: { contains: query, mode: "insensitive" } },
          ],
        },
        take: 10,
        select: {
          id: true,
          username: true,
          name: true,
          avatarUrl: true,
          bio: true,
          _count: {
            select: {
              posts: true,
              followers: true,
            },
          },
        },
      });
    }

    if (type === "all" || type === "posts") {
      posts = await prisma.post.findMany({
        where: {
          content: { contains: query, mode: "insensitive" },
        },
        take: 20,
        orderBy: { createdAt: "desc" },
        include: {
          author: {
            select: {
              id: true,
              username: true,
              name: true,
              avatarUrl: true,
            },
          },
        },
      });
    }

    return NextResponse.json({ users, posts });
  } catch (error) {
    console.error("Search error:", error);
    return NextResponse.json({ error: "Search failed" }, { status: 500 });
  }
}
