import { describe, it, expect } from "vitest";
import { trendingScore, type MintActivitySummary } from "../discovery-ranking";

function summary(overrides: Partial<MintActivitySummary> = {}): MintActivitySummary {
  return {
    mintAddress: "mint",
    recentVolumeLamports: BigInt(0),
    recentTradeCount: 0,
    uniqueTraders: 0,
    liquidityTotalLamports: BigInt(0),
    holderCount: null,
    holderGrowth: 0,
    priceChangePercent: 0,
    latestTakenAt: null,
    ...overrides,
  };
}

describe("trendingScore", () => {
  it("is zero for a mint with no activity at all", () => {
    expect(trendingScore(summary())).toBe(0);
  });

  it("increases with more recent volume, holding everything else fixed", () => {
    const low = trendingScore(summary({ recentVolumeLamports: BigInt(1_000_000_000) }));
    const high = trendingScore(summary({ recentVolumeLamports: BigInt(100_000_000_000) }));
    expect(high).toBeGreaterThan(low);
  });

  it("increases with more unique traders, holding everything else fixed", () => {
    const low = trendingScore(summary({ uniqueTraders: 2 }));
    const high = trendingScore(summary({ uniqueTraders: 50 }));
    expect(high).toBeGreaterThan(low);
  });

  it("a token with real turnover (volume+trades+traders) outranks one with only deep liquidity and no activity", () => {
    const activeButLowLiquidity = trendingScore(
      summary({ recentVolumeLamports: BigInt(50_000_000_000), recentTradeCount: 40, uniqueTraders: 20, liquidityTotalLamports: BigInt(1_000_000_000) })
    );
    const deepLiquidityNoActivity = trendingScore(summary({ liquidityTotalLamports: BigInt(10_000_000_000_000) }));
    // 70% of the documented weight is on volume+trades+traders - a token
    // with real turnover should outrank one that only has deep, idle
    // liquidity and zero recent trading, confirming the formula can't be
    // gamed purely by liquidity.
    expect(activeButLowLiquidity).toBeGreaterThan(deepLiquidityNoActivity);
  });

  it("never goes negative even with a large negative-looking holder change (growth is clamped to >= 0 inside the formula)", () => {
    const score = trendingScore(summary({ holderGrowth: -500 }));
    expect(score).toBeGreaterThanOrEqual(0);
  });

  it("is deterministic for the same inputs", () => {
    const s = summary({ recentVolumeLamports: BigInt(5_000_000_000), recentTradeCount: 12, uniqueTraders: 6 });
    expect(trendingScore(s)).toBe(trendingScore(s));
  });
});
