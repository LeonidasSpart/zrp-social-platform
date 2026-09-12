import { NextRequest, NextResponse } from "next/server";
import { getServerSession } from "next-auth";
import { authOptions } from "@/lib/auth";
import { prisma } from "@/lib/db";
import { rateLimit } from "@/lib/rate-limit";

export async function DELETE(req: NextRequest, props: { params: Promise<{ userId: string }> }) {
  const params = await props.params;

  const limit = await rateLimit(req, { limit: 10, window: 300, type: "messages-conversation-delete" });
  if (!limit.success) return limit.response;

  const session = await getServerSession(authOptions);
  if (!session?.user?.id) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const otherUserId = params.userId;
  const currentUserId = session.user.id;

  try {
    // ⚠️ SECURITY: this used to hard-delete every Message row shared
    // with otherUserId via a bare deleteMany - permanently destroying
    // the OTHER participant's copy of the conversation too, with no
    // consent, no undo, and attachment files ripped out from under
    // them, even though the confirmation UI only ever promised to
    // delete "your conversation" (i.e. the caller's own view). Instead,
    // record a per-user clearance marker: only this account's own view
    // is hidden (see GET /api/messages/[userId] and
    // getUserConversations, which both filter on it), the other
    // participant's messages and attachments are untouched, and a new
    // message sent afterward makes the conversation reappear normally.
    await prisma.conversationClearance.upsert({
      where: { userId_otherUserId: { userId: currentUserId, otherUserId } },
      create: { userId: currentUserId, otherUserId, clearedBefore: new Date() },
      update: { clearedBefore: new Date() },
    });

    return NextResponse.json({ success: true });
  } catch (error) {
    console.error("Error deleting conversation:", error);
    return NextResponse.json(
      { error: "Failed to delete conversation" },
      { status: 500 }
    );
  }
}
