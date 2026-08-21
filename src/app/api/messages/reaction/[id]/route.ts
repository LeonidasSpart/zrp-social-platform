import { NextRequest, NextResponse } from "next/server";
import { getServerSession } from "next-auth";
import { authOptions } from "@/lib/auth";
import { prisma } from "@/lib/db";
import { rateLimit } from "@/lib/rate-limit";

export async function POST(req: NextRequest, props: { params: Promise<{ id: string }> }) {
  const params = await props.params;

  const limit = await rateLimit(req, { limit: 60, window: 300, type: "messages-reaction" });
  if (!limit.success) return limit.response;

  const session = await getServerSession(authOptions);
  if (!session?.user?.id) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const messageId = params.id;

  try {
    const { emoji } = await req.json();
    if (!emoji) {
      return NextResponse.json({ error: "Emoji is required" }, { status: 400 });
    }

    const message = await prisma.message.findUnique({
      where: { id: messageId },
      select: { senderId: true, receiverId: true },
    });
    if (!message) {
      return NextResponse.json({ error: "Message not found" }, { status: 404 });
    }
    if (message.senderId !== session.user.id && message.receiverId !== session.user.id) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 403 });
    }

    const existing = await prisma.messageReaction.findUnique({
      where: { messageId_userId: { messageId, userId: session.user.id } },
    });

    let action: "added" | "removed" | "changed";
    if (existing && existing.emoji === emoji) {
      // Tapping the same emoji again removes it
      await prisma.messageReaction.delete({ where: { id: existing.id } });
      action = "removed";
    } else if (existing) {
      // Switching to a different emoji replaces it (one reaction per person)
      await prisma.messageReaction.update({
        where: { id: existing.id },
        data: { emoji },
      });
      action = "changed";
    } else {
      await prisma.messageReaction.create({
        data: { messageId, userId: session.user.id, emoji },
      });
      action = "added";
    }

    const reactions = await prisma.messageReaction.findMany({
      where: { messageId },
      include: { user: { select: { id: true, username: true, name: true, avatarUrl: true } } },
    });

    return NextResponse.json({ action, reactions });
  } catch (error) {
    console.error("Error toggling message reaction:", error);
    return NextResponse.json({ error: "Failed to toggle reaction" }, { status: 500 });
  }
}
