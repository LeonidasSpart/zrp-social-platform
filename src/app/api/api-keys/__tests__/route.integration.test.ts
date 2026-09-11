import { describe, it, expect, vi, afterAll, beforeEach } from "vitest";
import { NextRequest } from "next/server";
import { randomUUID } from "crypto";
import { prisma } from "@/lib/db";

const { getVerifiedToken } = vi.hoisted(() => ({ getVerifiedToken: vi.fn() }));
vi.mock("@/lib/auth-guards", () => ({ getVerifiedToken }));

import { GET, POST } from "../route";

const hasRealDatabaseUrl =
  !!process.env.DATABASE_URL && !process.env.DATABASE_URL.includes("...");

function postRequest(body: unknown) {
  return new NextRequest("https://zrp.one/api/api-keys", {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify(body),
  });
}

function getRequest() {
  return new NextRequest("https://zrp.one/api/api-keys", { method: "GET" });
}

// The active-key cap (MAX_ACTIVE_KEYS_PER_USER = 10) used to be enforced
// by counting then creating as two separate, non-atomic steps - two
// concurrent POSTs could both read a count under the limit and both
// insert, letting an account exceed it. Fixed with a Serializable
// transaction (see route.ts); these tests prove the invariant holds
// under real concurrency, not just sequentially.
describe.skipIf(!hasRealDatabaseUrl)("POST/GET /api/api-keys (integration, real Postgres)", () => {
  const suffix = randomUUID().slice(0, 8);
  const userIds: string[] = [];

  async function createBusinessUser(label: string) {
    const user = await prisma.user.create({
      data: {
        email: `${label}-${suffix}@apikeytest.example`,
        username: `${label}${suffix}`.slice(0, 20),
        password: "x",
        plan: "business",
      },
    });
    userIds.push(user.id);
    return user;
  }

  afterAll(async () => {
    await prisma.apiKey.deleteMany({ where: { userId: { in: userIds } } });
    await prisma.user.deleteMany({ where: { id: { in: userIds } } });
  });

  beforeEach(() => {
    getVerifiedToken.mockReset();
  });

  it("never lets concurrent requests exceed the active-key cap", async () => {
    const user = await createBusinessUser("racekeys");
    getVerifiedToken.mockResolvedValue({ id: user.id });

    // 15 concurrent creation attempts against a cap of 10 - a race would
    // let more than 10 rows land; the fix must cap it at exactly 10.
    const results = await Promise.all(
      Array.from({ length: 15 }, (_, i) => POST(postRequest({ name: `key-${i}` })))
    );

    const statuses = results.map((r) => r.status);
    const succeeded = statuses.filter((s) => s === 200).length;
    const rejectedAtCap = statuses.filter((s) => s === 400).length;
    const conflicted = statuses.filter((s) => s === 409).length;

    // The invariant that actually matters: the cap is never exceeded,
    // and every request got a real, non-500 answer (success, correctly
    // rejected at the cap, or asked to retry after exhausting the
    // in-request retry budget under heavy contention).
    expect(succeeded).toBeLessThanOrEqual(10);
    expect(succeeded + rejectedAtCap + conflicted).toBe(15);
    expect(statuses.every((s) => s === 200 || s === 400 || s === 409)).toBe(true);

    const activeCount = await prisma.apiKey.count({
      where: { userId: user.id, revoked: false },
    });
    expect(activeCount).toBe(succeeded);
    expect(activeCount).toBeLessThanOrEqual(10);
  }, 30000);

  it("rejects a request once the cap is already reached", async () => {
    const user = await createBusinessUser("atcapkeys");
    getVerifiedToken.mockResolvedValue({ id: user.id });

    for (let i = 0; i < 10; i++) {
      const res = await POST(postRequest({ name: `key-${i}` }));
      expect(res.status).toBe(200);
    }

    const res = await POST(postRequest({ name: "one-too-many" }));
    expect(res.status).toBe(400);
    const body = await res.json();
    expect(body.error).toMatch(/at most 10 active API keys/);
  }, 30000);

  it("returns 401 for an unauthenticated request", async () => {
    getVerifiedToken.mockResolvedValueOnce(null);
    const res = await POST(postRequest({ name: "x" }));
    expect(res.status).toBe(401);
  });

  it("returns 403 for a free-plan user without API access", async () => {
    const user = await prisma.user.create({
      data: {
        email: `freeuser-${suffix}@apikeytest.example`,
        username: `freeuser${suffix}`.slice(0, 20),
        password: "x",
        plan: "free",
      },
    });
    userIds.push(user.id);
    getVerifiedToken.mockResolvedValue({ id: user.id });

    const res = await POST(postRequest({ name: "x" }));
    expect(res.status).toBe(403);
  });

  it("GET only ever lists the caller's own non-revoked keys", async () => {
    const user = await createBusinessUser("listkeys");
    getVerifiedToken.mockResolvedValue({ id: user.id });

    await POST(postRequest({ name: "listed-key" }));

    const res = await GET(getRequest());
    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body.keys.length).toBe(1);
    expect(body.keys[0].name).toBe("listed-key");
  });
});
