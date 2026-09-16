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

function isUniqueViolation(err: unknown): boolean {
  return err instanceof Prisma.PrismaClientKnownRequestError && err.code === "P2002";
}
function isNotFound(err: unknown): boolean {
  return err instanceof Prisma.PrismaClientKnownRequestError && err.code === "P2025";
}

// ─── GET: Check if user has reposted ────────────────────────────────
export async function GET(req: NextRequest, props: { params: Promise<{ id: string }> }) {
  const params = await props.params;
  const session = await getServerSession(authOptions);
  if (!session?.user?.id) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const postId = params.id;
  const userId = session.user.id;

  try {
    const repost = await prisma.repost.findUnique({
      where: {
        postId_userId: {
          postId,
          userId,
        },
      },
    });
    return NextResponse.json({ reposted: !!repost });
  } catch {
    return NextResponse.json({ error: "Failed to check repost" }, { status: 500 });
  }
}

// ─── POST: Toggle repost / unrepost ─────────────────────────────────
export async function POST(req: NextRequest, props: { params: Promise<{ id: string }> }) {
  const params = await props.params;
  // Rate limit: 60 repost-toggles per minute - blocks repost-bombing scripts.
  const limit = await rateLimit(req, { limit: 60, window: 60, type: "post-repost" });
  if (!limit.success) return limit.response;

  const session = await getServerSession(authOptions);
  if (!session || !session.user) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const postId = params.id;
  const userId = session.user.id;

  try {
    // Check if already reposted
    const existing = await prisma.repost.findUnique({
      where: {
        postId_userId: {
          postId,
          userId,
        },
      },
    });

    if (existing) {
      // Unrepost
      try {
        await prisma.repost.delete({
          where: {
            postId_userId: {
              postId,
              userId,
            },
          },
        });
      } catch (err) {
        // Already gone (a concurrent unrepost won the race) - same
        // outcome the caller wanted, not a 500.
        if (!isNotFound(err)) throw err;
      }

      // Retract the repost notification this created - same
      // like/unlike-cycle reasoning as the like and follow routes.
      // Quota is deliberately NOT restored here - see
      // src/lib/repost-quota.ts's own comment for why (undoing a
      // repost must not let a repost/unrepost loop bypass the daily
      // limit).
      await prisma.notification.deleteMany({
        where: { type: "repost", fromUserId: userId, postId, read: false },
      });

      return NextResponse.json({ reposted: false });
    } else {
      // Repost: reserve a daily quota slot BEFORE writing the Repost
      // row - see src/lib/repost-quota.ts. No repost quota existed
      // anywhere in this codebase before this (confirmed by audit);
      // this is the atomic, server-authoritative enforcement point.
      const plan = getUserPlan(session.user as { plan?: string });
      const limit = getPlanLimits(plan).repostsPerDay;
      const reservation = await reserveRepost(userId, limit);
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
        await prisma.repost.create({
          data: {
            postId,
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
        // Any other failure (e.g. the post was deleted concurrently)
        // means this repost never happened - the reserved slot must
        // not be spent on nothing.
        await releaseRepost(userId);
        throw err;
      }

      // ─── Notify the post author (if not self) ────────────────────
      const post = await prisma.post.findUnique({
        where: { id: postId },
        select: { authorId: true },
      });

      if (post && post.authorId !== userId) {
        // createNotification itself skips a blocked-either-way
        // relationship - see src/lib/notifications.ts.
        const notified = await createNotification({
          userId: post.authorId,
          type: "repost",
          fromUserId: userId,
          postId,
        });

        if (notified) {
          await sendPushNotification(
            post.authorId,
            "New Repost",
            `${session.user.name || session.user.username} reposted your post.`,
            `/post/${postId}`
          );
        }
      }

      // Quota was previously enforced with no client-visible signal at
      // all until the 429 hit - the client now learns how much is left
      // after every successful repost too, so the UI can warn before
      // the limit is actually reached instead of only after.
      return NextResponse.json({
        reposted: true,
        limit: reservation.limit,
        remaining: Math.max(0, reservation.limit - reservation.used),
      });
    }
  } catch (error) {
    console.error("Repost error:", error);
    return NextResponse.json({ error: "Something went wrong" }, { status: 500 });
  }
}
