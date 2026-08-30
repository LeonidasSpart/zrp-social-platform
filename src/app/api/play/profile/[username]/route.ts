export const runtime = "nodejs";
export const dynamic = "force-dynamic";

import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/db";
import { xpProgress } from "@/lib/play/xp";
import { PLAY_ACHIEVEMENTS } from "@/lib/play/achievements";

// ─── GET: a player's public ZRP PLAY profile ─────────────────────────
export async function GET(req: NextRequest, { params }: { params: Promise<{ username: string }> }) {
  const { username } = await params;

  try {
    const user = await prisma.user.findUnique({
      where: { username },
      select: {
        id: true,
        username: true,
        name: true,
        avatarUrl: true,
        badgeType: true,
        country: true,
      },
    });
    if (!user) {
      return NextResponse.json({ error: "User not found" }, { status: 404 });
    }

    const [profile, unlockedAchievements, recentAttempts] = await Promise.all([
      prisma.playProfile.findUnique({ where: { userId: user.id } }),
      prisma.playUserAchievement.findMany({
        where: { userId: user.id },
        orderBy: { unlockedAt: "desc" },
      }),
      prisma.playAttempt.findMany({
        where: { userId: user.id, duelId: null },
        orderBy: { createdAt: "desc" },
        take: 10,
        select: {
          id: true,
          score: true,
          xpEarned: true,
          createdAt: true,
          challenge: { select: { id: true, type: true, title: true, difficulty: true } },
        },
      }),
    ]);

    const totalXp = profile?.totalXp ?? 0;
    const achievementDefs = unlockedAchievements
      .map((ua) => {
        const def = PLAY_ACHIEVEMENTS.find((a) => a.key === ua.achievementKey);
        return def ? { ...def, isUnlocked: undefined, unlockedAt: ua.unlockedAt } : null;
      })
      .filter(Boolean);

    return NextResponse.json({
      user,
      profile: {
        totalXp,
        currentStreak: profile?.currentStreak ?? 0,
        longestStreak: profile?.longestStreak ?? 0,
        challengesCompleted: profile?.challengesCompleted ?? 0,
        duelsWon: profile?.duelsWon ?? 0,
        duelsPlayed: profile?.duelsPlayed ?? 0,
        ...xpProgress(totalXp),
      },
      achievements: achievementDefs,
      recentAttempts,
    });
  } catch (error) {
    console.error("Error fetching PLAY profile:", error);
    return NextResponse.json({ error: "Failed to fetch profile" }, { status: 500 });
  }
}
