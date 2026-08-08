import { NextRequest, NextResponse } from "next/server";
import { getServerSession } from "next-auth";
import { authOptions } from "@/lib/auth";
import { prisma } from "@/lib/db";
import { createNotification } from "@/lib/notifications";
import { sendPushNotification } from "@/lib/push-notifications";

export async function POST(
  req: NextRequest,
  { params }: { params: { username: string } }
) {
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
      await prisma.follow.delete({
        where: {
          followerId_followingId: {
            followerId,
            followingId: targetId,
          },
        },
      });

      // Also delete any pending follow request (if it exists)
      await prisma.followRequest.deleteMany({
        where: {
          requesterId: followerId,
          targetId: targetId,
          status: "pending",
        },
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
      await prisma.followRequest.create({
        data: {
          requesterId: followerId,
          targetId: targetId,
          status: "pending",
        },
      });

      // ─── Notify target user about follow request ──────────────────
      await createNotification({
        userId: targetId,
        type: "follow_request",
        fromUserId: followerId,
      });

      // Optional: send push notification about follow request
      await sendPushNotification(
        targetId,
        "New Follow Request",
        `${session.user.name || session.user.username} wants to follow you.`,
        `/profile/${session.user.username}`
      );

      return NextResponse.json({
        following: false,
        requested: true,
        message: "Follow request sent.",
      });
    }

    // ─── Public account: follow directly ────────────────────────────
    await prisma.follow.create({
      data: {
        followerId,
        followingId: targetId,
      },
    });

    // ─── Send database notification ──────────────────────────────────
    await createNotification({
      userId: targetId,
      type: "follow",
      fromUserId: followerId,
    });

    // ─── Send push notification ──────────────────────────────────────
    await sendPushNotification(
      targetId,
      "New Follower",
      `${session.user.name || session.user.username} started following you.`,
      `/profile/${session.user.username}`
    );

    return NextResponse.json({ following: true, requested: false });
  } catch (error) {
    console.error("Follow error:", error);
    return NextResponse.json({ error: "Failed to toggle follow" }, { status: 500 });
  }
}
