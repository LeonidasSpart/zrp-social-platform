export const runtime = "nodejs";
export const dynamic = "force-dynamic";

import { NextRequest, NextResponse } from "next/server";
import { getToken } from "next-auth/jwt";
import { prisma } from "@/lib/db";
import { rateLimit } from "@/lib/rate-limit";
import { generateChallengeContent } from "@/lib/play/ai-generate";
import type { PlayChallengeType } from "@prisma/client";

const TYPES = ["TRIVIA", "MEMORY", "LOGIC"] as const;
const DAILY_AI_LIMIT = 10;

function todayDateOnly() {
  const now = new Date();
  return new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), now.getUTCDate()));
}

// ─── POST: generate challenge content from a topic using ZRP AI ─────
// Reuses the existing AIDailyUsage table (shared quota bucket with ZRP
// AI chat) so a user can't bypass their daily AI allowance just by
// switching features.
export async function POST(req: NextRequest) {
  const limit = await rateLimit(req, { limit: 10, window: 3600, type: "play-ai-generate" });
  if (!limit.success) return limit.response;

  const token = await getToken({ req, secret: process.env.NEXTAUTH_SECRET });
  if (!token) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }
  const userId = token.id as string;

  try {
    const body = await req.json();
    const { topic, type, difficulty } = body;

    if (!topic || typeof topic !== "string" || !topic.trim() || topic.trim().length > 200) {
      return NextResponse.json({ error: "A topic is required (max 200 characters)." }, { status: 400 });
    }
    if (!type || !(TYPES as readonly string[]).includes(type)) {
      return NextResponse.json({ error: "A valid challenge type is required." }, { status: 400 });
    }
    const cleanDifficulty = ["easy", "medium", "hard"].includes(difficulty) ? difficulty : "medium";

    const date = todayDateOnly();
    const usage = await prisma.aIDailyUsage.upsert({
      where: { userId_date: { userId, date } },
      update: {},
      create: { userId, date, messages: 0 },
    });
    if (usage.messages >= DAILY_AI_LIMIT) {
      return NextResponse.json(
        { error: `You've reached today's AI generation limit (${DAILY_AI_LIMIT}). Try again tomorrow.` },
        { status: 429 }
      );
    }

    const generated = await generateChallengeContent(topic.trim(), type as PlayChallengeType, cleanDifficulty);

    await prisma.aIDailyUsage.update({
      where: { userId_date: { userId, date } },
      data: { messages: { increment: 1 } },
    });

    return NextResponse.json({
      title: generated.title,
      description: generated.description,
      content: generated.content,
      type,
      difficulty: cleanDifficulty,
    });
  } catch (error) {
    console.error("Error generating PLAY challenge:", error);
    const message = error instanceof Error ? error.message : "Failed to generate challenge";
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
