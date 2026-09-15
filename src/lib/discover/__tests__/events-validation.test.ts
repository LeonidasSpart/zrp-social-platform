import { describe, it, expect } from "vitest";
import { isDiscoverEventType, normalizeWatchedMs, DISCOVER_EVENT_TYPES } from "../events";

describe("isDiscoverEventType", () => {
  it("accepts every real DiscoverEventType value", () => {
    for (const type of DISCOVER_EVENT_TYPES) {
      expect(isDiscoverEventType(type)).toBe(true);
    }
  });

  it.each([undefined, null, 123, {}, [], "", "LIKE", "impression", " IMPRESSION"])(
    "rejects %p",
    (value) => {
      expect(isDiscoverEventType(value)).toBe(false);
    }
  );
});

describe("normalizeWatchedMs", () => {
  it("passes through a plausible value, rounded", () => {
    expect(normalizeWatchedMs(1234.6)).toBe(1235);
  });

  it("treats missing/null as null (no watch-time reported)", () => {
    expect(normalizeWatchedMs(undefined)).toBeNull();
    expect(normalizeWatchedMs(null)).toBeNull();
  });

  it("rejects non-numeric, NaN, Infinity and negative values as null", () => {
    expect(normalizeWatchedMs("1000")).toBeNull();
    expect(normalizeWatchedMs(NaN)).toBeNull();
    expect(normalizeWatchedMs(Infinity)).toBeNull();
    expect(normalizeWatchedMs(-1)).toBeNull();
  });

  it("clamps an implausibly large client-reported value instead of storing it as-is", () => {
    const oneHourMs = 60 * 60 * 1000;
    const result = normalizeWatchedMs(oneHourMs);
    expect(result).not.toBeNull();
    expect(result as number).toBeLessThanOrEqual(30 * 60 * 1000);
  });
});
