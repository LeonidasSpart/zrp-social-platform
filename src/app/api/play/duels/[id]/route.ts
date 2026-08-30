export const runtime = "nodejs";
export const dynamic = "force-dynamic";

import { NextRequest, NextResponse } from "next/server";
import { getToken } from "next-auth/jwt";
import { prisma } from "@/lib/db";
import { createNotification } from "@/lib/notifications";
import { stripAnswers } from "@/lib/play/scoring";

const PARTICIPANT_SELECT = {
  id: true,
  username: true,
  name: true,
  avatarUrl: true,
  badgeType: true,
} as const;

// ─── GET: fetch a single duel (challenge content answer-stripped) ───
export async function GET(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const token = await getToken({ req, secret: process.env.NEXTAUTH_SECRET });
  if (!token) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }
  const userId = token.id as string;
  const { id } = await params;

  try {
    const duel = await prisma.playDuel.findUnique({
      where: { id },
      include: {
        challenge: true,
        challenger: { select: PARTICIPANT_SELECT },
        opponent: { select: PARTICIPANT_SELECT },
      },
    });
    if (!duel) {
      return NextResponse.json({ error: "Duel not found" }, { status: 404 });
    }
    if (duel.challengerId !== userId && duel.opponentId !== userId) {
      return NextResponse.json({ error: "Forbidden" }, { status: 403 });
    }

    return NextResponse.json({
      duel: {
        ...duel,
        challenge: {
          ...duel.challenge,
          content: stripAnswers(duel.challenge.type, duel.challenge.content as any),
        },
      },
    });
  } catch (error) {
    console.error("Error fetching PLAY duel:", error);
    return NextResponse.json({ error: "Failed to fetch duel" }, { status: 500 });
  }
}

// ─── PUT: opponent accepts or declines an incoming duel invite ──────
export async function PUT(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const token = await getToken({ req, secret: process.env.NEXTAUTH_SECRET });
  if (!token) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }
  const userId = token.id as string;
  const { id } = await params;

  try {
    const body = await req.json();
    const { action } = body;
    if (action !== "accept" && action !== "decline") {
      return NextResponse.json({ error: "action must be 'accept' or 'decline'." }, { status: 400 });
    }

    const duel = await prisma.playDuel.findUnique({ where: { id } });
    if (!duel) {
      return NextResponse.json({ error: "Duel not found" }, { status: 404 });
    }
    if (duel.opponentId !== userId) {
      return NextResponse.json({ error: "Only the challenged user can respond to this duel." }, { status: 403 });
    }
    if (duel.status !== "PENDING") {
      return NextResponse.json({ error: "This duel invite has already been responded to." }, { status: 400 });
    }
    if (duel.expiresAt < new Date()) {
      await prisma.playDuel.update({ where: { id }, data: { status: "EXPIRED" } });
      return NextResponse.json({ error: "This duel invite has expired." }, { status: 400 });
    }

    const updated = await prisma.playDuel.update({
      where: { id },
      data: {
        status: action === "accept" ? "ACCEPTED" : "DECLINED",
        respondedAt: new Date(),
      },
    });

    if (action === "accept") {
      await createNotification({
        userId: duel.challengerId,
        type: "play_duel_accepted",
        fromUserId: userId,
        duelId: id,
      });
    }

    return NextResponse.json({ duel: updated });
  } catch (error) {
    console.error("Error responding to PLAY duel:", error);
    return NextResponse.json({ error: "Failed to update duel" }, { status: 500 });
  }
}
