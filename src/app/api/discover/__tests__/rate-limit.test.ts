import { describe, it, expect, vi } from "vitest";
import { NextRequest } from "next/server";

// getServerSession is mocked (this test is about the rate limiter, not
// auth), but rateLimit() itself is NOT mocked - these calls exercise
// the real limiter (src/lib/rate-limit.ts), falling back to its
// in-memory bucket when Redis is unavailable, same as
// src/app/api/turn-credentials/__tests__/route.test.ts already does for
// the same reason: the assertions below must prove the actual
// configured threshold, not a stand-in for it.
const { getServerSession } = vi.hoisted(() => ({ getServerSession: vi.fn() }));
vi.mock("next-auth", () => ({ getServerSession }));
vi.mock("@/lib/auth", () => ({ authOptions: {} }));

import { GET } from "../route";

// A distinct, deterministic fake IPv4 per test so each test's rate-limit
// bucket is isolated from every other test in this file/run.
function ipFor(testIndex: number) {
  return `198.51.100.${testIndex}`;
}

function req(ip: string) {
  return new NextRequest("https://zrp.one/api/discover", {
    headers: { "x-forwarded-for": ip },
  });
}

describe("GET /api/discover rate limiting", () => {
  it("rejects with 429 once the per-IP feed threshold (60/min) is exceeded", async () => {
    getServerSession.mockResolvedValue(null);
    const ip = ipFor(1);

    const statuses: number[] = [];
    for (let i = 0; i < 61; i++) {
      const res = await GET(req(ip));
      statuses.push(res.status);
    }

    // First 60 calls are admitted by the rate limiter (whatever happens
    // downstream, e.g. a DB error in a DB-less test environment, is a
    // separate concern from the limiter itself - anything other than
    // 429 proves the limiter let the request through).
    expect(statuses.slice(0, 60).every((s) => s !== 429)).toBe(true);
    expect(statuses[60]).toBe(429);
  });

  it("a 429 response includes standard rate-limit headers and a safe JSON body", async () => {
    getServerSession.mockResolvedValue(null);
    const ip = ipFor(2);

    let last: Response | undefined;
    for (let i = 0; i < 61; i++) {
      last = await GET(req(ip));
    }

    expect(last!.status).toBe(429);
    expect(last!.headers.get("Retry-After")).toBeTruthy();
    const body = await last!.json();
    expect(body).toHaveProperty("error");
    expect(JSON.stringify(body)).not.toMatch(/stack|prisma|postgres/i);
  });

  it("rate-limit buckets are isolated per IP", async () => {
    getServerSession.mockResolvedValue(null);
    const ipA = ipFor(3);
    const ipB = ipFor(4);

    for (let i = 0; i < 60; i++) {
      await GET(req(ipA));
    }
    const stillOkForB = await GET(req(ipB));
    expect(stillOkForB.status).not.toBe(429);
  });
});
