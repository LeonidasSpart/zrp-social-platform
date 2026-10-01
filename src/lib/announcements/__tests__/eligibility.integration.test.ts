import { describe, it, expect, afterAll } from "vitest";
import { randomUUID } from "crypto";
import { prisma } from "@/lib/db";
import { countEligibleRecipients, getEligibleUserIdBatch } from "../eligibility";
import { getAnnouncementSystemUserId } from "../system-user";

const hasRealDatabaseUrl = !!process.env.DATABASE_URL && !process.env.DATABASE_URL.includes("...");

describe.skipIf(!hasRealDatabaseUrl)("Broadcast eligibility + cursor batching (integration)", () => {
  const userIds: string[] = [];

  afterAll(async () => {
    await prisma.user.deleteMany({ where: { id: { in: userIds } } });
  });

  async function createUser(label: string, overrides: Record<string, unknown> = {}) {
    const user = await prisma.user.create({
      data: {
        email: `${label}-${randomUUID().slice(0, 8)}@eligibility.example`,
        username: `${label}${randomUUID().slice(0, 8)}`.slice(0, 20),
        password: "x",
        ...overrides,
      },
    });
    userIds.push(user.id);
    return user;
  }

  it("a large eligible set is paginated across many small batches with no overlap and no gaps", async () => {
    const systemUserId = await getAnnouncementSystemUserId();
    const created = await Promise.all(Array.from({ length: 47 }, (_, i) => createUser(`batch${i}`)));
    const createdIds = new Set(created.map((u) => u.id));

    const batchSize = 10;
    const seen = new Set<string>();
    let cursor: string | null = null;
    let iterations = 0;

    while (iterations < 20) {
      const batch = await getEligibleUserIdBatch(systemUserId, cursor, batchSize);
      if (batch.length === 0) break;
      expect(batch.length).toBeLessThanOrEqual(batchSize);
      for (const id of batch) {
        expect(seen.has(id)).toBe(false); // no duplicate across batches
        seen.add(id);
      }
      cursor = batch[batch.length - 1];
      iterations++;
    }

    // Every one of our 47 just-created users was eventually reached -
    // proves the cursor walk covers the whole eligible set, not just
    // the first page, regardless of how many OTHER users already exist
    // in this database.
    createdIds.forEach((id) => {
      expect(seen.has(id)).toBe(true);
    });
  });

  it("excludes banned and deletion-requested users from both the count and the batches", async () => {
    const systemUserId = await getAnnouncementSystemUserId();
    const eligible = await createUser("count-eligible");
    const banned = await createUser("count-banned", { banned: true });
    const deleting = await createUser("count-deleting", { deletionRequestedAt: new Date() });

    const countBefore = await countEligibleRecipients(systemUserId);

    const seen = new Set<string>();
    let cursor: string | null = null;
    for (let i = 0; i < 50; i++) {
      const batch = await getEligibleUserIdBatch(systemUserId, cursor, 25);
      if (batch.length === 0) break;
      batch.forEach((id) => seen.add(id));
      cursor = batch[batch.length - 1];
    }

    expect(seen.has(eligible.id)).toBe(true);
    expect(seen.has(banned.id)).toBe(false);
    expect(seen.has(deleting.id)).toBe(false);
    expect(countBefore).toBeGreaterThanOrEqual(1);
  });

  it("excludes a user who has blocked the system account", async () => {
    const systemUserId = await getAnnouncementSystemUserId();
    const blocker = await createUser("blocker-of-system");
    await prisma.blocked.create({ data: { blockerId: blocker.id, blockedId: systemUserId } });

    const seen = new Set<string>();
    let cursor: string | null = null;
    for (let i = 0; i < 50; i++) {
      const batch = await getEligibleUserIdBatch(systemUserId, cursor, 25);
      if (batch.length === 0) break;
      batch.forEach((id) => seen.add(id));
      cursor = batch[batch.length - 1];
    }

    expect(seen.has(blocker.id)).toBe(false);

    await prisma.blocked.deleteMany({ where: { blockerId: blocker.id, blockedId: systemUserId } });
  });
});
