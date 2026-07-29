import { NextRequest, NextResponse } from "next/server";
import { getServerSession } from "next-auth";
import { authOptions } from "@/lib/auth";
import { prisma } from "@/lib/db";

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

  if (followerId === username) {
    return NextResponse.json({ error: "Cannot follow yourself" }, { status: 400 });
  }

  try {
    // Find the user to follow by username
    const userToFollow = await prisma.user.findUnique({
      where: { username },
      select: { id: true },
    });

    if (!userToFollow) {
      return NextResponse.json({ error: "User not found" }, { status: 404 });
    }

    const followingId = userToFollow.id;

    const existing = await prisma.follow.findUnique({
      where: {
        followerId_followingId: {
          followerId,
          followingId,
        },
      },
    });

    if (existing) {
      await prisma.follow.delete({
        where: {
          followerId_followingId: {
            followerId,
            followingId,
          },
        },
      });
      return NextResponse.json({ following: false });
    } else {
      await prisma.follow.create({
        data: {
          followerId,
          followingId,
        },
      });
      return NextResponse.json({ following: true });
    }
  } catch (error) {
    console.error("Follow error:", error);
    return NextResponse.json({ error: "Failed to toggle follow" }, { status: 500 });
  }
}
