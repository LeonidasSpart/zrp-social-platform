export const runtime = "nodejs";
export const dynamic = "force-dynamic";

import { NextRequest, NextResponse } from "next/server";
import { getToken } from "next-auth/jwt";
import { prisma } from "@/lib/db";
import { rateLimit } from "@/lib/rate-limit";
import { parseCursorParams, buildPage } from "@/lib/pagination";
import { validateChallengeContent, stripAnswers } from "@/lib/play/scoring";
import { Prisma, PlayChallengeType } from "@prisma/client";

const TYPES = ["TRIVIA", "MEMORY", "LOGIC"] as const;

const CREATOR_SELECT = {
  id: true,
  username: true,
  name: true,
  avatarUrl: true,
  badgeType: true,
} as const;

// ─── GET: browse challenges - trending / daily / mine / by type ─────
export async function GET(req: NextRequest) {
  try {
    const { cursor, limit } = parseCursorParams(req);
    const type = req.nextUrl.searchParams.get("type");
    const creatorId = req.nextUrl.searchParams.get("creatorId");
    const sort = req.nextUrl.searchParams.get("sort") || "trending";

    const where: Prisma.PlayChallengeWhereInput = { status: "ACTIVE" };
    if (type && (TYPES as readonly string[]).includes(type)) {
      where.type = type as PlayChallengeType;
    }
    if (creatorId) where.creatorId = creatorId;
    // Trending browsing intentionally excludes the daily challenge -
    // it has its own dedicated slot on the PLAY home page.
    if (sort === "trending") where.isDaily = false;

    const orderBy: Prisma.PlayChallengeOrderByWithRelationInput =
      sort === "newest" ? { createdAt: "desc" } : { playCount: "desc" };

    const challenges = await prisma.playChallenge.findMany({
      where,
      orderBy,
      take: limit + 1,
      ...(cursor ? { cursor: { id: cursor }, skip: 1 } : {}),
      select: {
        id: true,
        type: true,
        title: true,
        description: true,
        difficulty: true,
        maxScore: true,
        isDaily: true,
        isAiGenerated: true,
        playCount: true,
        createdAt: true,
        creator: { select: CREATOR_SELECT },
        _count: { select: { attempts: true } },
      },
    });

    const { items, nextCursor } = buildPage(challenges, limit);
    return NextResponse.json({ challenges: items, nextCursor });
  } catch (error) {
    console.error("Error fetching PLAY challenges:", error);
    return NextResponse.json({ error: "Failed to fetch challenges" }, { status: 500 });
  }
}

// ─── POST: create a challenge - live immediately, same as Post ──────
// (reportable after the fact via Report.challengeId rather than a
// PENDING_REVIEW admin gate - see PlayChallengeStatus in schema.prisma)
export async function POST(req: NextRequest) {
  const limit = await rateLimit(req, { limit: 15, window: 3600, type: "play-challenge-create" });
  if (!limit.success) return limit.response;

  const token = await getToken({ req, secret: process.env.NEXTAUTH_SECRET });
  if (!token) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  try {
    const body = await req.json();
    const { type, title, description, difficulty, content } = body;

    if (!type || !(TYPES as readonly string[]).includes(type)) {
      return NextResponse.json({ error: "A valid challenge type is required." }, { status: 400 });
    }
    if (!title || typeof title !== "string" || !title.trim() || title.trim().length > 120) {
      return NextResponse.json({ error: "Title is required (max 120 characters)." }, { status: 400 });
    }
    const cleanDifficulty = ["easy", "medium", "hard"].includes(difficulty) ? difficulty : "medium";

    const contentError = validateChallengeContent(type as PlayChallengeType, content);
    if (contentError) {
      return NextResponse.json({ error: contentError }, { status: 400 });
    }

    const challenge = await prisma.playChallenge.create({
      data: {
        creatorId: token.id as string,
        type: type as PlayChallengeType,
        title: title.trim(),
        description: typeof description === "string" ? description.trim().slice(0, 500) : null,
        difficulty: cleanDifficulty,
        content,
      },
    });

    return NextResponse.json(
      {
        challenge: {
          ...challenge,
          content: stripAnswers(challenge.type, challenge.content as any),
        },
      },
      { status: 201 }
    );
  } catch (error) {
    console.error("Error creating PLAY challenge:", error);
    return NextResponse.json({ error: "Failed to create challenge" }, { status: 500 });
  }
}
