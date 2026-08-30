export const runtime = "nodejs";
export const dynamic = "force-dynamic";

import { NextRequest, NextResponse } from "next/server";
import { getToken } from "next-auth/jwt";
import { prisma } from "@/lib/db";
import { rateLimit } from "@/lib/rate-limit";
import { createNotification } from "@/lib/notifications";
import { parseCursorParams, buildPage } from "@/lib/pagination";

const DUEL_EXPIRY_HOURS = 48;

const PARTICIPANT_SELECT = {
  id: true,
  username: true,
  name: true,
  avatarUrl: true,
  badgeType: true,
} as const;

// ─── GET: my duels (incoming + outgoing + active + completed) ───────
export async function GET(req: NextRequest) {
  const token = await getToken({ req, secret: process.env.NEXTAUTH_SECRET });
  if (!token) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }
  const userId = token.id as string;

  try {
    const { cursor, limit } = parseCursorParams(req);
    const status = req.nextUrl.searchParams.get("status");

    const duels = await prisma.playDuel.findMany({
      where: {
        OR: [{ challengerId: userId }, { opponentId: userId }],
        ...(status ? { status: status as any } : {}),
      },
      orderBy: { createdAt: "desc" },
      take: limit + 1,
      ...(cursor ? { cursor: { id: cursor }, skip: 1 } : {}),
      include: {
        challenge: {
          select: { id: true, type: true, title: true, difficulty: true, maxScore: true },
        },
        challenger: { select: PARTICIPANT_SELECT },
        opponent: { select: PARTICIPANT_SELECT },
      },
    });

    const { items, nextCursor } = buildPage(duels, limit);
    return NextResponse.json({ duels: items, nextCursor });
  } catch (error) {
    console.error("Error fetching PLAY duels:", error);
    return NextResponse.json({ error: "Failed to fetch duels" }, { status: 500 });
  }
}

// ─── POST: challenge a friend to a 1v1 duel on an existing challenge ─
export async function POST(req: NextRequest) {
  const limit = await rateLimit(req, { limit: 20, window: 3600, type: "play-duel-create" });
  if (!limit.success) return limit.response;

  const token = await getToken({ req, secret: process.env.NEXTAUTH_SECRET });
  if (!token) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }
  const userId = token.id as string;

  try {
    const body = await req.json();
    const { challengeId, opponentId } = body;

    if (!challengeId || typeof challengeId !== "string") {
      return NextResponse.json({ error: "A challenge is required." }, { status: 400 });
    }
    if (!opponentId || typeof opponentId !== "string") {
      return NextResponse.json({ error: "An opponent is required." }, { status: 400 });
    }
    if (opponentId === userId) {
      return NextResponse.json({ error: "You can't duel yourself." }, { status: 400 });
    }

    const [challenge, opponent] = await Promise.all([
      prisma.playChallenge.findUnique({ where: { id: challengeId } }),
      prisma.user.findUnique({ where: { id: opponentId }, select: { id: true } }),
    ]);
    if (!challenge || challenge.status !== "ACTIVE") {
      return NextResponse.json({ error: "Challenge not found" }, { status: 404 });
    }
    if (!opponent) {
      return NextResponse.json({ error: "Opponent not found" }, { status: 404 });
    }

    // Same both-directions block check used by messaging - blocking
    // someone shouldn't leave them able to reach you via a duel invite.
    const blockExists = await prisma.blocked.findFirst({
      where: {
        OR: [
          { blockerId: userId, blockedId: opponentId },
          { blockerId: opponentId, blockedId: userId },
        ],
      },
    });
    if (blockExists) {
      return NextResponse.json({ error: "You can't duel this user." }, { status: 403 });
    }

    const duel = await prisma.playDuel.create({
      data: {
        challengeId,
        challengerId: userId,
        opponentId,
        expiresAt: new Date(Date.now() + DUEL_EXPIRY_HOURS * 60 * 60 * 1000),
      },
      include: {
        challenge: { select: { id: true, type: true, title: true, difficulty: true, maxScore: true } },
        challenger: { select: PARTICIPANT_SELECT },
        opponent: { select: PARTICIPANT_SELECT },
      },
    });

    await createNotification({
      userId: opponentId,
      type: "play_duel_challenge",
      fromUserId: userId,
      duelId: duel.id,
    });

    return NextResponse.json({ duel }, { status: 201 });
  } catch (error) {
    console.error("Error creating PLAY duel:", error);
    return NextResponse.json({ error: "Failed to create duel" }, { status: 500 });
  }
}
