import { describe, it, expect } from "vitest";
import { apiKeyExpiryFor, DEFAULT_KEY_LIFETIME_DAYS, MAX_KEY_LIFETIME_DAYS } from "../api-auth";

const DAY = 24 * 60 * 60 * 1000;
const now = Date.UTC(2026, 0, 1);

// A key's lifetime can no longer be omitted to obtain a never-expiring
// credential, and can't exceed the maximum by asking for a huge number.
describe("apiKeyExpiryFor", () => {
  it("applies the default lifetime when none is requested", () => {
    for (const missing of [undefined, null, 0, -5, "365", NaN, Infinity, {}]) {
      expect(apiKeyExpiryFor(missing, now).getTime()).toBe(now + DEFAULT_KEY_LIFETIME_DAYS * DAY);
    }
  });

  it("honours a requested lifetime within the cap", () => {
    expect(apiKeyExpiryFor(30, now).getTime()).toBe(now + 30 * DAY);
    expect(apiKeyExpiryFor(1, now).getTime()).toBe(now + 1 * DAY);
    expect(apiKeyExpiryFor(0.5, now).getTime()).toBe(now + 1 * DAY);
  });

  it("clamps an oversized lifetime to the maximum (no effectively-permanent keys)", () => {
    expect(apiKeyExpiryFor(10_000, now).getTime()).toBe(now + MAX_KEY_LIFETIME_DAYS * DAY);
    expect(apiKeyExpiryFor(Number.MAX_SAFE_INTEGER, now).getTime()).toBe(now + MAX_KEY_LIFETIME_DAYS * DAY);
  });

  it("never returns a null/undefined expiry", () => {
    expect(apiKeyExpiryFor(undefined, now)).toBeInstanceOf(Date);
    expect(Number.isNaN(apiKeyExpiryFor(undefined, now).getTime())).toBe(false);
  });
});
