import { describe, it, expect, beforeAll, afterAll, beforeEach } from "vitest";
import { randomUUID } from "crypto";
import { prisma } from "@/lib/db";
import { recordSourceFailure, recordSourceSuccess } from "../ingest";

const hasRealDatabaseUrl =
  !!process.env.DATABASE_URL && !process.env.DATABASE_URL.includes("...");

const db = prisma;
const NOW = new Date("2026-02-03T12:00:00Z");

/*
 * Retiring a source that cannot come back.
 *
 * Found in production: swissinfo-eng had returned HTTP 404 seven times
 * in a row and was still enabled as one of Switzerland's sources, and
 * cbc-top-stories was still being polled seven failures after the
 * publisher disallowed it in robots.txt. A dead source that stays
 * switched on makes a category look covered when it is not.
 */
describe.skipIf(!hasRealDatabaseUrl)("retiring dead sources (integration, real Postgres)", () => {
  const suffix = randomUUID().slice(0, 8);
  const keys: string[] = [];

  async function source(key: string, consecutiveFailures = 0) {
    const created = await db.newsSource.create({
      data: {
        key,
        name: key,
        publisher: key,
        feedUrl: `https://outlet.example/${key}/feed.xml`,
        region: "GLOBAL",
        language: "en",
        trustTier: 2,
        enabled: true,
        consecutiveFailures,
      },
      select: { id: true, consecutiveFailures: true },
    });
    keys.push(key);
    return created;
  }

  function read(key: string) {
    return db.newsSource.findUniqueOrThrow({
      where: { key },
      select: { enabled: true, status: true, consecutiveFailures: true, lastError: true },
    });
  }

  beforeAll(async () => {
    await db.newsSource.deleteMany({ where: { key: { startsWith: `dead-${suffix}` } } });
  });

  afterAll(async () => {
    if (!hasRealDatabaseUrl) return;
    await db.newsSource.deleteMany({ where: { key: { in: keys } } });
  });

  beforeEach(async () => {
    await db.newsSource.deleteMany({ where: { key: { in: keys } } });
  });

  it("retires a feed that no longer exists, on the first 404", async () => {
    const key = `dead-${suffix}-404`;
    const created = await source(key);

    await recordSourceFailure(db, created, "HTTP 404", NOW);

    const after = await read(key);
    expect(after.enabled).toBe(false);
    expect(after.status).toBe("DISABLED");
    // The reason survives, so the dashboard can still say why and an
    // admin can re-enable it after fixing the URL.
    expect(after.lastError).toContain("404");
  });

  it("retires a feed the publisher has disallowed", async () => {
    const key = `dead-${suffix}-robots`;
    const created = await source(key);

    await recordSourceFailure(db, created, "Disallowed by robots.txt", NOW);

    const after = await read(key);
    expect(after.enabled).toBe(false);
    expect(after.status).toBe("DISABLED");
  });

  it("keeps retrying a source that is merely having a bad moment", async () => {
    const key = `dead-${suffix}-500`;
    const created = await source(key);

    // A 5xx, a timeout or a reset is not a reason to give up on a
    // publisher - that is what the backoff is for.
    await recordSourceFailure(db, created, "HTTP 503", NOW);

    const after = await read(key);
    expect(after.enabled).toBe(true);
    expect(after.status).toBe("WARNING");
    expect(after.consecutiveFailures).toBe(1);
  });

  it("does not retire a source that fails repeatedly but recoverably", async () => {
    const key = `dead-${suffix}-timeouts`;
    let created = await source(key);

    for (let attempt = 0; attempt < 6; attempt += 1) {
      await recordSourceFailure(db, created, "Fetch failed", NOW);
      created = { id: created.id, consecutiveFailures: created.consecutiveFailures + 1 };
    }

    const after = await read(key);
    expect(after.enabled).toBe(true);
    expect(after.status).toBe("FAILED");
  });

  it("brings a recovered source back to healthy", async () => {
    const key = `dead-${suffix}-recovers`;
    const created = await source(key, 4);

    await recordSourceSuccess(db, created.id, {
      etag: null, lastModified: null, itemsIngested: 12, now: NOW,
    });

    const after = await read(key);
    expect(after.enabled).toBe(true);
    expect(after.status).toBe("HEALTHY");
    expect(after.consecutiveFailures).toBe(0);
    expect(after.lastError).toBeNull();
  });
});
