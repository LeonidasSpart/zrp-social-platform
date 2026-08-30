export const runtime = "nodejs";
export const dynamic = "force-dynamic";

import { NextRequest, NextResponse } from "next/server";
import { getToken } from "next-auth/jwt";
import { prisma } from "@/lib/db";
import { stripAnswers } from "@/lib/play/scoring";
import { xpProgress } from "@/lib/play/xp";

const CREATOR_SELECT = {
  id: true,
  username: true,
  name: true,
  avatarUrl: true,
  badgeType: true,
} as const;

// ─── GET: everything the PLAY home page needs in one round trip ─────
export async function GET(req: NextRequest) {
  try {
    const token = await getToken({ req, secret: process.env.NEXTAUTH_SECRET });
    const userId = token?.id as string | undefined;

    const [dailyChallenge, trending, topLeaderboard] = await Promise.all([
      prisma.playChallenge.findFirst({
        where: { isDaily: true, status: "ACTIVE" },
        orderBy: { activeDate: "desc" },
        select: {
          id: true,
          type: true,
          title: true,
          description: true,
          difficulty: true,
          content: true,
          maxScore: true,
          playCount: true,
          creator: { select: CREATOR_SELECT },
        },
      }),
      prisma.playChallenge.findMany({
        where: { status: "ACTIVE", isDaily: false },
        orderBy: { playCount: "desc" },
        take: 6,
        select: {
          id: true,
          type: true,
          title: true,
          description: true,
          difficulty: true,
          maxScore: true,
          playCount: true,
          creator: { select: CREATOR_SELECT },
        },
      }),
      prisma.playProfile.findMany({
        orderBy: { totalXp: "desc" },
        take: 5,
        select: {
          userId: true,
          totalXp: true,
          level: true,
          user: { select: CREATOR_SELECT },
        },
      }),
    ]);

    let myProfile = null;
    let pendingDuels: unknown[] = [];
    let activeDuels: unknown[] = [];
    let hasPlayedDailyToday = false;

    if (userId) {
      const [profile, incoming, active, dailyAttempt] = await Promise.all([
        prisma.playProfile.findUnique({ where: { userId } }),
        prisma.playDuel.findMany({
          where: { opponentId: userId, status: "PENDING" },
          orderBy: { createdAt: "desc" },
          take: 10,
          include: {
            challenge: { select: { id: true, type: true, title: true, difficulty: true } },
            challenger: { select: CREATOR_SELECT },
          },
        }),
        prisma.playDuel.findMany({
          where: {
            OR: [{ challengerId: userId }, { opponentId: userId }],
            status: "ACCEPTED",
          },
          orderBy: { createdAt: "desc" },
          take: 10,
          include: {
            challenge: { select: { id: true, type: true, title: true, difficulty: true } },
            challenger: { select: CREATOR_SELECT },
            opponent: { select: CREATOR_SELECT },
          },
        }),
        dailyChallenge
          ? prisma.playAttempt.findFirst({
              where: { userId, challengeId: dailyChallenge.id, duelId: null },
            })
          : null,
      ]);

      pendingDuels = incoming;
      activeDuels = active;
      hasPlayedDailyToday = !!dailyAttempt;

      const totalXp = profile?.totalXp ?? 0;
      myProfile = profile
        ? {
            ...profile,
            ...xpProgress(totalXp),
          }
        : null;
    }

    return NextResponse.json({
      dailyChallenge: dailyChallenge
        ? {
            ...dailyChallenge,
            content: stripAnswers(dailyChallenge.type, dailyChallenge.content as any),
            alreadyPlayed: hasPlayedDailyToday,
          }
        : null,
      trending,
      topLeaderboard: topLeaderboard.map((p, i) => ({ rank: i + 1, ...p })),
      myProfile,
      pendingDuels,
      activeDuels,
    });
  } catch (error) {
    console.error("Error fetching PLAY home:", error);
    return NextResponse.json({ error: "Failed to fetch PLAY home" }, { status: 500 });
  }
}
