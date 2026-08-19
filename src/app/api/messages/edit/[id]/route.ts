import { NextRequest, NextResponse } from "next/server";
import { getServerSession } from "next-auth";
import { authOptions } from "@/lib/auth";
import { prisma } from "@/lib/db";

export async function PUT(req: NextRequest, props: { params: Promise<{ id: string }> }) {
  const params = await props.params;
  const session = await getServerSession(authOptions);
  if (!session?.user?.id) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const messageId = params.id;

  try {
    const { content } = await req.json();
    if (!content || content.trim().length === 0) {
      return NextResponse.json({ error: "Message content is required" }, { status: 400 });
    }

    const existing = await prisma.message.findUnique({
      where: { id: messageId },
      select: { senderId: true },
    });

    if (!existing) {
      return NextResponse.json({ error: "Message not found" }, { status: 404 });
    }

    // Only the original sender may edit their own message
    if (existing.senderId !== session.user.id) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 403 });
    }

    const updated = await prisma.message.update({
      where: { id: messageId },
      data: { content: content.trim(), edited: true },
      include: {
        sender: {
          select: { id: true, username: true, name: true, avatarUrl: true, badgeType: true },
        },
        replyTo: {
          include: {
            sender: { select: { id: true, username: true, name: true, avatarUrl: true, badgeType: true } },
          },
        },
        reactions: {
          include: { user: { select: { id: true, username: true, name: true, avatarUrl: true } } },
        },
      },
    });

    return NextResponse.json(updated);
  } catch (error) {
    console.error("Error editing message:", error);
    return NextResponse.json({ error: "Failed to edit message" }, { status: 500 });
  }
}
