import { NextRequest, NextResponse } from "next/server";
import { getServerSession } from "next-auth";
import { authOptions } from "@/lib/auth";
import { prisma } from "@/lib/db";
import { createNotification } from "@/lib/notifications";
import { sendPushNotification } from "@/lib/push-notifications"; // ← Added
import { rateLimit } from "@/lib/rate-limit";

export async function POST(req: NextRequest, props: { params: Promise<{ id: string }> }) {
  const params = await props.params;
  // Rate limit: 120 like-toggles per minute - generous for fast double-tap
  // scrolling/liking, still blocks scripted like-bombing.
  const limit = await rateLimit(req, { limit: 120, window: 60, type: "post-like" });
  if (!limit.success) return limit.response;

  const session = await getServerSession(authOptions);
  if (!session || !session.user) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const postId = params.id;
  const userId = session.user.id;

  try {
    const existingLike = await prisma.like.findUnique({
      where: {
        postId_userId: {
          postId,
          userId,
        },
      },
    });

    if (existingLike) {
      // Unlike
      await prisma.like.delete({
        where: {
          postId_userId: {
            postId,
            userId,
          },
        },
      });
      return NextResponse.json({ liked: false });
    } else {
      // Like – create like and notification
      await prisma.like.create({
        data: {
          postId,
          userId,
        },
      });

      // Get post author to send notification
      const post = await prisma.post.findUnique({
        where: { id: postId },
        select: { 
          authorId: true,
          author: {
            select: {
              name: true,
            },
          },
        },
      });

      if (post && post.authorId !== userId) {
        // ─── Send database notification ──────────────────────────────
        await createNotification({
          userId: post.authorId,
          type: "like",
          fromUserId: userId,
          postId,
        });

        // ─── Send push notification ──────────────────────────────────
        await sendPushNotification(
          post.authorId,
          "New Like",
          `${session.user.name || session.user.username} liked your post.`,
          `/post/${postId}`
        );
      }

      return NextResponse.json({ liked: true });
    }
  } catch (error) {
    console.error("Like error:", error);
    return NextResponse.json({ error: "Something went wrong" }, { status: 500 });
  }
}
