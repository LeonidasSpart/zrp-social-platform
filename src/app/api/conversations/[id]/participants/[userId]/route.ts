import { NextRequest, NextResponse } from "next/server";
import { getServerSession } from "next-auth";
import { authOptions } from "@/lib/auth";
import { prisma } from "@/lib/db";
import { rateLimit } from "@/lib/rate-limit";
import { getConversationParticipant } from "@/lib/conversations";

// ─── DELETE leave (self) or remove (OWNER removing someone else) ─────
// Deleting the ConversationParticipant row IS the real access
// revocation - the same row every other route's membership check
// queries (see getConversationParticipant's own KDoc). Their past
// messages stay in the conversation (Message.senderId is untouched);
// only their own future access is revoked.
export async function DELETE(req: NextRequest, props: { params: Promise<{ id: string; userId: string }> }) {
  const { id, userId: targetUserId } = await props.params;

  const limit = await rateLimit(req, { limit: 30, window: 3600, type: "conversation-participants-remove" });
  if (!limit.success) return limit.response!;

  const session = await getServerSession(authOptions);
  if (!session?.user) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const requesterMembership = await getConversationParticipant(id, session.user.id);
  if (!requesterMembership) {
    return NextResponse.json({ error: "Conversation not found" }, { status: 404 });
  }

  const isSelf = session.user.id === targetUserId;
  if (!isSelf && requesterMembership.role !== "OWNER") {
    return NextResponse.json({ error: "Only the group owner can remove other members" }, { status: 403 });
  }

  const targetMembership = await getConversationParticipant(id, targetUserId);
  if (!targetMembership) {
    return NextResponse.json({ error: "That user isn't in this group" }, { status: 404 });
  }

  try {
    await prisma.conversationParticipant.delete({
      where: { conversationId_userId: { conversationId: id, userId: targetUserId } },
    });

    return NextResponse.json({ success: true });
  } catch (error) {
    console.error("Error removing group participant:", error);
    return NextResponse.json({ error: "Failed to remove participant" }, { status: 500 });
  }
}
