import { NextRequest, NextResponse } from "next/server";
import { getServerSession } from "next-auth";
import { authOptions } from "@/lib/auth";
import { prisma } from "@/lib/db";
import { Prisma } from "@prisma/client";
import { rateLimit } from "@/lib/rate-limit";
import { findVisiblePost } from "@/lib/post-visibility";

function isPrismaCode(err: unknown, code: string): boolean {
  return err instanceof Prisma.PrismaClientKnownRequestError && err.code === code;
}

export async function POST(req: NextRequest, props: { params: Promise<{ id: string }> }) {
  const params = await props.params;
  // Rate limit: 120 bookmark-toggles per minute
  const limit = await rateLimit(req, { limit: 120, window: 60, type: "post-bookmark" });
  if (!limit.success) return limit.response;

  const session = await getServerSession(authOptions);
  if (!session || !session.user) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const postId = params.id;
  const userId = session.user.id;

  try {
    // Check if post exists
    const post = await prisma.post.findUnique({
      where: { id: postId },
      select: { id: true },
    });

    if (!post) {
      return NextResponse.json({ error: "Post not found" }, { status: 404 });
    }

    // Check if already bookmarked
    const existing = await prisma.bookmark.findUnique({
      where: {
        userId_postId: {
          userId,
          postId,
        },
      },
    });

    if (existing) {
      // Remove bookmark
      try {
        await prisma.bookmark.delete({
          where: {
            userId_postId: {
              userId,
              postId,
            },
          },
        });
      } catch (err) {
        // A concurrent un-bookmark already removed it - same outcome.
        if (!isPrismaCode(err, "P2025")) throw err;
      }
      return NextResponse.json({ bookmarked: false });
    } else {
      // ⚠️ SECURITY: GET /api/bookmarks returns the bookmarked post in
      // full, so bookmarking must be subject to the same visibility rule
      // as reading the post - otherwise a private account's post (or a
      // scheduled one) was readable by anyone holding its id. See
      // src/lib/post-visibility.ts.
      if (!(await findVisiblePost(userId, postId))) {
        return NextResponse.json({ error: "Post not found" }, { status: 404 });
      }

      // Add bookmark
      try {
        await prisma.bookmark.create({
          data: {
            userId,
            postId,
          },
        });
      } catch (err) {
        // A concurrent bookmark request (double tap) already created it
        // - the caller's intended outcome, not a 500.
        if (!isPrismaCode(err, "P2002")) throw err;
      }
      return NextResponse.json({ bookmarked: true });
    }
  } catch (error) {
    console.error("Bookmark error:", error);
    return NextResponse.json({ error: "Failed to toggle bookmark" }, { status: 500 });
  }
}

export async function GET(req: NextRequest, props: { params: Promise<{ id: string }> }) {
  const params = await props.params;
  const session = await getServerSession(authOptions);
  if (!session || !session.user) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  try {
    const bookmark = await prisma.bookmark.findUnique({
      where: {
        userId_postId: {
          userId: session.user.id,
          postId: params.id,
        },
      },
    });

    return NextResponse.json({ bookmarked: !!bookmark });
  } catch (error) {
    console.error("Bookmark check error:", error);
    return NextResponse.json({ error: "Failed to check bookmark" }, { status: 500 });
  }
}
