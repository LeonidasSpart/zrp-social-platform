import { describe, it, expect, beforeAll, afterAll, beforeEach, vi } from "vitest";
import { NextRequest } from "next/server";
import { randomUUID } from "crypto";

const { requireAdmin, logAdminAction } = vi.hoisted(() => ({
  requireAdmin: vi.fn(),
  logAdminAction: vi.fn(),
}));

vi.mock("@/lib/admin", () => ({ requireAdmin }));
vi.mock("@/lib/audit-log", () => ({ logAdminAction }));

// Real safeFetch, with the address allower supplied by the TEST so it can
// reach a local origin server. The shipped route has no such escape
// hatch - see the note in src/lib/news/__tests__/ingest.http.integration.test.ts.
vi.mock("@/lib/ssrf-guard", async (importOriginal) => {
  const actual = await importOriginal<typeof import("@/lib/ssrf-guard")>();
  return {
    ...actual,
    safeFetch: (url: string, options: Record<string, unknown> = {}) =>
      actual.safeFetch(url, { ...options, isAddressAllowed: () => true }),
  };
});

import { prisma } from "@/lib/db";
import { POST as verifyRoute } from "../[id]/verify/route";
import { startOriginServer, type OriginServer } from "@/lib/news/__tests__/origin-server";

/*
 * The admin "verify source" action is the mechanism the pilot depends on
 * to confirm a publisher's feed URL is correct and reachable from inside
 * the deployed environment, before the automation is switched on.
 *
 * Two properties matter and are asserted here:
 *   1. it reports what was really fetched and parsed
 *   2. it never mutates the source's health, so running it can neither
 *      clear a real backoff nor mark a healthy source as failed
 */
const hasRealDatabaseUrl =
  !!process.env.DATABASE_URL && !process.env.DATABASE_URL.includes("...");

const db = prisma;

describe.skipIf(!hasRealDatabaseUrl)("admin source verification", () => {
  const suffix = randomUUID().slice(0, 8);
  let origin: OriginServer;
  let sourceId: string;

  function call(id: string) {
    return verifyRoute(
      new NextRequest(`https://zrp.one/api/admin/news-network/sources/${id}/verify`, {
        method: "POST",
      }),
      { params: Promise.resolve({ id }) }
    );
  }

  beforeAll(async () => {
    origin = await startOriginServer();

    const source = await db.newsSource.create({
      data: {
        key: `verify-src-${suffix}`,
        name: "Example Test Authority",
        publisher: "Example Test Authority",
        feedUrl: origin.url("/good.xml"),
        region: "GLOBAL",
        language: "en",
        trustTier: 1,
        official: true,
      },
    });
    sourceId = source.id;
  });

  afterAll(async () => {
    if (!hasRealDatabaseUrl) return;
    await db.newsSource.deleteMany({ where: { key: `verify-src-${suffix}` } });
    await origin.close();
  });

  beforeEach(() => {
    vi.clearAllMocks();
    requireAdmin.mockResolvedValue({
      authorized: true,
      session: { user: { id: "admin-1", username: "admin" } },
    });
  });

  it("rejects a caller who is not an admin", async () => {
    const { NextResponse } = await import("next/server");
    requireAdmin.mockResolvedValue({
      authorized: false,
      response: NextResponse.json({ error: "Forbidden" }, { status: 403 }),
    });

    const response = await call(sourceId);
    expect(response.status).toBe(403);
  });

  it("reports what was really fetched and parsed from the source", async () => {
    const response = await call(sourceId);
    const payload = await response.json();

    expect(response.status).toBe(200);
    expect(payload.ok).toBe(true);
    expect(payload.robotsAllowed).toBe(true);
    expect(payload.itemCount).toBe(2);
    expect(payload.error).toBeNull();

    // A real sample, so an admin can eyeball the parse before trusting it.
    expect(payload.sample[0].title).toBe(
      "Example Test Authority publishes a scheduled maintenance notice"
    );
    expect(payload.sample[0].link).toBe("https://example.test/notices/maintenance");
    expect(payload.sample[0].hasSummary).toBe(true);
  });

  it("publishes nothing and creates no story", async () => {
    const storiesBefore = await db.newsStory.count();
    const postsBefore = await db.post.count();

    await call(sourceId);

    expect(await db.newsStory.count()).toBe(storiesBefore);
    expect(await db.post.count()).toBe(postsBefore);
  });

  it("does not touch the source's health, so it cannot clear a real backoff", async () => {
    // A source that is genuinely failing and backed off.
    const backoffUntil = new Date(Date.now() + 6 * 60 * 60 * 1000);
    await db.newsSource.update({
      where: { id: sourceId },
      data: {
        status: "FAILED",
        consecutiveFailures: 4,
        backoffUntil,
        lastError: "HTTP 500",
      },
    });

    await call(sourceId);

    const after = await db.newsSource.findUniqueOrThrow({ where: { id: sourceId } });
    expect(after.status).toBe("FAILED");
    expect(after.consecutiveFailures).toBe(4);
    expect(after.backoffUntil?.toISOString()).toBe(backoffUntil.toISOString());
    expect(after.lastError).toBe("HTTP 500");

    await db.newsSource.update({
      where: { id: sourceId },
      data: { status: "HEALTHY", consecutiveFailures: 0, backoffUntil: null, lastError: null },
    });
  });

  it("reports a broken feed URL honestly instead of guessing", async () => {
    const broken = await db.newsSource.create({
      data: {
        key: `verify-broken-${suffix}`,
        name: "Broken Fixture",
        publisher: "Broken Fixture",
        feedUrl: origin.url("/500"),
        region: "GLOBAL",
        language: "en",
      },
    });

    try {
      const payload = await (await call(broken.id)).json();
      expect(payload.ok).toBe(false);
      expect(payload.error).toContain("500");
      expect(payload.itemCount).toBe(0);
      expect(payload.sample).toEqual([]);
    } finally {
      await db.newsSource.delete({ where: { id: broken.id } });
    }
  });

  it("reports a feed robots.txt disallows, without fetching it", async () => {
    const strict = await startOriginServer({ robots: "User-agent: *\nDisallow: /\n" });

    const blocked = await db.newsSource.create({
      data: {
        key: `verify-blocked-${suffix}`,
        name: "Blocked Fixture",
        publisher: "Blocked Fixture",
        feedUrl: strict.url("/good.xml"),
        region: "GLOBAL",
        language: "en",
      },
    });

    try {
      const payload = await (await call(blocked.id)).json();
      expect(payload.robotsAllowed).toBe(false);
      expect(payload.ok).toBe(false);
      expect(strict.requests.some((entry) => entry.path.startsWith("/good.xml"))).toBe(false);
    } finally {
      await db.newsSource.delete({ where: { id: blocked.id } });
      await strict.close();
    }
  });

  it("404s for a source that does not exist", async () => {
    const response = await call("does-not-exist");
    expect(response.status).toBe(404);
  });

  it("records the verification in the admin audit log", async () => {
    await call(sourceId);
    expect(logAdminAction).toHaveBeenCalledWith(
      expect.objectContaining({ action: "news_network.source_verify" })
    );
  });
});
