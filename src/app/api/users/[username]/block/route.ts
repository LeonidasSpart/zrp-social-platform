import { NextRequest, NextResponse } from "next/server";
import { getServerSession } from "next-auth";
import { authOptions } from "@/lib/auth";
import { prisma } from "@/lib/db";
import { io } from "@/lib/socket-server"; // ✅ import the socket server instance

// ─── POST – Block a user ────────────────────────────────────────────
export async function POST(req: NextRequest, props: { params: Promise<{ username: string }> }) {
  const params = await props.params;
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
      // ✅ Emit socket event for real‑time update
      io?.emit("block-updated", { blockerId, blockedId: userToBlock.id });
      return NextResponse.json({ blocked: false });
    } else {
      // Block
      await prisma.blocked.create({
        data: {
          blockerId,
          blockedId: userToBlock.id,
        },
      });
      io?.emit("block-updated", { blockerId, blockedId: userToBlock.id });
      return NextResponse.json({ blocked: true });
    }
  } catch (error) {
    console.error("Block error:", error);
    return NextResponse.json({ error: "Failed to toggle block" }, { status: 500 });
  }
}

// ─── DELETE – Unblock a user ────────────────────────────────────────
export async function DELETE(req: NextRequest, props: { params: Promise<{ username: string }> }) {
  const params = await props.params;
  const session = await getServerSession(authOptions);
  if (!session || !session.user) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const blockerId = session.user.id;

  try {
    const userToUnblock = await prisma.user.findUnique({
      where: { username: params.username },
      select: { id: true },
    });

    if (!userToUnblock) {
      return NextResponse.json({ error: "User not found" }, { status: 404 });
    }

    const existingBlock = await prisma.blocked.findUnique({
      where: {
        blockerId_blockedId: {
          blockerId,
          blockedId: userToUnblock.id,
        },
      },
    });

    if (!existingBlock) {
      return NextResponse.json({ error: "User is not blocked" }, { status: 404 });
    }

    await prisma.blocked.delete({
      where: {
        blockerId_blockedId: {
          blockerId,
          blockedId: userToUnblock.id,
        },
      },
    });

    io?.emit("block-updated", { blockerId, blockedId: userToUnblock.id });
    return NextResponse.json({ blocked: false });
  } catch (error) {
    console.error("Unblock error:", error);
    return NextResponse.json({ error: "Failed to unblock user" }, { status: 500 });
  }
}
