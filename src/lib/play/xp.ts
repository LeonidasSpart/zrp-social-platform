import { prisma } from "@/lib/db";

// ─── Level formula ─────────────────────────────────────────────────
// Triangular XP curve: reaching level n costs 50*n*(n-1) total XP, so
// each level takes progressively more XP than the last (100, 200,
// 300, ... more per level). Kept as a pure function so the client can
// render the same progress bar the server computed without a round
// trip.
export function xpThresholdForLevel(level: number): number {
  return 50 * level * (level - 1);
}

export function levelFromXp(xp: number): number {
  const safeXp = Math.max(0, xp);
  return Math.max(1, Math.floor((1 + Math.sqrt(1 + 0.08 * safeXp)) / 2));
}

export function xpProgress(xp: number) {
  const level = levelFromXp(xp);
  const currentThreshold = xpThresholdForLevel(level);
  const nextThreshold = xpThresholdForLevel(level + 1);
  const xpIntoLevel = xp - currentThreshold;
  const xpForLevel = nextThreshold - currentThreshold;
  return {
    level,
    xpIntoLevel,
    xpForLevel,
    xpToNextLevel: nextThreshold - xp,
    progressRatio: xpForLevel > 0 ? xpIntoLevel / xpForLevel : 0,
  };
}

// ─── XP economy ─────────────────────────────────────────────────────
export const SOLO_BASE_XP = 10;
export const DIFFICULTY_MULTIPLIER: Record<string, number> = {
  easy: 1,
  medium: 1.5,
  hard: 2,
};
export const DAILY_BONUS_XP = 15;
export const STREAK_XP_PER_DAY = 2;
export const STREAK_XP_CAP_DAYS = 10;
export const DUEL_WIN_XP = 30;
export const DUEL_LOSS_XP = 10;
export const DUEL_TIE_XP = 20;

export function soloXp(scoreRatio: number, difficulty: string): number {
  const multiplier = DIFFICULTY_MULTIPLIER[difficulty] ?? DIFFICULTY_MULTIPLIER.medium;
  const clampedRatio = Math.max(0.2, Math.min(1, scoreRatio));
  return Math.round(SOLO_BASE_XP * multiplier * clampedRatio);
}

export function streakXp(streakDays: number): number {
  return Math.min(streakDays, STREAK_XP_CAP_DAYS) * STREAK_XP_PER_DAY;
}

// ─── Streak bookkeeping ─────────────────────────────────────────────
// Given the user's current streak, when they last played, and "now",
// returns the streak value that should be recorded for this play and
// whether it's the first play of a new calendar day (streak/daily
// bonuses only ever apply once per day).
export function computeStreak(
  currentStreak: number,
  lastPlayedAt: Date | null,
  now: Date
): { streak: number; isFirstPlayToday: boolean } {
  const startOfDay = (d: Date) => new Date(d.getFullYear(), d.getMonth(), d.getDate());
  const today = startOfDay(now);

  if (!lastPlayedAt) return { streak: 1, isFirstPlayToday: true };

  const lastDay = startOfDay(lastPlayedAt);
  const daysSinceLastPlay = Math.round((today.getTime() - lastDay.getTime()) / 86_400_000);

  if (daysSinceLastPlay === 0) return { streak: currentStreak, isFirstPlayToday: false };
  if (daysSinceLastPlay === 1) return { streak: currentStreak + 1, isFirstPlayToday: true };
  return { streak: 1, isFirstPlayToday: true }; // gap of 2+ days: streak resets
}

// ─── Award XP + keep PlayProfile in sync ───────────────────────────
// Central place every XP-earning action (solo completion, daily
// bonus, streak bonus, duel outcome, achievement reward) goes through,
// so totalXp/level never drift out of sync across call sites.
export async function ensurePlayProfile(userId: string) {
  return prisma.playProfile.upsert({
    where: { userId },
    update: {},
    create: { userId },
  });
}

export async function awardXp(userId: string, amount: number) {
  if (amount <= 0) return;
  const profile = await ensurePlayProfile(userId);
  const newTotal = profile.totalXp + amount;
  await prisma.playProfile.update({
    where: { userId },
    data: { totalXp: newTotal, level: levelFromXp(newTotal) },
  });
}
