import { NextRequest, NextResponse } from "next/server";
import { getServerSession } from "next-auth";
import { authOptions } from "@/lib/auth";
import { prisma } from "@/lib/db";

export async function POST(
  req: NextRequest,
  { params }: { params: { id: string } }
) {
  const session = await getServerSession(authOptions);
  if (!session || !session.user) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const followerId = session.user.id;
  const followingId = params.id;

  if (followerId === followingId) {
    return NextResponse.json({ error: "Cannot follow yourself" }, { status: 400 });
  }

  try {
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
