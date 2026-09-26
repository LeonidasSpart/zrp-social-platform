import { describe, it, expect, afterAll } from "vitest";
import { randomUUID } from "crypto";
import { prisma } from "@/lib/db";
import { ensurePlayProfile } from "../xp";

const hasRealDatabaseUrl = !!process.env.DATABASE_URL && !process.env.DATABASE_URL.includes("...");

/*
 * ensurePlayProfile() runs at the top of every PLAY submission (solo,
 * duel, achievements) before anything else - a brand-new player's very
 * first submission can genuinely race several requests onto it at once
 * (confirmed against real Postgres: a plain upsert's create branch can
 * still lose to the unique constraint under concurrency, the same
 * non-atomicity documented for ConsumedPaymentTransaction/AIDailyUsage
 * elsewhere in this codebase). A 500 here previously took down the
 * whole submission, not just a slower duplicate request.
 */
describe.skipIf(!hasRealDatabaseUrl)("ensurePlayProfile (integration, real Postgres)", () => {
  const userIds: string[] = [];

  afterAll(async () => {
    await prisma.playProfile.deleteMany({ where: { userId: { in: userIds } } });
    await prisma.user.deleteMany({ where: { id: { in: userIds } } });
  });

  async function createUser(label: string) {
    const user = await prisma.user.create({
      data: {
        email: `${label}-${randomUUID().slice(0, 8)}@ensureprofile.example`,
        username: `${label}${randomUUID().slice(0, 8)}`.slice(0, 20),
        password: "x",
      },
    });
    userIds.push(user.id);
    return user;
  }

  it("never 500s when a brand-new user's profile is raced by concurrent calls", async () => {
    const user = await createUser("racer");

    const results = await Promise.allSettled(
      Array.from({ length: 10 }, () => ensurePlayProfile(user.id))
    );

    expect(results.every((r) => r.status === "fulfilled")).toBe(true);
    for (const r of results) {
      if (r.status === "fulfilled") expect(r.value.userId).toBe(user.id);
    }

    const rows = await prisma.playProfile.findMany({ where: { userId: user.id } });
    expect(rows).toHaveLength(1);
  });

  it("is a no-op that returns the existing row once a profile already exists", async () => {
    const user = await createUser("existing");
    const first = await ensurePlayProfile(user.id);
    const second = await ensurePlayProfile(user.id);
    expect(second.userId).toBe(first.userId);
    const rows = await prisma.playProfile.findMany({ where: { userId: user.id } });
    expect(rows).toHaveLength(1);
  });
});
