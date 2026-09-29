import { describe, it, expect } from "vitest";
import { ageDecayedScore, relevanceScore } from "../ranking";

describe("ageDecayedScore", () => {
  it("scores a fresh item with the same counter higher than an old one", () => {
    const now = new Date();
    const old = new Date(now.getTime() - 60 * 24 * 60 * 60 * 1000); // 60 days old
    expect(ageDecayedScore(100, now)).toBeGreaterThan(ageDecayedScore(100, old));
  });

  it("halves the score at exactly one windowDays old", () => {
    const now = Date.now();
    const halfLifeAgo = new Date(now - 30 * 24 * 60 * 60 * 1000);
    const fresh = ageDecayedScore(100, new Date(now), 30);
    const decayed = ageDecayedScore(100, halfLifeAgo, 30);
    expect(decayed).toBeCloseTo(fresh / 2, 0);
  });

  it("never divides by zero or returns Infinity for a brand-new item", () => {
    const score = ageDecayedScore(50, new Date());
    expect(Number.isFinite(score)).toBe(true);
  });
});

describe("relevanceScore", () => {
  it("always ranks a better text match above a more popular worse match", () => {
    const betterMatchLowPopularity = relevanceScore(75, 0);
    const worseMatchHighPopularity = relevanceScore(50, 999_999);
    expect(betterMatchLowPopularity).toBeGreaterThan(worseMatchHighPopularity);
  });

  it("uses the popularity counter only to break ties within the same match tier", () => {
    const morePopular = relevanceScore(50, 100);
    const lessPopular = relevanceScore(50, 10);
    expect(morePopular).toBeGreaterThan(lessPopular);
  });

  it("never lets the counter go negative or overflow the tier boundary", () => {
    const score = relevanceScore(50, -5);
    expect(score).toBeGreaterThanOrEqual(50 * 1_000_000);
  });
});
