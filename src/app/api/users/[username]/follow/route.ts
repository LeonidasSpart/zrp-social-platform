import { NextRequest, NextResponse } from "next/server";
import { getServerSession } from "next-auth";
import { Prisma } from "@prisma/client";
import { authOptions } from "@/lib/auth";
import { prisma } from "@/lib/db";
import { createNotification } from "@/lib/notifications";
import { sendPushNotification } from "@/lib/push-notifications";
import { isBlockedEitherWay } from "@/lib/auth-guards";

function isUniqueViolation(err: unknown): boolean {
  return err instanceof Prisma.PrismaClientKnownRequestError && err.code === "P2002";
}

export async function POST(req: NextRequest, props: { params: Promise<{ username: string }> }) {
  const params = await props.params;
  const session = await getServerSession(authOptions);
  if (!session || !session.user) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const followerId = session.user.id;
  const username = params.username;

  try {
    // ─── Get target user with privacy setting ──────────────────────
    const targetUser = await prisma.user.findUnique({
      where: { username },
      select: {
        id: true,
        name: true,
        isPrivate: true,
      },
    });

    if (!targetUser) {
      return NextResponse.json({ error: "User not found" }, { status: 404 });
    }

    const targetId = targetUser.id;

    if (followerId === targetId) {
      return NextResponse.json({ error: "Cannot follow yourself" }, { status: 400 });
    }

    // ⚠️ SECURITY/PRIVACY: confirmed missing by audit - a blocked-either-way
    // relationship could still follow/be followed and trigger a
    // notification. Checked up front, before any follow/request mutation,
    // not just at notification time - the relationship itself must never
    // form, not only the alert about it.
    if (await isBlockedEitherWay(followerId, targetId)) {
      return NextResponse.json({ error: "Cannot follow this user" }, { status: 403 });
    }

    // ─── Check if already following ──────────────────────────────────
    const existingFollow = await prisma.follow.findUnique({
      where: {
        followerId_followingId: {
          followerId,
          followingId: targetId,
        },
      },
    });

    // ─── If already following -> unfollow ────────────────────────────
    if (existingFollow) {
      try {
        await prisma.follow.delete({
          where: {
            followerId_followingId: {
              followerId,
              followingId: targetId,
            },
          },
        });
      } catch (err) {
        // Already gone (a concurrent unfollow won the race) - same
        // outcome the caller wanted, not a 500.
        if (!(err instanceof Prisma.PrismaClientKnownRequestError && err.code === "P2025")) throw err;
      }

      // Also delete any pending follow request (if it exists)
      await prisma.followRequest.deleteMany({
        where: {
          requesterId: followerId,
          targetId: targetId,
          status: "pending",
        },
      });

      // Retract the follow notification, same reasoning as the
      // like route's unlike branch: a follow -> unfollow -> follow
      // cycle shouldn't leave an orphaned unread notification behind.
      await prisma.notification.deleteMany({
        where: { type: "follow", fromUserId: followerId, userId: targetId, read: false },
      });

      return NextResponse.json({ following: false, requested: false });
    }

    // ─── If target account is private ──────────────────────────────
    if (targetUser.isPrivate) {
      // Check if there's already a pending request
      const existingRequest = await prisma.followRequest.findUnique({
        where: {
          requesterId_targetId: {
            requesterId: followerId,
            targetId: targetId,
          },
        },
      });

      if (existingRequest) {
        if (existingRequest.status === "pending") {
          // Request already sent
          return NextResponse.json({
            following: false,
            requested: true,
            message: "Follow request already sent.",
          });
        } else if (existingRequest.status === "rejected") {
          // Optionally allow re-request by updating status to pending
          await prisma.followRequest.update({
            where: { id: existingRequest.id },
            data: { status: "pending" },
          });
          return NextResponse.json({
            following: false,
            requested: true,
            message: "Follow request re-sent.",
          });
        }
        // If approved, they would already be following (handled earlier)
      }

      // Create a new follow request
      try {
        await prisma.followRequest.create({
          data: {
            requesterId: followerId,
            targetId: targetId,
            status: "pending",
          },
        });
      } catch (err) {
        // A concurrent request already created it - same outcome, not a 500.
        if (!isUniqueViolation(err)) throw err;
        return NextResponse.json({ following: false, requested: true, message: "Follow request already sent." });
      }

      // ─── Notify target user about follow request ──────────────────
      const notified = await createNotification({
        userId: targetId,
        type: "follow_request",
        fromUserId: followerId,
      });

      // Optional: send push notification about follow request
      if (notified) {
        await sendPushNotification(
          targetId,
          "New Follow Request",
          `${session.user.name || session.user.username} wants to follow you.`,
          `/profile/${session.user.username}`
        );
      }

      return NextResponse.json({
        following: false,
        requested: true,
        message: "Follow request sent.",
      });
    }

    // ─── Public account: follow directly ────────────────────────────
    try {
      await prisma.follow.create({
        data: {
          followerId,
          followingId: targetId,
        },
      });
    } catch (err) {
      if (!isUniqueViolation(err)) throw err;
      return NextResponse.json({ following: true, requested: false });
    }

    // ─── Send database notification ──────────────────────────────────
    const notified = await createNotification({
      userId: targetId,
      type: "follow",
      fromUserId: followerId,
    });

    // ─── Send push notification ──────────────────────────────────────
    if (notified) {
      await sendPushNotification(
        targetId,
        "New Follower",
        `${session.user.name || session.user.username} started following you.`,
        `/profile/${session.user.username}`
      );
    }

    return NextResponse.json({ following: true, requested: false });
  } catch (error) {
    console.error("Follow error:", error);
    return NextResponse.json({ error: "Failed to toggle follow" }, { status: 500 });
  }
}
