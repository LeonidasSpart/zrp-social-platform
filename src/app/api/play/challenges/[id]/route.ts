export const runtime = "nodejs";
export const dynamic = "force-dynamic";

import { NextRequest, NextResponse } from "next/server";
import { getToken } from "next-auth/jwt";
import { prisma } from "@/lib/db";
import { stripAnswers } from "@/lib/play/scoring";

const CREATOR_SELECT = {
  id: true,
  username: true,
  name: true,
  avatarUrl: true,
  badgeType: true,
} as const;

// ─── GET: fetch a challenge to play - answers stripped server-side ──
export async function GET(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;

  try {
    const challenge = await prisma.playChallenge.findUnique({
      where: { id },
      select: {
        id: true,
        type: true,
        title: true,
        description: true,
        difficulty: true,
        content: true,
        maxScore: true,
        isDaily: true,
        isAiGenerated: true,
        status: true,
        playCount: true,
        createdAt: true,
        creator: { select: CREATOR_SELECT },
      },
    });

    if (!challenge || challenge.status !== "ACTIVE") {
      return NextResponse.json({ error: "Challenge not found" }, { status: 404 });
    }

    return NextResponse.json({
      challenge: {
        ...challenge,
        content: stripAnswers(challenge.type, challenge.content as any),
      },
    });
  } catch (error) {
    console.error("Error fetching PLAY challenge:", error);
    return NextResponse.json({ error: "Failed to fetch challenge" }, { status: 500 });
  }
}

// ─── DELETE: creator removes their own challenge (soft delete) ──────
export async function DELETE(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const token = await getToken({ req, secret: process.env.NEXTAUTH_SECRET });
  if (!token) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const { id } = await params;

  try {
    const challenge = await prisma.playChallenge.findUnique({
      where: { id },
      select: { creatorId: true },
    });
    if (!challenge) {
      return NextResponse.json({ error: "Challenge not found" }, { status: 404 });
    }

    const isOwner = challenge.creatorId === token.id;
    const isStaff = token.role === "ADMIN" || token.role === "MODERATOR";
    if (!isOwner && !isStaff) {
      return NextResponse.json({ error: "Forbidden" }, { status: 403 });
    }

    await prisma.playChallenge.update({
      where: { id },
      data: { status: "REMOVED" },
    });

    return NextResponse.json({ success: true });
  } catch (error) {
    console.error("Error removing PLAY challenge:", error);
    return NextResponse.json({ error: "Failed to remove challenge" }, { status: 500 });
  }
}
