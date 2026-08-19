import { NextRequest, NextResponse } from "next/server";
import { getServerSession } from "next-auth";
import { authOptions } from "@/lib/auth";
import { prisma } from "@/lib/db";
import { rateLimit } from "@/lib/rate-limit";

export async function POST(req: NextRequest, props: { params: Promise<{ id: string }> }) {
  const params = await props.params;
  // Rate limit: 120 bookmark-toggles per minute
  const limit = await rateLimit(req, { limit: 120, window: 60, type: "comment-bookmark" });
  if (!limit.success) return limit.response;

  const session = await getServerSession(authOptions);
  if (!session?.user?.id) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const commentId = params.id;
  const userId = session.user.id;

  const existing = await prisma.commentBookmark.findUnique({
    where: {
      commentId_userId: {
        commentId,
        userId,
      },
    },
  });

  if (existing) {
    await prisma.commentBookmark.delete({
      where: {
        commentId_userId: {
          commentId,
          userId,
        },
      },
    });
    return NextResponse.json({ bookmarked: false });
  } else {
    await prisma.commentBookmark.create({
      data: {
        commentId,
        userId,
      },
    });
    return NextResponse.json({ bookmarked: true });
  }
}
