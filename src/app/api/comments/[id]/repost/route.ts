import { NextRequest, NextResponse } from "next/server";
import { getServerSession } from "next-auth";
import { Prisma } from "@prisma/client";
import { authOptions } from "@/lib/auth";
import { prisma } from "@/lib/db";
import { rateLimit } from "@/lib/rate-limit";
import { createNotification } from "@/lib/notifications";
import { sendPushNotification } from "@/lib/push-notifications";
import { getPlanLimits, getUserPlan } from "@/lib/limits";
import { reserveRepost, releaseRepost } from "@/lib/repost-quota";
import { isBlockedEitherWay } from "@/lib/auth-guards";

function isUniqueViolation(err: unknown): boolean {
  return err instanceof Prisma.PrismaClientKnownRequestError && err.code === "P2002";
}
function isNotFound(err: unknown): boolean {
  return err instanceof Prisma.PrismaClientKnownRequestError && err.code === "P2025";
}

// This route previously had none of the hardening every sibling toggle
// route (post-like, post-repost, comment-like) already had - confirmed
// missing by audit: no blocked-user check, no notification to the
// comment's author, no race-safety on concurrent create/delete, and no
// quota accounting at all (a user at their daily post-repost limit could
// repost comments without limit, a straightforward quota bypass). This
// brings it in line with src/app/api/posts/[id]/repost/route.ts, sharing
// the SAME daily RepostDailyUsage counter - a repost is a repost for
// quota purposes, whether of a post or a comment.
export async function POST(req: NextRequest, props: { params: Promise<{ id: string }> }) {
  const params = await props.params;
  // Rate limit: 60 repost-toggles per minute - matches post-repost.
  const limit = await rateLimit(req, { limit: 60, window: 60, type: "comment-repost" });
  if (!limit.success) return limit.response;

  const session = await getServerSession(authOptions);
  if (!session?.user?.id) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const commentId = params.id;
  const userId = session.user.id;

  try {
    const existing = await prisma.commentRepost.findUnique({
      where: {
        commentId_userId: {
          commentId,
          userId,
        },
      },
    });

    if (existing) {
      // Un-repost
      try {
        await prisma.commentRepost.delete({
          where: {
            commentId_userId: {
              commentId,
              userId,
            },
          },
        });
      } catch (err) {
        // Already gone (a concurrent un-repost won the race) - same
        // outcome this caller wanted, not a 500.
        if (!isNotFound(err)) throw err;
      }

      // Retract the comment_repost notification this created - same
      // like/unlike-cycle reasoning as the post-repost and like routes.
      // Quota is deliberately NOT restored here, matching post-repost's
      // own reasoning: undoing a repost must not let a repost/un-repost
      // loop bypass the daily limit.
      const undoneComment = await prisma.comment.findUnique({
        where: { id: commentId },
        select: { postId: true },
      });
      if (undoneComment) {
        await prisma.notification.deleteMany({
          where: {
            type: "comment_repost",
            fromUserId: userId,
            postId: undoneComment.postId,
            read: false,
          },
        });
      }

      return NextResponse.json({ reposted: false });
    } else {
      // ⚠️ SECURITY/PRIVACY: confirmed missing by audit - a blocked-either-way
      // relationship could still repost the comment, unlike follow/messages
      // which correctly block the interaction itself, not just the
      // resulting notification. Checked up front, before a quota slot is
      // even reserved.
      const comment = await prisma.comment.findUnique({
        where: { id: commentId },
        select: { authorId: true, postId: true },
      });
      if (!comment) {
        return NextResponse.json({ error: "Comment not found" }, { status: 404 });
      }
      if (comment.authorId !== userId && (await isBlockedEitherWay(userId, comment.authorId))) {
        return NextResponse.json({ error: "Unable to repost this comment" }, { status: 403 });
      }

      // Reserve a daily quota slot BEFORE writing the CommentRepost row -
      // see src/lib/repost-quota.ts. Shares the same per-user daily
      // counter as post reposts.
      const plan = getUserPlan(session.user as { plan?: string });
      const planLimit = getPlanLimits(plan).repostsPerDay;
      const reservation = await reserveRepost(userId, planLimit);
      if (!reservation.ok) {
        return NextResponse.json(
          {
            error: `Daily repost limit reached (${reservation.limit}). Try again tomorrow or upgrade for a higher limit.`,
            limit: reservation.limit,
            used: reservation.used,
            remaining: 0,
          },
          { status: 429 }
        );
      }

      try {
        await prisma.commentRepost.create({
          data: {
            commentId,
            userId,
          },
        });
      } catch (err) {
        if (isUniqueViolation(err)) {
          // A concurrent repost request already won - hand the slot
          // this request reserved back, since it never actually
          // consumed a repost of its own.
          await releaseRepost(userId);
          return NextResponse.json({ reposted: true });
        }
        // Any other failure (e.g. the comment was deleted concurrently)
        // means this repost never happened - the reserved slot must not
        // be spent on nothing.
        await releaseRepost(userId);
        throw err;
      }

      // ─── Notify the comment author (if not self) ─────────────────
      if (comment.authorId !== userId) {
        // createNotification itself skips a blocked-either-way
        // relationship - see src/lib/notifications.ts.
        const notified = await createNotification({
          userId: comment.authorId,
          type: "comment_repost",
          fromUserId: userId,
          postId: comment.postId,
          // commentId removed: we don't have the field in Notification yet
          // (same limitation as comment_like - see the comment-like route).
        });

        if (notified) {
          await sendPushNotification(
            comment.authorId,
            "New Repost",
            `${session.user.name || session.user.username} reposted your comment.`,
            `/post/${comment.postId}`
          );
        }
      }

      return NextResponse.json({
        reposted: true,
        limit: reservation.limit,
        remaining: Math.max(0, reservation.limit - reservation.used),
      });
    }
  } catch (error) {
    console.error("Comment repost error:", error);
    return NextResponse.json({ error: "Something went wrong" }, { status: 500 });
  }
}
