import { describe, it, expect, beforeEach, vi } from "vitest";

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
