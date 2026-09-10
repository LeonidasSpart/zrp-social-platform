import { describe, it, expect, beforeEach } from "vitest";
import { checkRateLimitKey, refundRateLimitKey } from "../rate-limit";

// The login limiter must count guesses, not logins: an attempt whose
// password verified is refunded. Exercised against the in-process
// limiter (no REDIS_URL in the test environment) - the Redis branch is
// the same DECR-with-floor semantics against a real server.

beforeEach(() => {
  delete process.env.REDIS_URL;
  delete process.env.REDIS_PUBLIC_URL;
});

describe("refundRateLimitKey", () => {
  it("gives an admission back so successful use never exhausts the budget", async () => {
    const key = `refund-ok-${Date.now()}-${Math.random()}`;
    for (let i = 0; i < 20; i++) {
      const result = await checkRateLimitKey(key, 3, 60);
      expect(result.success).toBe(true);
      await refundRateLimitKey(key);
    }
  });

  it("does not undo failed attempts: the limit still trips on unrefunded hits", async () => {
    const key = `refund-fail-${Date.now()}-${Math.random()}`;
    expect((await checkRateLimitKey(key, 2, 60)).success).toBe(true);
    expect((await checkRateLimitKey(key, 2, 60)).success).toBe(true);
    expect((await checkRateLimitKey(key, 2, 60)).success).toBe(false);
  });

  it("never takes a bucket below zero", async () => {
    const key = `refund-floor-${Date.now()}-${Math.random()}`;
    await refundRateLimitKey(key);
    await refundRateLimitKey(key);
    expect((await checkRateLimitKey(key, 1, 60)).success).toBe(true);
    expect((await checkRateLimitKey(key, 1, 60)).success).toBe(false);
  });
});
