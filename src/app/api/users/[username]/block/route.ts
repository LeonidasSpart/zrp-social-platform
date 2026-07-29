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

  const blockerId = session.user.id;

  try {
    const userToBlock = await prisma.user.findUnique({
      where: { username: params.username },
      select: { id: true },
    });

    if (!userToBlock) {
      return NextResponse.json({ error: "User not found" }, { status: 404 });
    }

    if (blockerId === userToBlock.id) {
      return NextResponse.json({ error: "You cannot block yourself" }, { status: 400 });
    }

    const existingBlock = await prisma.blocked.findUnique({
      where: {
        blockerId_blockedId: {
          blockerId,
          blockedId: userToBlock.id,
        },
      },
    });

    if (existingBlock) {
      // Unblock
      await prisma.blocked.delete({
        where: {
          blockerId_blockedId: {
            blockerId,
            blockedId: userToBlock.id,
          },
        },
      });
      return NextResponse.json({ blocked: false });
    } else {
      // Block
      await prisma.blocked.create({
        data: {
          blockerId,
          blockedId: userToBlock.id,
        },
      });
      return NextResponse.json({ blocked: true });
    }
  } catch (error) {
    console.error("Block error:", error);
    return NextResponse.json({ error: "Failed to toggle block" }, { status: 500 });
  }
}
