import { NextRequest, NextResponse } from "next/server";
import { validateApiKey } from "@/lib/api-auth";
import { prisma } from "@/lib/db";

export async function GET(req: NextRequest) {
  const auth = await validateApiKey(req);
  
  // ─── Check if authentication failed ──────────────────────────────
  if (auth.error) {
    return NextResponse.json({ error: auth.error }, { status: auth.status });
  }

  // ─── TypeScript now knows auth.user exists ──────────────────────
  if (!auth.user) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const userId = auth.user.id;
  const { searchParams } = new URL(req.url);
  const cursor = searchParams.get("cursor");
  const take = 10;

  const posts = await prisma.post.findMany({
    where: {
      authorId: userId,
      status: "published",
    },
    orderBy: { createdAt: "desc" },
    take: take + 1,
    skip: cursor ? 1 : 0,
    cursor: cursor ? { id: cursor } : undefined,
    include: {
      _count: {
        select: { likes: true, reposts: true, comments: true },
      },
    },
  });

  let nextCursor = null;
  if (posts.length > take) {
    const nextItem = posts.pop();
    nextCursor = nextItem!.id;
  }

  return NextResponse.json({ posts, nextCursor });
}
