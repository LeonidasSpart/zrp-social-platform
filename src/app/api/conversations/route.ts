import { NextRequest, NextResponse } from "next/server";
import { getServerSession } from "next-auth";
import { authOptions } from "@/lib/auth";
import { prisma } from "@/lib/db";
import { rateLimit } from "@/lib/rate-limit";
import { getUserGroupConversations } from "@/lib/conversations";
import { isAllowedMediaUrl } from "@/lib/media-url";

const MAX_GROUP_NAME_LENGTH = 100;
// A group needs at least this many OTHER real members beyond the
// creator to actually be a group rather than functioning as a 1:1 -
// real 1:1 messaging (which already exists) is the right tool for a
// two-person thread.
const MIN_OTHER_PARTICIPANTS = 2;
const MAX_PARTICIPANTS = 100;

// ─── GET the current user's real group conversations ────────────────
export async function GET(req: NextRequest) {
  const limit = await rateLimit(req, { limit: 60, window: 60, type: "conversations-get" });
  if (!limit.success) return limit.response!;

  const session = await getServerSession(authOptions);
  if (!session?.user) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  try {
    const conversations = await getUserGroupConversations(session.user.id);
    return NextResponse.json(conversations);
  } catch (error) {
    console.error("Error fetching group conversations:", error);
    return NextResponse.json({ error: "Failed to fetch conversations" }, { status: 500 });
  }
}

// ─── POST create a real GROUP conversation ───────────────────────────
export async function POST(req: NextRequest) {
  // Same order of magnitude as messages-send - creating a group is a
  // deliberate, occasional action, not something a real user does 60
  // times an hour, so this is intentionally tighter.
  const limit = await rateLimit(req, { limit: 20, window: 3600, type: "conversations-create" });
  if (!limit.success) return limit.response!;

  const session = await getServerSession(authOptions);
  if (!session?.user) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  try {
    const { name, participantIds, avatarUrl } = await req.json();

    if (typeof name !== "string" || name.trim().length === 0) {
      return NextResponse.json({ error: "Group name is required" }, { status: 400 });
    }
    if (name.length > MAX_GROUP_NAME_LENGTH) {
      return NextResponse.json({ error: "Group name is too long" }, { status: 400 });
    }
    if (!Array.isArray(participantIds) || participantIds.some((id) => typeof id !== "string")) {
      return NextResponse.json({ error: "participantIds must be a list of user ids" }, { status: 400 });
    }
    // ⚠️ SECURITY: a group avatar is rendered for every member, so it
    // must come from ZRP's own upload storage - see src/lib/media-url.ts.
    if (typeof avatarUrl === "string" && avatarUrl && !isAllowedMediaUrl(avatarUrl)) {
      return NextResponse.json({ error: "Group avatar must be uploaded through ZRP." }, { status: 400 });
    }

    // Real ids only, deduplicated, self excluded (the creator is added
    // as OWNER below regardless of whether they included themselves).
    const requestedIds = Array.from(new Set(participantIds.filter((id: string) => id !== session.user.id)));
    if (requestedIds.length < MIN_OTHER_PARTICIPANTS) {
      return NextResponse.json(
        { error: `A group needs at least ${MIN_OTHER_PARTICIPANTS} other members` },
        { status: 400 }
      );
    }
    if (requestedIds.length + 1 > MAX_PARTICIPANTS) {
      return NextResponse.json({ error: `A group can have at most ${MAX_PARTICIPANTS} members` }, { status: 400 });
    }

    // ─── Verify every requested participant is a real, existing user ──
    const realUsers = await prisma.user.findMany({
      where: { id: { in: requestedIds } },
      select: { id: true },
    });
    if (realUsers.length !== requestedIds.length) {
      return NextResponse.json({ error: "One or more selected users could not be found" }, { status: 404 });
    }

    // ─── Respect blocks in either direction, same as 1:1 messaging ────
    const blocks = await prisma.blocked.findMany({
      where: {
        OR: [
          { blockerId: session.user.id, blockedId: { in: requestedIds } },
          { blockedId: session.user.id, blockerId: { in: requestedIds } },
        ],
      },
    });
    if (blocks.length > 0) {
      return NextResponse.json(
        { error: "Cannot add a user you've blocked or who has blocked you" },
        { status: 403 }
      );
    }

    const conversation = await prisma.conversation.create({
      data: {
        type: "GROUP",
        name: name.trim(),
        avatarUrl: typeof avatarUrl === "string" && avatarUrl ? avatarUrl : null,
        createdById: session.user.id,
        participants: {
          create: [
            { userId: session.user.id, role: "OWNER" },
            ...requestedIds.map((userId) => ({ userId, role: "MEMBER" as const })),
          ],
        },
      },
      include: {
        participants: {
          include: { user: { select: { id: true, username: true, name: true, avatarUrl: true, badgeType: true } } },
        },
      },
    });

    return NextResponse.json(conversation, { status: 201 });
  } catch (error) {
    console.error("Error creating group conversation:", error);
    return NextResponse.json({ error: "Failed to create group" }, { status: 500 });
  }
}
