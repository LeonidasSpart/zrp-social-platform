import { describe, it, expect, vi } from "vitest";
import { NextRequest } from "next/server";

// getVerifiedToken is mocked (this test is about the rate limiter, not
// auth) - rateLimit() itself is real, same reasoning as
// src/app/api/discover/__tests__/rate-limit.test.ts.
const { getToken } = vi.hoisted(() => ({ getToken: vi.fn() }));
vi.mock("next-auth/jwt", () => ({ getToken }));

import { POST } from "../route";

function ipFor(testIndex: number) {
  return `198.51.100.${100 + testIndex}`;
}

function req(ip: string, body: unknown = { postId: "does-not-exist", eventType: "IMPRESSION" }) {
  return new NextRequest("https://zrp.one/api/discover/events", {
    method: "POST",
    headers: { "x-forwarded-for": ip, "content-type": "application/json" },
    body: JSON.stringify(body),
  });
}

describe("POST /api/discover/events rate limiting", () => {
  it("rejects with 429 once the per-IP threshold (120/min) is exceeded", async () => {
    getToken.mockResolvedValue(null);
    const ip = ipFor(1);

    const statuses: number[] = [];
    for (let i = 0; i < 121; i++) {
      const res = await POST(req(ip));
      statuses.push(res.status);
    }

    expect(statuses.slice(0, 120).every((s) => s !== 429)).toBe(true);
    expect(statuses[120]).toBe(429);
  });

  it("rate-limit buckets are isolated per IP", async () => {
    getToken.mockResolvedValue(null);
    const ipA = ipFor(2);
    const ipB = ipFor(3);

    for (let i = 0; i < 120; i++) {
      await POST(req(ipA));
    }
    const stillOkForB = await POST(req(ipB));
    expect(stillOkForB.status).not.toBe(429);
  });
});
