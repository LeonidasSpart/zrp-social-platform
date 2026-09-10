import { describe, it, expect, afterAll, beforeAll } from "vitest";
import { randomUUID } from "crypto";
import { prisma } from "../db";
import { aiUsageDateKey, releaseAiMessage, reserveAiMessage, recordAiTokens } from "../ai-quota";

const hasRealDatabaseUrl =
  !!process.env.DATABASE_URL && !process.env.DATABASE_URL.includes("...");

// Regression coverage for the AI quota race: N concurrent requests
// against a limit of L must yield exactly L successful reservations,
// whatever the interleaving - the old read-check-then-increment-later
// flow let every in-flight request through.
describe.skipIf(!hasRealDatabaseUrl)("reserveAiMessage (integration, real Postgres)", () => {
  const runId = randomUUID().slice(0, 8);
  let userId = "";
  const date = aiUsageDateKey(new Date("2020-06-15T12:00:00"));

  beforeAll(async () => {
    const user = await prisma.user.create({
      data: {
        email: `aiquota-${runId}@sessiontest.example`,
        username: `aiq${runId}`.slice(0, 20),
        password: "$2a$10$notarealhashbutbcryptshaped000000000000000000000000000",
        role: "USER",
        emailVerified: new Date(),
      },
    });
    userId = user.id;
  });

  afterAll(async () => {
    await prisma.aIDailyUsage.deleteMany({ where: { userId } });
    await prisma.user.deleteMany({ where: { id: userId } });
  });

  it("grants exactly `limit` slots to a burst of concurrent requests, including the create-on-miss race", async () => {
    const limit = 10;
    const results = await Promise.all(
      Array.from({ length: 40 }, () => reserveAiMessage(userId, limit, date))
    );
    const granted = results.filter((r) => r.ok).length;
    expect(granted).toBe(limit);

    const row = await prisma.aIDailyUsage.findUnique({ where: { userId_date: { userId, date } } });
    expect(row?.messages).toBe(limit);

    // Nothing more today.
    expect((await reserveAiMessage(userId, limit, date)).ok).toBe(false);
  });

  it("releasing a slot (provider failure) makes it available again, and never goes negative", async () => {
    const limit = 10;
    await releaseAiMessage(userId, date);
    expect((await reserveAiMessage(userId, limit, date)).ok).toBe(true);
    expect((await reserveAiMessage(userId, limit, date)).ok).toBe(false);

    for (let i = 0; i < 15; i++) await releaseAiMessage(userId, date);
    const row = await prisma.aIDailyUsage.findUnique({ where: { userId_date: { userId, date } } });
    expect(row?.messages).toBe(0);
  });

  it("recordAiTokens only adds tokens, never a message slot", async () => {
    const before = await prisma.aIDailyUsage.findUnique({ where: { userId_date: { userId, date } } });
    await recordAiTokens(userId, 123, date);
    const after = await prisma.aIDailyUsage.findUnique({ where: { userId_date: { userId, date } } });
    expect(after?.messages).toBe(before?.messages);
    expect(after?.tokensUsed).toBe((before?.tokensUsed ?? 0) + 123);
  });

  it("a raised limit (plan upgrade) is honoured against the same row", async () => {
    const results = await Promise.all(
      Array.from({ length: 30 }, () => reserveAiMessage(userId, 25, date))
    );
    expect(results.filter((r) => r.ok).length).toBe(25);
  });
});
