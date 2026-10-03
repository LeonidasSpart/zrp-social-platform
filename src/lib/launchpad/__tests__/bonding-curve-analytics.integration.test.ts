import { describe, it, expect, afterAll } from "vitest";
import { randomUUID } from "crypto";
import { prisma } from "@/lib/db";
import { getVolumeBucketsForMint, getQuoteVolumeSince } from "../volume-index-service";
import { getMintActivitySummary } from "../discovery-ranking";

const hasRealDatabaseUrl = !!process.env.DATABASE_URL && !process.env.DATABASE_URL.includes("...");

/*
 * Real-Postgres coverage for the parts of the bonding-curve/analytics work
 * that are genuinely DB-shaped: the TokenTrade schema extension (poolId
 * now optional, source discriminates POOL_SWAP vs BONDING_CURVE), the
 * AnalyticsSnapshot unique-per-(mint, takenAt) constraint the snapshot
 * cron relies on for idempotency, and getMintActivitySummary's real
 * aggregation queries.
 */
describe.skipIf(!hasRealDatabaseUrl)("Bonding curve analytics (integration)", () => {
  const mintAddress = `TestMint${randomUUID().replace(/-/g, "").slice(0, 20)}`;
  const tradeSignatures: string[] = [];
  const snapshotIds: string[] = [];

  afterAll(async () => {
    await prisma.tokenTrade.deleteMany({ where: { txSignature: { in: tradeSignatures } } });
    await prisma.analyticsSnapshot.deleteMany({ where: { id: { in: snapshotIds } } });
  });

  it("records a BONDING_CURVE trade with no pool and includes it in the mint's total volume", async () => {
    const sig = `curve-${randomUUID()}`;
    tradeSignatures.push(sig);
    const trade = await prisma.tokenTrade.create({
      data: {
        poolId: null,
        source: "BONDING_CURVE",
        mintAddress,
        txSignature: sig,
        side: "BUY",
        baseAmountRaw: "1000000",
        quoteAmountRaw: "500000000",
        walletAddress: "wallet1",
        blockTime: new Date(),
        slot: 1,
      },
    });
    expect(trade.poolId).toBeNull();
    expect(trade.source).toBe("BONDING_CURVE");

    const buckets = await getVolumeBucketsForMint(mintAddress);
    const oneHour = buckets.find((b) => b.windowLabel === "1h")!;
    expect(BigInt(oneHour.buyQuoteRaw)).toBe(BigInt(500000000));
    expect(oneHour.tradeCount).toBe(1);
  });

  it("getQuoteVolumeSince only counts trades strictly after the given timestamp (real period deltas, no double counting)", async () => {
    const mint2 = `TestMint2${randomUUID().replace(/-/g, "").slice(0, 18)}`;
    const cutoff = new Date();
    const beforeSig = `before-${randomUUID()}`;
    const afterSig = `after-${randomUUID()}`;
    tradeSignatures.push(beforeSig, afterSig);

    await prisma.tokenTrade.create({
      data: {
        poolId: null,
        source: "BONDING_CURVE",
        mintAddress: mint2,
        txSignature: beforeSig,
        side: "BUY",
        baseAmountRaw: "1",
        quoteAmountRaw: "1000000000",
        walletAddress: "wallet1",
        blockTime: new Date(cutoff.getTime() - 60_000),
        slot: 1,
      },
    });
    await prisma.tokenTrade.create({
      data: {
        poolId: null,
        source: "BONDING_CURVE",
        mintAddress: mint2,
        txSignature: afterSig,
        side: "SELL",
        baseAmountRaw: "1",
        quoteAmountRaw: "2000000000",
        walletAddress: "wallet2",
        blockTime: new Date(cutoff.getTime() + 60_000),
        slot: 2,
      },
    });

    const delta = await getQuoteVolumeSince(mint2, cutoff);
    expect(delta.tradeCount).toBe(1); // only the "after" trade
    expect(BigInt(delta.sellQuoteRaw)).toBe(BigInt(2000000000));
    expect(BigInt(delta.buyQuoteRaw)).toBe(BigInt(0));
  });

  it("AnalyticsSnapshot enforces one row per (mintAddress, takenAt) - a duplicate cron tick never double-writes", async () => {
    const mint3 = `TestMint3${randomUUID().replace(/-/g, "").slice(0, 18)}`;
    const takenAt = new Date();
    const first = await prisma.analyticsSnapshot.create({
      data: { mintAddress: mint3, takenAt, liquidityTotalLamports: "0", buyVolumeLamports: "0", sellVolumeLamports: "0" },
    });
    snapshotIds.push(first.id);

    await expect(
      prisma.analyticsSnapshot.create({
        data: { mintAddress: mint3, takenAt, liquidityTotalLamports: "999", buyVolumeLamports: "0", sellVolumeLamports: "0" },
      })
    ).rejects.toThrow();

    // The cron's actual pattern is upsert, not create - confirm that path
    // is idempotent (same row, not a new one) rather than merely that a
    // raw duplicate create fails.
    const upserted = await prisma.analyticsSnapshot.upsert({
      where: { mintAddress_takenAt: { mintAddress: mint3, takenAt } },
      create: { mintAddress: mint3, takenAt, liquidityTotalLamports: "123", buyVolumeLamports: "0", sellVolumeLamports: "0" },
      update: {},
    });
    expect(upserted.id).toBe(first.id);
    expect(upserted.liquidityTotalLamports.toString()).toBe("0"); // update: {} means the original write wins
  });

  it("getMintActivitySummary computes real holder growth and volume from stored snapshot rows", async () => {
    const mint4 = `TestMint4${randomUUID().replace(/-/g, "").slice(0, 18)}`;
    const now = Date.now();
    const windowMs = 6 * 60 * 60 * 1000;
    // The holder-growth baseline must be at or before the window start
    // (now - windowMs) - a snapshot taken *inside* the window is not a
    // valid "before" baseline, matching getMintActivitySummary's own
    // `takenAt: { lte: since }` query.
    const baseline = await prisma.analyticsSnapshot.create({
      data: {
        mintAddress: mint4,
        takenAt: new Date(now - windowMs - 60_000), // just before the window starts
        liquidityTotalLamports: "500000000",
        holderCount: 10,
        buyVolumeLamports: "0",
        sellVolumeLamports: "0",
        tradeCount: 0,
      },
    });
    const insideWindow = await prisma.analyticsSnapshot.create({
      data: {
        mintAddress: mint4,
        takenAt: new Date(now - 5 * 60 * 60 * 1000), // 5h ago, inside the 6h window
        liquidityTotalLamports: "1000000000",
        holderCount: 18,
        buyVolumeLamports: "1000000000",
        sellVolumeLamports: "0",
        tradeCount: 3,
      },
    });
    const latest = await prisma.analyticsSnapshot.create({
      data: {
        mintAddress: mint4,
        takenAt: new Date(now - 60_000),
        liquidityTotalLamports: "2000000000",
        holderCount: 25,
        buyVolumeLamports: "500000000",
        sellVolumeLamports: "250000000",
        tradeCount: 2,
      },
    });
    snapshotIds.push(baseline.id, insideWindow.id, latest.id);

    const summary = await getMintActivitySummary(mint4, windowMs);
    expect(summary.holderGrowth).toBe(15); // 25 (latest) - 10 (baseline before the window)
    expect(summary.liquidityTotalLamports).toBe(BigInt(2000000000)); // latest, not summed
    // volume is summed across every snapshot *inside* the window (the
    // baseline, taken before the window, is excluded) - real period-delta
    // semantics, never a cumulative running total.
    expect(summary.recentVolumeLamports).toBe(BigInt(1000000000 + 500000000 + 250000000));
    expect(summary.recentTradeCount).toBe(5);
  });
});
