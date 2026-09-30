import { describe, it, expect, beforeEach, vi } from "vitest";
import { NextRequest } from "next/server";

// No REDIS_URL is set in the test environment, so getRedisClient()
// resolves to null and every call below exercises the in-memory
// local-fallback limiter - the exact path that previously failed open
// (allowed everything) when Redis was unavailable.
delete process.env.REDIS_URL;
delete process.env.REDIS_PUBLIC_URL;

describe("checkRateLimitKey (local fallback, no Redis configured)", () => {
  beforeEach(() => {
    vi.resetModules();
  });

  it("allows requests up to the limit", async () => {
    const { checkRateLimitKey } = await import("../rate-limit");
    const key = `test-${Math.random()}`;
    for (let i = 0; i < 5; i++) {
      const result = await checkRateLimitKey(key, 5, 60);
      expect(result.success).toBe(true);
    }
  });

  it("blocks the request once the limit is exceeded (fails closed, not open)", async () => {
    const { checkRateLimitKey } = await import("../rate-limit");
    const key = `test-${Math.random()}`;
    for (let i = 0; i < 3; i++) {
      await checkRateLimitKey(key, 3, 60);
    }
    const blocked = await checkRateLimitKey(key, 3, 60);
    expect(blocked.success).toBe(false);
    expect(blocked.retryAfter).toBeGreaterThan(0);
  });

  it("tracks separate keys independently", async () => {
    const { checkRateLimitKey } = await import("../rate-limit");
    const keyA = `test-a-${Math.random()}`;
    const keyB = `test-b-${Math.random()}`;
    for (let i = 0; i < 3; i++) await checkRateLimitKey(keyA, 3, 60);

    const aBlocked = await checkRateLimitKey(keyA, 3, 60);
    const bAllowed = await checkRateLimitKey(keyB, 3, 60);

    expect(aBlocked.success).toBe(false);
    expect(bAllowed.success).toBe(true);
  });
});

// Regression coverage for the master audit's rate-limit rollout: several
// previously-unprotected write endpoints (posts, comments, messages,
// listings, tips, withdrawals, reports) now key on both the caller's IP
// AND their user id, so one account can't dodge the limit by rotating
// IPs. rateLimitByIpAndUser itself, isolated from any one route's own
// shared test-file IP bucket, is what's under test here.
describe("rateLimitByIpAndUser (local fallback, no Redis configured)", () => {
  beforeEach(() => {
    vi.resetModules();
  });

  function req(ip: string) {
    return new NextRequest("https://zrp.one/api/whatever", {
      headers: { "x-forwarded-for": ip },
    });
  }

  it("allows requests up to the limit for one ip+user pair", async () => {
    const { rateLimitByIpAndUser } = await import("../rate-limit");
    const userId = `user-${Math.random()}`;
    for (let i = 0; i < 3; i++) {
      const result = await rateLimitByIpAndUser(req("203.0.113.10"), userId, { limit: 3, window: 60, type: `rl-test-${userId}` });
      expect(result.success).toBe(true);
    }
    const blocked = await rateLimitByIpAndUser(req("203.0.113.10"), userId, { limit: 3, window: 60, type: `rl-test-${userId}` });
    expect(blocked.success).toBe(false);
  });

  it("blocks the same account even after it rotates its IP", async () => {
    const { rateLimitByIpAndUser } = await import("../rate-limit");
    const userId = `user-${Math.random()}`;
    const type = `rl-test-rotate-${userId}`;
    for (let i = 0; i < 3; i++) {
      const result = await rateLimitByIpAndUser(req(`203.0.113.${i}`), userId, { limit: 3, window: 60, type });
      expect(result.success).toBe(true);
    }
    // A brand-new IP for this same account - still blocked, because the
    // per-user bucket (not just the per-IP one) is now exhausted.
    const blocked = await rateLimitByIpAndUser(req("203.0.113.99"), userId, { limit: 3, window: 60, type });
    expect(blocked.success).toBe(false);
  });

  it("blocks a single IP hammering the endpoint across many different accounts", async () => {
    const { rateLimitByIpAndUser } = await import("../rate-limit");
    const type = `rl-test-shared-ip-${Math.random()}`;
    const ip = "203.0.113.50";
    for (let i = 0; i < 3; i++) {
      const result = await rateLimitByIpAndUser(req(ip), `user-${i}-${Math.random()}`, { limit: 3, window: 60, type });
      expect(result.success).toBe(true);
    }
    // A brand-new account from the same IP - still blocked by the
    // per-IP bucket.
    const blocked = await rateLimitByIpAndUser(req(ip), `user-new-${Math.random()}`, { limit: 3, window: 60, type });
    expect(blocked.success).toBe(false);
  });

  it("tracks independent accounts on independent IPs separately", async () => {
    const { rateLimitByIpAndUser } = await import("../rate-limit");
    const type = `rl-test-independent-${Math.random()}`;
    const userA = `user-a-${Math.random()}`;
    for (let i = 0; i < 3; i++) await rateLimitByIpAndUser(req("203.0.113.11"), userA, { limit: 3, window: 60, type });

    const aBlocked = await rateLimitByIpAndUser(req("203.0.113.11"), userA, { limit: 3, window: 60, type });
    const bAllowed = await rateLimitByIpAndUser(req("203.0.113.12"), `user-b-${Math.random()}`, { limit: 3, window: 60, type });

    expect(aBlocked.success).toBe(false);
    expect(bAllowed.success).toBe(true);
  });
});
