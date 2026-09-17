import { NextRequest, NextResponse } from "next/server";
import { getServerSession } from "next-auth";
import { Prisma } from "@prisma/client";
import { authOptions } from "@/lib/auth";
import { prisma } from "@/lib/db";
import { createNotification } from "@/lib/notifications";
import { sendPushNotification } from "@/lib/push-notifications"; // ← Added
import { rateLimit } from "@/lib/rate-limit";
import { isBlockedEitherWay } from "@/lib/auth-guards";

function isUniqueViolation(err: unknown): boolean {
  return err instanceof Prisma.PrismaClientKnownRequestError && err.code === "P2002";
}
function isNotFound(err: unknown): boolean {
  return err instanceof Prisma.PrismaClientKnownRequestError && err.code === "P2025";
}

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
      try {
        await prisma.like.delete({
          where: {
            postId_userId: {
              postId,
              userId,
            },
          },
        });
      } catch (err) {
        // Already gone (a concurrent unlike request won the race) -
        // that's the outcome this caller wanted too, so it's still a
        // clean 200, not a 500.
        if (!isNotFound(err)) throw err;
      }

      // Retract the like notification this created, so a
      // like -> unlike -> like cycle can't leave an orphaned unread
      // notification behind from the first like once a fresh one is
      // created below on the next like. Safe to run unconditionally
      // (a no-op if none exists, e.g. the author already read it).
      await prisma.notification.deleteMany({
        where: { type: "like", fromUserId: userId, postId, read: false },
      });

      return NextResponse.json({ liked: false });
    } else {
      // Get post author up front - both to check the block relationship
      // before the Like exists at all, and to notify below.
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

      // ⚠️ SECURITY/PRIVACY: confirmed missing by audit - a blocked-either-way
      // relationship could still like the post, unlike follow/messages which
      // correctly block the interaction itself, not just the resulting
      // notification. Checked up front, before the Like row is created -
      // the interaction itself must never form.
      if (
        post &&
        post.authorId !== userId &&
        (await isBlockedEitherWay(userId, post.authorId))
      ) {
        return NextResponse.json({ error: "Unable to like this post" }, { status: 403 });
      }

      // Like: create like and notification
      try {
        await prisma.like.create({
          data: {
            postId,
            userId,
          },
        });
      } catch (err) {
        // A concurrent like request already won - same outcome the
        // caller wanted, so treat it as success rather than a 500.
        if (!isUniqueViolation(err)) throw err;
        return NextResponse.json({ liked: true });
      }

      if (post && post.authorId !== userId) {
        // ─── Send database notification ──────────────────────────────
        // createNotification itself skips a blocked-either-way
        // relationship - see src/lib/notifications.ts. Push only fires
        // when the in-app notification actually landed, so a blocked
        // relationship doesn't still push a "New Like" alert.
        const notified = await createNotification({
          userId: post.authorId,
          type: "like",
          fromUserId: userId,
          postId,
        });

        if (notified) {
          await sendPushNotification(
            post.authorId,
            "New Like",
            `${session.user.name || session.user.username} liked your post.`,
            `/post/${postId}`
          );
        }
      }

      return NextResponse.json({ liked: true });
    }
  } catch (error) {
    console.error("Like error:", error);
    return NextResponse.json({ error: "Something went wrong" }, { status: 500 });
  }
}
