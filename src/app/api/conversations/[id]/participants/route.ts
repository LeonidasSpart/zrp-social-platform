import { NextRequest, NextResponse } from "next/server";
import { getServerSession } from "next-auth";
import { authOptions } from "@/lib/auth";
import { prisma } from "@/lib/db";
import { rateLimit } from "@/lib/rate-limit";
import { getConversationParticipant } from "@/lib/conversations";

const MAX_PARTICIPANTS = 100;

// ─── POST add real participant(s) to a group ─────────────────────────
// Any current member may add someone - a common, low-friction group
// convention (matches most real group-chat products) - but only the
// OWNER may remove someone else (see [userId]/route.ts). Adding
// yourself back after leaving isn't a special case: it's just adding a
// participant whose id happens to be your own, subject to the same
// checks as anyone else.
export async function POST(req: NextRequest, props: { params: Promise<{ id: string }> }) {
  const { id } = await props.params;

  const limit = await rateLimit(req, { limit: 30, window: 3600, type: "conversation-participants-add" });
  if (!limit.success) return limit.response!;

  const session = await getServerSession(authOptions);
  if (!session?.user) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const membership = await getConversationParticipant(id, session.user.id);
  if (!membership) {
    return NextResponse.json({ error: "Conversation not found" }, { status: 404 });
  }

  try {
    const { participantIds } = await req.json();
    if (!Array.isArray(participantIds) || participantIds.length === 0 || participantIds.some((p) => typeof p !== "string")) {
      return NextResponse.json({ error: "participantIds must be a non-empty list of user ids" }, { status: 400 });
    }

    const existing = await prisma.conversationParticipant.findMany({
      where: { conversationId: id },
      select: { userId: true },
    });
    const existingIds = new Set(existing.map((p) => p.userId));
    const newIds = Array.from(new Set(participantIds.filter((pid: string) => !existingIds.has(pid))));

    if (newIds.length === 0) {
      return NextResponse.json({ error: "Those users are already in this group" }, { status: 400 });
    }
    if (existingIds.size + newIds.length > MAX_PARTICIPANTS) {
      return NextResponse.json({ error: `A group can have at most ${MAX_PARTICIPANTS} members` }, { status: 400 });
    }

    const realUsers = await prisma.user.findMany({ where: { id: { in: newIds } }, select: { id: true } });
    if (realUsers.length !== newIds.length) {
      return NextResponse.json({ error: "One or more selected users could not be found" }, { status: 404 });
    }

    const blocks = await prisma.blocked.findMany({
      where: {
        OR: [
          { blockerId: session.user.id, blockedId: { in: newIds } },
          { blockedId: session.user.id, blockerId: { in: newIds } },
        ],
      },
    });
    if (blocks.length > 0) {
      return NextResponse.json({ error: "Cannot add a user you've blocked or who has blocked you" }, { status: 403 });
    }

    await prisma.conversationParticipant.createMany({
      data: newIds.map((userId) => ({ conversationId: id, userId, role: "MEMBER" as const })),
    });

    const conversation = await prisma.conversation.findUnique({
      where: { id },
      include: {
        participants: {
          include: { user: { select: { id: true, username: true, name: true, avatarUrl: true, badgeType: true } } },
        },
      },
    });

    return NextResponse.json(conversation, { status: 201 });
  } catch (error) {
    console.error("Error adding group participants:", error);
    return NextResponse.json({ error: "Failed to add participants" }, { status: 500 });
  }
}
