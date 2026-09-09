import { NextRequest, NextResponse } from "next/server";
import { getServerSession } from "next-auth";
import { authOptions } from "@/lib/auth";
import { prisma } from "@/lib/db";
import { rateLimit } from "@/lib/rate-limit";
import { getConversationParticipant } from "@/lib/conversations";

const MAX_GROUP_NAME_LENGTH = 100;

const PARTICIPANT_INCLUDE = {
  participants: {
    include: { user: { select: { id: true, username: true, name: true, avatarUrl: true, badgeType: true } } },
  },
} as const;

// ─── GET conversation detail (participant list, name, avatar) ───────
export async function GET(req: NextRequest, props: { params: Promise<{ id: string }> }) {
  const { id } = await props.params;

  const limit = await rateLimit(req, { limit: 60, window: 60, type: "conversations-get" });
  if (!limit.success) return limit.response!;

  const session = await getServerSession(authOptions);
  if (!session?.user) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  // Membership is the real access boundary - a conversation that
  // exists but this user was never (or is no longer) a participant of
  // must read exactly like one that doesn't exist. Never distinguish
  // the two in the response, which would leak that a private group
  // exists at all.
  const membership = await getConversationParticipant(id, session.user.id);
  if (!membership) {
    return NextResponse.json({ error: "Conversation not found" }, { status: 404 });
  }

  const conversation = await prisma.conversation.findUnique({
    where: { id },
    include: PARTICIPANT_INCLUDE,
  });
  if (!conversation) {
    return NextResponse.json({ error: "Conversation not found" }, { status: 404 });
  }

  return NextResponse.json(conversation);
}

// ─── PATCH rename/re-avatar a group - OWNER only ─────────────────────
export async function PATCH(req: NextRequest, props: { params: Promise<{ id: string }> }) {
  const { id } = await props.params;

  const limit = await rateLimit(req, { limit: 20, window: 3600, type: "conversations-update" });
  if (!limit.success) return limit.response!;

  const session = await getServerSession(authOptions);
  if (!session?.user) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const membership = await getConversationParticipant(id, session.user.id);
  if (!membership) {
    return NextResponse.json({ error: "Conversation not found" }, { status: 404 });
  }
  if (membership.role !== "OWNER") {
    return NextResponse.json({ error: "Only the group owner can update it" }, { status: 403 });
  }

  try {
    const { name, avatarUrl } = await req.json();
    const data: { name?: string; avatarUrl?: string | null } = {};

    if (name !== undefined) {
      if (typeof name !== "string" || name.trim().length === 0) {
        return NextResponse.json({ error: "Group name cannot be empty" }, { status: 400 });
      }
      if (name.length > MAX_GROUP_NAME_LENGTH) {
        return NextResponse.json({ error: "Group name is too long" }, { status: 400 });
      }
      data.name = name.trim();
    }
    if (avatarUrl !== undefined) {
      data.avatarUrl = typeof avatarUrl === "string" && avatarUrl ? avatarUrl : null;
    }

    const conversation = await prisma.conversation.update({
      where: { id },
      data,
      include: PARTICIPANT_INCLUDE,
    });

    return NextResponse.json(conversation);
  } catch (error) {
    console.error("Error updating conversation:", error);
    return NextResponse.json({ error: "Failed to update group" }, { status: 500 });
  }
}
