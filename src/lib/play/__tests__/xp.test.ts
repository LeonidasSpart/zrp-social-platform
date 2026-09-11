import { describe, it, expect } from "vitest";
import {
  xpThresholdForLevel,
  levelFromXp,
  xpProgress,
  soloXp,
  streakXp,
  computeStreak,
  DIFFICULTY_MULTIPLIER,
  STREAK_XP_CAP_DAYS,
} from "../xp";

describe("level formula", () => {
  it("level 1 starts at 0 XP", () => {
    expect(xpThresholdForLevel(1)).toBe(0);
    expect(levelFromXp(0)).toBe(1);
  });

  it("is monotonically increasing - more XP never means a lower level", () => {
    let lastLevel = 1;
    for (let xp = 0; xp <= 20000; xp += 137) {
      const level = levelFromXp(xp);
      expect(level).toBeGreaterThanOrEqual(lastLevel);
      lastLevel = level;
    }
  });

  it("never returns a level below 1, even for negative XP", () => {
    expect(levelFromXp(-500)).toBe(1);
  });

  it("levelFromXp and xpThresholdForLevel are consistent inverses at each threshold", () => {
    for (let level = 1; level <= 30; level++) {
      const threshold = xpThresholdForLevel(level);
      expect(levelFromXp(threshold)).toBe(level);
      // One XP short of the threshold must still be the previous level.
      if (threshold > 0) {
        expect(levelFromXp(threshold - 1)).toBeLessThan(level);
      }
    }
  });

  it("xpProgress reports a full picture the client can render without a round trip", () => {
    const progress = xpProgress(175); // level 2 threshold is 100, level 3 is 300
    expect(progress.level).toBe(2);
    expect(progress.xpIntoLevel).toBe(75);
    expect(progress.xpForLevel).toBe(200);
    expect(progress.xpToNextLevel).toBe(125);
    expect(progress.progressRatio).toBeCloseTo(0.375);
  });
});

describe("soloXp", () => {
  it("scales with difficulty multiplier", () => {
    expect(soloXp(1, "easy")).toBe(10 * DIFFICULTY_MULTIPLIER.easy);
    expect(soloXp(1, "medium")).toBe(10 * DIFFICULTY_MULTIPLIER.medium);
    expect(soloXp(1, "hard")).toBe(10 * DIFFICULTY_MULTIPLIER.hard);
  });

  it("falls back to the medium multiplier for an unknown difficulty", () => {
    expect(soloXp(1, "nonsense")).toBe(soloXp(1, "medium"));
  });

  it("clamps the score ratio to a 0.2 floor - a soloist always gets some credit", () => {
    expect(soloXp(0, "medium")).toBe(soloXp(0.2, "medium"));
    expect(soloXp(-5, "medium")).toBe(soloXp(0.2, "medium"));
  });

  it("clamps the score ratio to a ceiling of 1 - a spoofed >100% score can't inflate XP", () => {
    expect(soloXp(50, "hard")).toBe(soloXp(1, "hard"));
  });
});

describe("streakXp", () => {
  it("is capped at STREAK_XP_CAP_DAYS worth of bonus", () => {
    expect(streakXp(STREAK_XP_CAP_DAYS + 50)).toBe(streakXp(STREAK_XP_CAP_DAYS));
  });
  it("grows with streak length up to the cap", () => {
    expect(streakXp(5)).toBeGreaterThan(streakXp(1));
  });
});

describe("computeStreak", () => {
  const day = (offsetDays: number) => new Date(Date.UTC(2026, 0, 10 + offsetDays, 12, 0, 0));

  it("starts a new streak of 1 on the very first play", () => {
    const result = computeStreak(0, null, day(0));
    expect(result).toEqual({ streak: 1, isFirstPlayToday: true });
  });

  it("does not advance the streak for a second play on the same day", () => {
    const result = computeStreak(3, day(0), day(0));
    expect(result).toEqual({ streak: 3, isFirstPlayToday: false });
  });

  it("advances the streak by one for a play exactly one day later", () => {
    const result = computeStreak(3, day(0), day(1));
    expect(result).toEqual({ streak: 4, isFirstPlayToday: true });
  });

  it("resets to 1 after a gap of two or more days", () => {
    const result = computeStreak(10, day(0), day(3));
    expect(result).toEqual({ streak: 1, isFirstPlayToday: true });
  });
});
