export const runtime = "nodejs";
export const dynamic = "force-dynamic";

import { NextRequest, NextResponse } from "next/server";
import { getToken } from "next-auth/jwt";
import { prisma } from "@/lib/db";
import { rateLimit } from "@/lib/rate-limit";
import { createNotification } from "@/lib/notifications";
import { scoreTrivia, scoreMemory, scoreLogic } from "@/lib/play/scoring";
import {
  ensurePlayProfile,
  awardXp,
  soloXp,
  streakXp,
  computeStreak,
  DAILY_BONUS_XP,
  DUEL_WIN_XP,
  DUEL_LOSS_XP,
  DUEL_TIE_XP,
} from "@/lib/play/xp";
import { checkAndAwardAchievements } from "@/lib/play/achievements";

function startOfDay(d: Date) {
  return new Date(d.getFullYear(), d.getMonth(), d.getDate());
}

export async function POST(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const limit = await rateLimit(req, { limit: 30, window: 60, type: "play-submit" });
  if (!limit.success) return limit.response;

  const token = await getToken({ req, secret: process.env.NEXTAUTH_SECRET });
  if (!token) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }
  const userId = token.id as string;

  const { id: challengeId } = await params;

  try {
    const body = await req.json();
    const { answers, timeMs, duelId } = body;
    const safeTimeMs = Number.isFinite(Number(timeMs)) ? Math.max(0, Math.round(Number(timeMs))) : 0;

    const challenge = await prisma.playChallenge.findUnique({ where: { id: challengeId } });
    if (!challenge || challenge.status !== "ACTIVE") {
      return NextResponse.json({ error: "Challenge not found" }, { status: 404 });
    }

    // ─── Score server-side against the real (unstripped) content ────
    let scoreResult: { score: number; extra?: Record<string, unknown> };
    const content = challenge.content as any;
    if (challenge.type === "TRIVIA") {
      const r = scoreTrivia(content, answers);
      scoreResult = { score: r.score, extra: { correctCount: r.correctCount, total: r.total } };
    } else if (challenge.type === "MEMORY") {
      const r = scoreMemory(content, body);
      scoreResult = { score: r.score };
    } else {
      const r = scoreLogic(content, body);
      scoreResult = { score: r.score, extra: { isCorrect: r.isCorrect } };
    }
    const score = scoreResult.score;

    // ─── Duel path: two players share one challenge, XP is awarded ──
    // once both sides have submitted, based on the outcome rather than
    // the raw score.
    if (duelId) {
      const duel = await prisma.playDuel.findUnique({ where: { id: duelId } });
      if (!duel || duel.challengeId !== challengeId) {
        return NextResponse.json({ error: "Duel not found" }, { status: 404 });
      }
      if (duel.status !== "ACCEPTED") {
        return NextResponse.json({ error: "This duel isn't active." }, { status: 400 });
      }
      const isChallenger = duel.challengerId === userId;
      const isOpponent = duel.opponentId === userId;
      if (!isChallenger && !isOpponent) {
        return NextResponse.json({ error: "Forbidden" }, { status: 403 });
      }

      const existingAttempt = await prisma.playAttempt.findFirst({
        where: { duelId, userId },
      });
      if (existingAttempt) {
        return NextResponse.json({ error: "You've already played this duel." }, { status: 400 });
      }

      await prisma.playAttempt.create({
        data: { challengeId, userId, score, timeMs: safeTimeMs, duelId, xpEarned: 0 },
      });

      const updated = await prisma.playDuel.update({
        where: { id: duelId },
        data: isChallenger ? { challengerScore: score } : { opponentScore: score },
      });

      const bothSubmitted = updated.challengerScore !== null && updated.opponentScore !== null;
      if (!bothSubmitted) {
        return NextResponse.json({ score, maxScore: challenge.maxScore, waitingForOpponent: true });
      }

      const challengerScore = updated.challengerScore!;
      const opponentScore = updated.opponentScore!;
      const winnerId =
        challengerScore === opponentScore
          ? null
          : challengerScore > opponentScore
            ? updated.challengerId
            : updated.opponentId;

      await prisma.playDuel.update({
        where: { id: duelId },
        data: { status: "COMPLETED", completedAt: new Date(), winnerId },
      });

      for (const participantId of [updated.challengerId, updated.opponentId]) {
        const xpEarned = winnerId === null ? DUEL_TIE_XP : winnerId === participantId ? DUEL_WIN_XP : DUEL_LOSS_XP;
        await prisma.playAttempt.updateMany({
          where: { duelId, userId: participantId },
          data: { xpEarned },
        });
        await ensurePlayProfile(participantId);
        await awardXp(participantId, xpEarned);
        const profile = await prisma.playProfile.update({
          where: { userId: participantId },
          data: {
            duelsPlayed: { increment: 1 },
            duelsWon: winnerId === participantId ? { increment: 1 } : undefined,
          },
        });
        await checkAndAwardAchievements(participantId, profile);
      }

      await createNotification({
        userId: updated.challengerId,
        type: "play_duel_result",
        fromUserId: updated.opponentId,
        duelId,
      });
      await createNotification({
        userId: updated.opponentId,
        type: "play_duel_result",
        fromUserId: updated.challengerId,
        duelId,
      });

      return NextResponse.json({
        score,
        maxScore: challenge.maxScore,
        duelCompleted: true,
        winnerId,
        challengerScore,
        opponentScore,
      });
    }

    // ─── Solo path ────────────────────────────────────────────────────
    const profile = await ensurePlayProfile(userId);
    const now = new Date();

    let xpEarned = soloXp(score / challenge.maxScore, challenge.difficulty);
    let isFirstPlayToday = false;
    let newStreak = profile.currentStreak;

    // The daily/streak bonus only applies to the day's designated
    // daily challenge, and only once per day, so grinding an easy
    // challenge repeatedly can't farm it.
    if (challenge.isDaily) {
      const alreadyPlayedDailyToday = await prisma.playAttempt.findFirst({
        where: {
          userId,
          challenge: { isDaily: true },
          createdAt: { gte: startOfDay(now) },
        },
      });
      if (!alreadyPlayedDailyToday) {
        const streakResult = computeStreak(profile.currentStreak, profile.lastPlayedAt, now);
        newStreak = streakResult.streak;
        isFirstPlayToday = streakResult.isFirstPlayToday;
        xpEarned += DAILY_BONUS_XP + streakXp(newStreak);
      }
    }

    await prisma.playAttempt.create({
      data: { challengeId, userId, score, timeMs: safeTimeMs, xpEarned },
    });
    await prisma.playChallenge.update({
      where: { id: challengeId },
      data: { playCount: { increment: 1 } },
    });
    await awardXp(userId, xpEarned);

    const updatedProfile = await prisma.playProfile.update({
      where: { userId },
      data: {
        challengesCompleted: { increment: 1 },
        lastPlayedAt: now,
        ...(isFirstPlayToday
          ? {
              currentStreak: newStreak,
              longestStreak: Math.max(profile.longestStreak, newStreak),
            }
          : {}),
      },
    });

    const unlockedAchievements = await checkAndAwardAchievements(userId, updatedProfile);

    const finalProfile = await prisma.playProfile.findUnique({ where: { userId } });

    return NextResponse.json({
      score,
      maxScore: challenge.maxScore,
      xpEarned,
      totalXp: finalProfile?.totalXp ?? updatedProfile.totalXp,
      level: finalProfile?.level ?? updatedProfile.level,
      streak: newStreak,
      unlockedAchievements: unlockedAchievements.map((a) => ({
        key: a.key,
        name: a.name,
        description: a.description,
        icon: a.icon,
        xpReward: a.xpReward,
      })),
      ...scoreResult.extra,
    });
  } catch (error) {
    console.error("Error submitting PLAY attempt:", error);
    return NextResponse.json({ error: "Failed to submit attempt" }, { status: 500 });
  }
}
